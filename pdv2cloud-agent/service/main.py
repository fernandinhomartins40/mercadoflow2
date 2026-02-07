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

STATUS_FILE = Path("C:/ProgramData/PDV2Cloud/status.json")
LOG_DIR = Path("C:/ProgramData/PDV2Cloud/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logger = logging.getLogger("PDV2Cloud")
handler = logging.handlers.RotatingFileHandler(
    LOG_DIR / "agent.log",
    maxBytes=10 * 1024 * 1024,
    backupCount=7,
)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)


def update_status(queue_manager: QueueManager, online: bool, last_processed: str | None) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    status = {
        "timestamp": datetime.utcnow().isoformat(),
        "online": online,
        "queue": queue_manager.stats(),
        "last_processed": last_processed,
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
        self.config = load_config_secure(self.secure_config)
        api_key = self.config.get("api_key", "")
        if not api_key:
            logger.error("API key nao configurada")
        self._hydrate_agent_config()
        self.queue_manager = QueueManager()
        self.file_watcher = FileWatcher(
            self.config["watch_paths"],
            self.queue_manager,
            self.config.get("xsd_paths", []),
        )
        self.transmitter = APITransmitter(
            self.config["api_url"],
            self.config.get("api_key", ""),
            self.config.get("market_id", ""),
            self.config.get("api_key", "dev-hmac"),
        )
        self.stop_event = threading.Event()
        self.online = False
        self.last_processed = None

    def start(self):
        logger.info("Starting PDV2Cloud service")
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
        schedule.every(self.config.get("retry_interval_minutes", 5)).minutes.do(self._retry_errors)
        schedule.every().day.at("03:00").do(lambda: self.queue_manager.cleanup_sent(max_age_days=30))
        schedule.every(1).minutes.do(lambda: update_status(self.queue_manager, self.online, self.last_processed))
        update_status(self.queue_manager, self.online, self.last_processed)

        if self.config.get("healthcheck_enabled", True):
            threading.Thread(target=self._start_health_server, daemon=True).start()

        while not self.stop_event.is_set():
            self.process_queue()
            schedule.run_pending()
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
            ok = self.transmitter.send_invoice(payload)
            if ok:
                self.online = True
                self.queue_manager.mark_sent(item.id)
                self.last_processed = datetime.utcnow().isoformat()
            else:
                self.online = False
                dead = item.tentativas + 1 >= 5
                self.queue_manager.mark_error(item.id, "Failed to transmit", dead_letter=dead)

    def _retry_errors(self):
        self.queue_manager.reset_errors()

    def _start_health_server(self):
        port = int(self.config.get("healthcheck_port", 8765))
        server = HTTPServer(("localhost", port), HealthHandler)
        server.serve_forever()

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
                api_key,
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
