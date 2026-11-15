"""Structured JSON logging for CloudWatch Logs.

One JSON object per line makes entries searchable with CloudWatch Logs Insights,
for example: fields @timestamp, operation, status | filter requestId = "...".
Never pass passwords, tokens, or note title/content to these functions.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

_LOGGER_NAME = "notes_api"


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            entry.update(fields)
        if record.exc_info:
            entry["stackTrace"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


class StdoutHandler(logging.Handler):
    """Write to whatever sys.stdout is *now* (Lambda forwards stdout to CloudWatch Logs)."""

    def emit(self, record: logging.LogRecord) -> None:
        sys.stdout.write(self.format(record) + "\n")


def get_logger(level: str = "INFO") -> logging.Logger:
    """Return the application logger, configuring it on first use."""
    logger = logging.getLogger(_LOGGER_NAME)
    if not logger.handlers:
        handler = StdoutHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
        logger.propagate = False
    logger.setLevel(level)
    return logger


def log_event(
    logger: logging.Logger,
    level: int,
    message: str,
    *,
    exc_info: bool = False,
    **fields: Any,
) -> None:
    """Log `message` with structured key/value `fields`."""
    logger.log(level, message, extra={"fields": fields}, exc_info=exc_info)
