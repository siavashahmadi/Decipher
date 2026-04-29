"""H.2 envelope contract tests.

Every error response MUST be {"error": {"code": str, "message": str, "fields"?: {}}}.
This file holds the cross-cutting assertions; per-route tests assert codes
inline.
"""


def test_unauth_request_uses_envelope(client):
    r = client.post("/api/solves", json={})
    assert r.status_code == 401
    body = r.get_json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "AUTH_MISSING_TOKEN"
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]
    assert set(body["error"].keys()) <= {"code", "message", "fields"}


def test_404_handler_uses_envelope(client):
    r = client.get("/api/this-route-does-not-exist")
    assert r.status_code == 404
    body = r.get_json()
    assert body["error"]["code"] == "NOT_FOUND"
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


def test_validation_failed_includes_fields(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory()
    r = client.post("/api/solves", json={}, headers=auth_headers)
    assert r.status_code == 422
    body = r.get_json()
    assert body["error"]["code"] == "VALIDATION_FAILED"
    assert isinstance(body["error"]["fields"], dict)
    assert body["error"]["fields"]  # non-empty
