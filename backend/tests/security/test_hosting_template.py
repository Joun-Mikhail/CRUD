"""Static checks of infrastructure/frontend-hosting.yaml: the site bucket stays private and is
readable only through this CloudFront distribution, over HTTPS, with security headers."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml

from tests.security.test_template import _CfnLoader

TEMPLATE = Path(__file__).resolve().parents[3] / "infrastructure" / "frontend-hosting.yaml"


@pytest.fixture(scope="module")
def resources() -> dict[str, Any]:
    template = yaml.load(TEMPLATE.read_text(encoding="utf-8"), Loader=_CfnLoader)  # noqa: S506
    return dict(template["Resources"])


def test_bucket_blocks_all_public_access_and_acls(resources: dict[str, Any]) -> None:
    props = resources["SiteBucket"]["Properties"]
    assert all(props["PublicAccessBlockConfiguration"].values())
    assert len(props["PublicAccessBlockConfiguration"]) == 4
    assert props["OwnershipControls"]["Rules"] == [{"ObjectOwnership": "BucketOwnerEnforced"}]
    assert "WebsiteConfiguration" not in props  # no public S3 website endpoint


def test_only_this_distribution_may_read_and_only_over_tls(resources: dict[str, Any]) -> None:
    statements = resources["SiteBucketPolicy"]["Properties"]["PolicyDocument"]["Statement"]
    allows = [s for s in statements if s["Effect"] == "Allow"]
    assert len(allows) == 1
    allow = allows[0]
    assert allow["Principal"] == {"Service": "cloudfront.amazonaws.com"}
    assert allow["Action"] == "s3:GetObject"
    source_arn = allow["Condition"]["StringEquals"]["AWS:SourceArn"]["!Sub"]
    assert source_arn.endswith(":distribution/${Distribution}")
    deny = next(s for s in statements if s["Effect"] == "Deny")
    assert deny["Condition"] == {"Bool": {"aws:SecureTransport": "false"}}


def test_origin_access_control_signs_every_request(resources: dict[str, Any]) -> None:
    oac = resources["OriginAccessControl"]["Properties"]["OriginAccessControlConfig"]
    assert (oac["SigningBehavior"], oac["SigningProtocol"]) == ("always", "sigv4")
    origin = resources["Distribution"]["Properties"]["DistributionConfig"]["Origins"][0]
    assert origin["OriginAccessControlId"] == {"!GetAtt": "OriginAccessControl.Id"}


def test_viewers_are_redirected_to_https_and_spa_routes_resolve(resources: dict[str, Any]) -> None:
    config = resources["Distribution"]["Properties"]["DistributionConfig"]
    behavior = config["DefaultCacheBehavior"]
    assert behavior["ViewerProtocolPolicy"] == "redirect-to-https"
    assert behavior["AllowedMethods"] == ["GET", "HEAD"]
    assert behavior["ResponseHeadersPolicyId"] == {"!Ref": "SecurityHeadersPolicy"}
    errors = {e["ErrorCode"]: e for e in config["CustomErrorResponses"]}
    assert {403, 404} <= set(errors)
    assert all(e["ResponsePagePath"] == "/index.html" for e in errors.values())


def test_security_headers(resources: dict[str, Any]) -> None:
    config = resources["SecurityHeadersPolicy"]["Properties"]["ResponseHeadersPolicyConfig"]
    headers = config["SecurityHeadersConfig"]
    assert headers["StrictTransportSecurity"]["AccessControlMaxAgeSec"] >= 31536000
    assert headers["FrameOptions"]["FrameOption"] == "DENY"
    assert headers["ReferrerPolicy"]["ReferrerPolicy"] == "no-referrer"
    csp = headers["ContentSecurityPolicy"]["ContentSecurityPolicy"]
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp
    assert "unsafe" not in csp
