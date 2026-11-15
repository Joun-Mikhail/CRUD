"""Composition root: builds the real dependency graph once per Lambda execution
environment (boto3 clients are expensive to create, so they are reused across
warm invocations)."""

from __future__ import annotations

from functools import lru_cache

import boto3

from notes_api.config import Settings, load_settings
from notes_api.repositories.notes_repository import DynamoNotesRepository
from notes_api.services.notes_service import NotesService


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()


@lru_cache(maxsize=1)
def get_service() -> NotesService:
    settings = get_settings()
    table = boto3.resource("dynamodb").Table(settings.table_name)
    return NotesService(DynamoNotesRepository(table, settings.user_index_name))


def cors_allow_origin() -> str:
    return get_settings().cors_allow_origin


def log_level() -> str:
    return get_settings().log_level


def reset() -> None:
    """Forget cached settings and clients (used by tests and the local demo server)."""
    get_settings.cache_clear()
    get_service.cache_clear()
