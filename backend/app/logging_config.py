"""Structured JSON logging for the Ao5 backend (audit I.6).

Hand-rolled via stdlib so we avoid pulling in python-json-logger or
structlog.

- JsonFormatter: a logging.Formatter subclass that emits one JSON object
  per record. Pulls request_id and user_id off flask.g when a request
  context is active.
- configure_logging(level): install the formatter on the root logger via
  logging.config.dictConfig.

request_id is set by a before_request hook in app/__init__.py;
user_id is set by require_auth in app/routes/solves.py.
"""
from __future__ import annotations

import json
import logging
import logging.config
from datetime import datetime, timezone
from typing import Any


class JsonFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc,
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Flask request context, if any.
        try:
            from flask import g, has_request_context
            if has_request_context():
                request_id = getattr(g, "request_id", None)
                if request_id is not None:
                    payload["request_id"] = request_id
                user_id = getattr(g, "user_id", None)
                if user_id is not None:
                    payload["user_id"] = user_id
        except RuntimeError:
            # Outside an application context; skip silently.
            pass

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Install JsonFormatter on the root + werkzeug loggers via dictConfig."""
    logging.config.dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "json": {
                "()": "app.logging_config.JsonFormatter",
            },
        },
        "handlers": {
            "stdout": {
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
                "formatter": "json",
            },
        },
        "root": {
            "level": level,
            "handlers": ["stdout"],
        },
        "loggers": {
            "werkzeug": {
                "level": "WARNING",
                "handlers": ["stdout"],
                "propagate": False,
            },
        },
    })
