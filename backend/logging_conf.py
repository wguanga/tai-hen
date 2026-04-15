"""Logging setup. See .claude/backend-guide.md#5-日志配置."""
import logging
import logging.config
import os
import sys

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "std": {"format": "%(asctime)s [%(levelname)s] %(name)s :: %(message)s"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": sys.stderr,
            "formatter": "std",
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": "data/logs/app.log",
            "maxBytes": 5_000_000,
            "backupCount": 3,
            "formatter": "std",
            "encoding": "utf-8",
        },
    },
    "root": {"level": "INFO", "handlers": ["console", "file"]},
    "loggers": {
        "uvicorn.access": {"level": "WARNING"},
        "sqlalchemy.engine": {"level": "WARNING"},
    },
}


def setup() -> None:
    os.makedirs("data/logs", exist_ok=True)
    logging.config.dictConfig(LOGGING)
