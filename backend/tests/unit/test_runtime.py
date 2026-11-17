"""runtime.prewarm(): builds the service during Lambda init only."""

from __future__ import annotations

from typing import Any

import pytest

from notes_api import runtime


@pytest.fixture(autouse=True)
def _fresh_runtime() -> Any:
    runtime.reset()
    yield
    runtime.reset()


def test_prewarm_does_nothing_outside_lambda(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AWS_LAMBDA_FUNCTION_NAME", raising=False)
    monkeypatch.setenv("NOTES_TABLE_NAME", "notes")
    runtime.prewarm()
    assert runtime.get_service.cache_info().currsize == 0


def test_prewarm_builds_the_service_inside_lambda(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "serverless-notes-dev-list-notes")
    monkeypatch.setenv("NOTES_TABLE_NAME", "notes")
    runtime.prewarm()
    assert runtime.get_service.cache_info().currsize == 1
    assert runtime.get_service() is runtime.get_service()


def test_prewarm_swallows_configuration_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    """A missing table name must not crash the init phase; the request reports it later."""
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "serverless-notes-dev-list-notes")
    monkeypatch.delenv("NOTES_TABLE_NAME", raising=False)
    runtime.prewarm()
    assert runtime.get_service.cache_info().currsize == 0
