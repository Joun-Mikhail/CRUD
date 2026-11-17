"""Static checks of infrastructure/template.yaml: authorization and error envelopes at the edge.

These complement cfn-lint and `sam validate`, which check that the template is valid but not
that it keeps this project's security rules.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml

TEMPLATE = Path(__file__).resolve().parents[3] / "infrastructure" / "template.yaml"

ROUTES = {
    "CreateNoteFunction": ("POST", "/notes", "notes/write", "dynamodb:PutItem"),
    "ListNotesFunction": ("GET", "/notes", "notes/read", "dynamodb:Query"),
    "GetNoteFunction": ("GET", "/notes/{id}", "notes/read", "dynamodb:GetItem"),
    "UpdateNoteFunction": ("PUT", "/notes/{id}", "notes/write", "dynamodb:UpdateItem"),
    "DeleteNoteFunction": ("DELETE", "/notes/{id}", "notes/write", "dynamodb:DeleteItem"),
}


class _CfnLoader(yaml.SafeLoader):
    """SafeLoader that accepts CloudFormation short-form tags (!Ref, !Sub, ...)."""


def _tag(loader: yaml.SafeLoader, tag_suffix: str, node: yaml.Node) -> Any:
    if isinstance(node, yaml.ScalarNode):
        value: Any = loader.construct_scalar(node)
    elif isinstance(node, yaml.SequenceNode):
        value = loader.construct_sequence(node)
    else:
        value = loader.construct_mapping(node)  # type: ignore[arg-type]
    return {f"!{tag_suffix}": value}


_CfnLoader.add_multi_constructor("!", _tag)


@pytest.fixture(scope="module")
def resources() -> dict[str, Any]:
    template = yaml.load(TEMPLATE.read_text(encoding="utf-8"), Loader=_CfnLoader)  # noqa: S506
    return dict(template["Resources"])


@pytest.mark.parametrize("function", sorted(ROUTES))
def test_every_route_names_the_authorizer_and_one_scope(
    resources: dict[str, Any], function: str
) -> None:
    """SAM rejects AuthorizationScopes without an explicit Authorizer (first deployment)."""
    method, path, scope, _ = ROUTES[function]
    event = resources[function]["Properties"]["Events"]["Api"]["Properties"]
    assert (event["Method"], event["Path"]) == (method, path)
    assert event["Auth"]["Authorizer"] == "CognitoAuthorizer"
    assert event["Auth"]["AuthorizationScopes"] == [scope]


@pytest.mark.parametrize("function", sorted(ROUTES))
def test_each_function_has_exactly_one_dynamodb_action(
    resources: dict[str, Any], function: str
) -> None:
    statements = [
        statement
        for policy in resources[function]["Properties"]["Policies"]
        for statement in policy["Statement"]
    ]
    assert [s["Action"] for s in statements] == [ROUTES[function][3]]
    assert all("*" not in str(s["Resource"]) for s in statements)


@pytest.mark.parametrize(
    ("response_type", "status", "code"),
    [
        ("UNAUTHORIZED", 401, "UNAUTHORIZED"),
        ("ACCESS_DENIED", 403, "FORBIDDEN"),
        ("MISSING_AUTHENTICATION_TOKEN", 404, "NOT_FOUND"),
        ("THROTTLED", 429, "THROTTLED"),
        ("REQUEST_TOO_LARGE", 413, "PAYLOAD_TOO_LARGE"),
    ],
)
def test_gateway_errors_use_the_api_envelope(
    resources: dict[str, Any], response_type: str, status: int, code: str
) -> None:
    """Errors raised by API Gateway itself look like the Lambda errors and carry CORS."""
    response = resources["NotesApi"]["Properties"]["GatewayResponses"][response_type]
    assert response["StatusCode"] == status
    assert f'"code":"{code}"' in response["ResponseTemplates"]["application/json"]
    assert "Access-Control-Allow-Origin" in response["ResponseParameters"]["Headers"]


def test_api_redeploys_on_every_update(resources: dict[str, Any]) -> None:
    """Parameter-only changes (AllowedOrigin) must reach the live stage (ADR 0009)."""
    assert resources["NotesApi"]["Properties"]["AlwaysDeploy"] is True
