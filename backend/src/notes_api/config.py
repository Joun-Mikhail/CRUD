"""Explicit runtime configuration, read once from environment variables."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

# Validation limits (documented in docs/api/API.md).
TITLE_MAX_LENGTH = 200
CONTENT_MAX_LENGTH = 20_000
# Worst case body: 20,200 characters * 4 bytes (UTF-8) + JSON escaping overhead.
MAX_BODY_BYTES = 128 * 1024
PAGE_SIZE_DEFAULT = 20
PAGE_SIZE_MAX = 100


@dataclass(frozen=True)
class Settings:
    """Deployment-specific settings injected by the SAM template."""

    table_name: str
    user_index_name: str
    cors_allow_origin: str
    log_level: str


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    """Build Settings from the environment. Raises KeyError if a required value is absent."""
    source = os.environ if env is None else env
    return Settings(
        table_name=source["NOTES_TABLE_NAME"],
        user_index_name=source.get("NOTES_USER_INDEX_NAME", "byUser"),
        cors_allow_origin=source.get("CORS_ALLOW_ORIGIN", "http://localhost:5173"),
        log_level=source.get("LOG_LEVEL", "INFO").upper(),
    )
