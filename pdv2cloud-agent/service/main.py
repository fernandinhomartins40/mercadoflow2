import json
import logging
import logging.handlers
import time
from datetime import datetime
from pathlib import Path
import threading
import schedule
from http.server import HTTPServer, BaseHTTPRequestHandler

from .config import load_config_secure, save_config
from .crypto import SecureConfig
from .queue_manager import QueueManager
from .watcher import FileWatcher
from .transmitter import APITransmitter
from .messages import classify_error, get_friendly_error, STATUS_MESSAGES
from .json_logger import configure_json_logging
from .updater import UpdateChecker

STATUS_FILE = Path("C:/ProgramData/PDV2Cloud/status.json")
LOG_DIR = Path("C:/ProgramData/PDV2Cloud/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("PDV2Cloud")
configure_json_logging(logger, str(LOG_DIR / "agent.log"))


def update_status(queue_manager: QueueManager, online: bool, last_processed: str | None, last_error: dict | None = None) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    queue_stats = {
        "total": 0,
        "pending": 0,
        "processing": 0,
        "sent": 0,
        "error": 0,
        "dead_letter": 0,
        **(queue_manager.stats() or {}),
    }

    # Determine user-friendly status message
    if not online:
        status_msg = STATUS_MESSAGES["offline"]
    elif queue_stats.get("error", 0) > 0:
        status_msg = STATUS_MESSAGES["error"]
    elif queue_stats.get("pending", 0) > 0 or queue_stats.get("processing", 0) > 0:
        status_msg = STATUS_MESSAGES["processing"]
    else:
        status_msg = STATUS_MESSAGES["idle"] if queue_stats.get("total", 0) == 0 else STATUS_MESSAGES["online"]

    status = {
        "timestamp": datetime.utcnow().isoformat(),
        "online": online,
        "status_message": status_msg,
        "queue": queue_stats,
        "last_processed": last_processed,
        "last_error": last_error,
    }
    STATUS_FILE.write_text(json.dumps(status, indent=2), encoding="utf-8")


class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/health":
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(STATUS_FILE.read_bytes() if STATUS_FILE.exists() else b"{}")


class ServiceApp:
    def __init__(self):
        self.secure_config = SecureConfig()

        # Load config with fallback to defaults if not configured yet
        try:
            self.config = load_config_secure(self.secure_config)
        except FileNotFoundError:
            logger.warning("Configuration file not found. Service will run in standby mode until configured.")
            self.config = {
                "api_url": "",
                "api_key": "",
                "market_id": "",
                "watch_paths": [],
                "xsd_paths": [],
                "retry_interval_minutes": 5,
                "poll_interval_seconds": 10,
                "healthcheck_enabled": True,
                "healthcheck_port": 8765,
                "auto_update_enabled": True
            }

        api_key = self.config.get("api_key", "")
        if not api_key:
            logger.warning("API key not configured. Service running in standby mode.")

        self.queue_manager = QueueManager()
        self.file_watcher = FileWatcher(
            self.config.get("watch_paths", []),
            self.queue_manager,
            self.config.get("xsd_paths", []),
        )
        self.transmitter = APITransmitter(
            self.config.get("api_url", ""),
            self.config.get("api_key", ""),
            self.config.get("market_id", ""),
        )
        self.stop_event = threading.Event()
        self.online = False
        self.last_processed = None
        self.last_error = None
        configured_api_url = self.config.get("api_url") or None
        self.update_checker = UpdateChecker(base_url=configured_api_url)

    def start(self):
        logger.info("Starting PDV2Cloud service")

        # Wrap entire startup in try-catch to prevent Windows Service Control Manager timeout
        try:
            try:
                recovered = self.queue_manager.reset_stuck_processing(max_age_minutes=60)
                if recovered:
                    logger.info("Recovered %s stuck items back to PENDING", recovered)
                deleted = self.queue_manager.cleanup_sent(max_age_days=30)
                if deleted:
                    logger.info("Cleaned up %s SENT items older than retention window", deleted)
            except Exception as exc:
                logger.warning("Queue maintenance failed: %s", exc)

            self.file_watcher.start()
            try:
                scanned = self.file_watcher.scan_existing()
                if scanned:
                    logger.info("Initial scan enqueued %s existing files", scanned)
            except Exception as exc:
                logger.warning("Initial scan failed: %s", exc)

            threading.Thread(target=self.file_watcher.loop, args=(self.stop_event,), daemon=True).start()

            # Hydrate agent config in background (fetch market_id from API if needed)
            if self.config.get("api_key") and not self.config.get("market_id"):
                threading.Thread(target=self._hydrate_agent_config, daemon=True).start()

            schedule.every(self.config.get("retry_interval_minutes", 5)).minutes.do(self._retry_errors)
            schedule.every().day.at("03:00").do(lambda: self.queue_manager.cleanup_sent(max_age_days=30))
            schedule.every(2).minutes.do(self._send_heartbeat)
            schedule.every().day.at("04:00").do(self._check_for_updates)  # Check for updates daily at 4 AM
            update_status(self.queue_manager, self.online, self.last_processed, self.last_error)

            # Validate connectivity early so the desktop UI doesn't remain in an
            # offline state until the first successful invoice transmission.
            threading.Thread(target=self._initial_connectivity_probe, daemon=True).start()

            if self.config.get("healthcheck_enabled", True):
                threading.Thread(target=self._start_health_server, daemon=True).start()

            # Run main loop in background thread to avoid blocking Windows Service Control Manager
            threading.Thread(target=self._main_loop, daemon=False).start()
            logger.info("PDV2Cloud service started successfully")
        except Exception as exc:
            logger.error("CRITICAL: Service startup failed: %s", exc, exc_info=True)
            # Still allow service to start but in degraded mode
            # This prevents Error 1053 timeout
            logger.warning("Service running in degraded mode - check logs for errors")

    def _main_loop(self):
        """Main processing loop - runs in background thread"""
        while not self.stop_event.is_set():
            self.process_queue()
            schedule.run_pending()
            update_status(self.queue_manager, self.online, self.last_processed, self.last_error)
            time.sleep(self.config.get("poll_interval_seconds", 10))

    def stop(self):
        self.stop_event.set()
        self.file_watcher.stop()
        logger.info("PDV2Cloud service stopped")

    def process_queue(self):
        pending = self.queue_manager.next_pending(50)
        if not pending:
            return

        for item in pending:
            self.queue_manager.mark_processing(item.id)
            payload = json.loads(item.payload_json)
            try:
                ok = self.transmitter.send_invoice(payload)
                if ok:
                    self.online = True
                    self.last_error = None
                    self.queue_manager.mark_sent(item.id)
                    self.last_processed = datetime.utcnow().isoformat()
                else:
                    self.online = False
                    dead = item.tentativas + 1 >= 5
                    error_msg = get_friendly_error("unknown_error")
                    self.last_error = error_msg
                    self.queue_manager.mark_error(item.id, error_msg["message"], dead_letter=dead)
            except Exception as exc:
                self.online = False
                error_type = classify_error(exc)
                error_msg = get_friendly_error(error_type, str(exc))
                self.last_error = error_msg
                dead = item.tentativas + 1 >= 5
                self.queue_manager.mark_error(item.id, error_msg["message"], dead_letter=dead)
                logger.error("Processing error: %s", error_msg["technical"])

    def _retry_errors(self):
        self.queue_manager.reset_errors()

    def _send_heartbeat(self):
        api_url = self.config.get("api_url")
        api_key = self.config.get("api_key")
        if not api_url or not api_key:
            self.online = False
            update_status(self.queue_manager, self.online, self.last_processed, self.last_error)
            return

        try:
            heartbeat_ok = self.transmitter.send_heartbeat()
            self.online = bool(heartbeat_ok)
            if heartbeat_ok:
                self.last_error = None
        except Exception as exc:
            self.online = False
            logger.debug("Heartbeat failed: %s", exc)
        finally:
            update_status(self.queue_manager, self.online, self.last_processed, self.last_error)

    def _initial_connectivity_probe(self):
        try:
            self._send_heartbeat()
        except Exception as exc:
            logger.debug("Initial connectivity probe failed: %s", exc)

    def _check_for_updates(self):
        """Check for updates and install automatically if enabled."""
        try:
            auto_update_enabled = self.config.get("auto_update_enabled", True)
            if not auto_update_enabled:
                logger.info("Auto-update is disabled in configuration")
                return

            logger.info("Checking for updates...")
            if self.update_checker.perform_auto_update():
                logger.info("Update installed successfully. Service will restart.")
                # The installer will restart the service automatically
            else:
                logger.info("No updates performed")
        except Exception as exc:
            logger.error("Update check failed: %s", exc)

    def _start_health_server(self):
        try:
            port = int(self.config.get("healthcheck_port", 8765))
            server = HTTPServer(("localhost", port), HealthHandler)
            logger.info("Health check server listening on localhost:%d", port)
            server.serve_forever()
        except Exception as exc:
            logger.error("Health check server failed to start: %s", exc)
            # Don't crash the entire service if health check fails

    def _hydrate_agent_config(self):
        if self.config.get("market_id"):
            return
        api_key = self.config.get("api_key")
        api_url = self.config.get("api_url")
        if not api_key or not api_url:
            return
        try:
            transmitter = APITransmitter(
                api_url,
                api_key,
                self.config.get("market_id", ""),
            )
            profile = transmitter.get_agent_profile()
            market_id = profile.get("marketId")
            if market_id:
                self.config["market_id"] = market_id
                save_config(self.config)
        except Exception as exc:
            logger.warning("Nao foi possivel resolver o mercado via API: %s", exc)


if __name__ == "__main__":
    app = ServiceApp()
    try:
        app.start()
    except KeyboardInterrupt:
        app.stop()
