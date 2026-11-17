"""Composition root: builds the real dependency graph once per Lambda execution
environment (boto3 clients are expensive to create, so they are reused across
warm invocations)."""

from __future__ import annotations

import os
from contextlib import suppress
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


def prewarm() -> None:
    """Inside AWS Lambda, build the service while the execution environment initialises.

    Creating the boto3 resource loads botocore's service model. Done lazily it added about
    one second to the first request after every cold start (measured on the deployed stack,
    2026-11-17); during the init phase it happens before any request is waiting. Outside
    Lambda (tests, Local Demo) this does nothing. A failure here is ignored on purpose: the
    first request repeats the work and reports the problem with the normal error envelope.
    """
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return
    with suppress(Exception):  # see docstring: the first request reports the problem
        get_service()


def cors_allow_origin() -> str:
    return get_settings().cors_allow_origin


def log_level() -> str:
    return get_settings().log_level


def reset() -> None:
    """Forget cached settings and clients (used by tests and the local demo server)."""
    get_settings.cache_clear()
    get_service.cache_clear()
