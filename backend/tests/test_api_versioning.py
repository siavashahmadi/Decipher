"""H.1: /api/v1 is the canonical mount. /api remains as a transitional
alias for in-the-wild clients (e.g. saved share links). Both must serve
the same blueprint, and the legacy prefix must emit RFC 8594 Sunset
headers so we can discover and migrate stragglers before removal.

Operational liveness/readiness endpoints (/api/health, /api/ready) are
not part of the versioned surface and do not get a deprecation header.
"""
import pytest


@pytest.mark.parametrize("path", ["/api/solves", "/api/v1/solves"])
def test_solves_listed_at_both_prefixes(
    fake_supabase_factory, client, auth_headers, path
):
    fake_supabase_factory(scripts={"solves": [{"data": []}]})
    res = client.get(path, headers=auth_headers)
    assert res.status_code == 200, f"{path} returned {res.status_code}"


def test_legacy_api_path_has_deprecation_headers(
    fake_supabase_factory, client, auth_headers
):
    fake_supabase_factory(scripts={"solves": [{"data": []}]})
    res = client.get("/api/solves", headers=auth_headers)
    assert res.headers.get("Deprecation") == "true"
    assert "Sunset" in res.headers
    link = res.headers.get("Link", "")
    assert "successor-version" in link
    assert "/api/v1" in link


def test_v1_path_has_no_deprecation_headers(
    fake_supabase_factory, client, auth_headers
):
    fake_supabase_factory(scripts={"solves": [{"data": []}]})
    res = client.get("/api/v1/solves", headers=auth_headers)
    assert "Deprecation" not in res.headers
    assert "Sunset" not in res.headers


def test_health_endpoint_is_not_marked_deprecated(client):
    """/api/health and /api/ready are operational, not part of the versioned API."""
    res = client.get("/api/health")
    assert res.status_code == 200
    assert "Deprecation" not in res.headers
