"""
JSON structured logging for PDV2Cloud agent.
"""
import json
import logging
from datetime import datetime
from typing import Any, Dict


class JSONFormatter(logging.Formatter):
    """
    Custom JSON formatter for structured logging.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "component": record.name,
            "message": record.getMessage(),
        }

        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add extra context fields
        if hasattr(record, "context"):
            log_data["context"] = record.context

        # Add specific fields for agent events
        if hasattr(record, "event_type"):
            log_data["event_type"] = record.event_type

        if hasattr(record, "file_path"):
            log_data["file_path"] = record.file_path

        if hasattr(record, "chave_nfe"):
            log_data["chave_nfe"] = record.chave_nfe

        if hasattr(record, "status"):
            log_data["status"] = record.status

        if hasattr(record, "duration_ms"):
            log_data["duration_ms"] = record.duration_ms

        return json.dumps(log_data, ensure_ascii=False)


def configure_json_logging(logger: logging.Logger, log_file_path: str) -> None:
    """
    Configure JSON structured logging for a logger.

    Args:
        logger: Logger instance to configure
        log_file_path: Path to the log file
    """
    handler = logging.handlers.RotatingFileHandler(
        log_file_path,
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=7,
        encoding="utf-8",
    )
    formatter = JSONFormatter()
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def log_event(logger: logging.Logger, level: str, message: str, **kwargs) -> None:
    """
    Log a structured event with additional context.

    Args:
        logger: Logger instance
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        message: Log message
        **kwargs: Additional context fields
    """
    log_func = getattr(logger, level.lower())
    extra = {"context": kwargs}
    log_func(message, extra=extra)
