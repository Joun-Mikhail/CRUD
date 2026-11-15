"""Extraction of the trusted caller identity from the API Gateway event.

API Gateway's Cognito authorizer validates the JWT (signature, issuer, expiry, client,
required scope) *before* Lambda runs and passes the verified claims in
event["requestContext"]["authorizer"]["claims"]. That is the only place identity is
read from - never from the request body, query string or custom headers.
"""

from __future__ import annotations

from typing import Any

from notes_api.errors import ForbiddenError, UnauthenticatedError

_MAX_SUBJECT_LENGTH = 128


def get_user_id(event: dict[str, Any]) -> str:
    """Return the Cognito `sub` (stable unique user id) of the authenticated caller."""
    claims = _claims(event)
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject or len(subject) > _MAX_SUBJECT_LENGTH:
        raise UnauthenticatedError("Authentication is required")
    # Defense in depth: the authorizer only admits access tokens when scopes are
    # configured, but refuse ID tokens here too in case the API is misconfigured.
    token_use = claims.get("token_use")
    if token_use is not None and token_use != "access":  # noqa: S105 - claim value, not a secret
        raise UnauthenticatedError("An access token is required")
    return subject


def require_scope(event: dict[str, Any], scope: str) -> None:
    """Defense in depth: re-check the OAuth scope that API Gateway already enforced."""
    granted = str(_claims(event).get("scope", "")).split()
    if scope not in granted:
        raise ForbiddenError("The access token does not grant the required scope")


def _claims(event: dict[str, Any]) -> dict[str, Any]:
    context = event.get("requestContext")
    authorizer = context.get("authorizer") if isinstance(context, dict) else None
    claims = authorizer.get("claims") if isinstance(authorizer, dict) else None
    if not isinstance(claims, dict):
        raise UnauthenticatedError("Authentication is required")
    return claims
