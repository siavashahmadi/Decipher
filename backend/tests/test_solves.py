"""Route tests for /api/solves.

Covers: auth parsing, limit clamping, pagination cursor, PB materialization,
soft-delete timestamp, PATCH whitelist. The Supabase client is faked via
`fake_supabase_factory` (see conftest.py).
"""
from datetime import datetime, timezone


def test_missing_auth_returns_401(client):
    r = client.get("/api/solves")
    assert r.status_code == 401


def test_malformed_bearer_returns_401(client):
    r = client.get("/api/solves", headers={"Authorization": "BearerTOKEN"})
    assert r.status_code == 401


def test_bearer_with_empty_token_returns_401(client):
    r = client.get("/api/solves", headers={"Authorization": "Bearer   "})
    assert r.status_code == 401


def test_auth_service_failure_returns_503(client, monkeypatch, auth_headers):
    import importlib
    solves_module = importlib.import_module("app.routes.solves")

    def boom(access_token=None):
        raise RuntimeError("supabase down")

    monkeypatch.setattr(solves_module, "get_supabase_client", boom)
    r = client.get("/api/solves", headers=auth_headers)
    assert r.status_code == 503


def test_require_auth_skips_supabase_when_local_jwt_valid(
    fake_supabase_factory, client, auth_headers, monkeypatch
):
    import importlib
    solves_module = importlib.import_module("app.routes.solves")
    monkeypatch.setattr(solves_module, "verify_token_local", lambda token: "user-123")

    fake = fake_supabase_factory(scripts={"solves": [{"data": []}]})
    r = client.get("/api/solves", headers=auth_headers)
    assert r.status_code == 200
    fake.auth.get_user.assert_not_called()


def test_require_auth_falls_back_when_local_verify_fails(
    fake_supabase_factory, client, auth_headers, monkeypatch
):
    import importlib
    solves_module = importlib.import_module("app.routes.solves")
    monkeypatch.setattr(solves_module, "verify_token_local", lambda token: None)

    fake = fake_supabase_factory(scripts={"solves": [{"data": []}]})
    r = client.get("/api/solves", headers=auth_headers)
    assert r.status_code == 200
    fake.auth.get_user.assert_called_once()


def test_get_solves_returns_data_and_next_cursor(fake_supabase_factory, client, auth_headers):
    rows = [{"id": str(i), "created_at": f"2026-01-{i:02d}T00:00:00Z"} for i in range(1, 4)]
    fake_supabase_factory(scripts={"solves": [{"data": rows}]})

    r = client.get("/api/solves?limit=3", headers=auth_headers)
    assert r.status_code == 200
    body = r.get_json()
    assert body["solves"] == rows
    assert body["next_cursor"] == rows[-1]["created_at"]


def test_get_solves_last_page_has_null_cursor(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory(scripts={"solves": [{"data": [{"id": "1", "created_at": "x"}]}]})
    r = client.get("/api/solves?limit=50", headers=auth_headers)
    assert r.get_json()["next_cursor"] is None


def test_get_solves_rejects_non_integer_limit(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory()
    r = client.get("/api/solves?limit=abc", headers=auth_headers)
    assert r.status_code == 400


def test_get_solves_clamps_limit(fake_supabase_factory, client, auth_headers):
    fake = fake_supabase_factory(scripts={"solves": [{"data": []}]})
    client.get("/api/solves?limit=9999", headers=auth_headers)
    # Inspect the query: the `limit` call should have been clamped to 100
    query = fake.queries[0]
    limit_calls = [c for c in query.calls if c[0] == "limit"]
    assert limit_calls and limit_calls[0][1] == (100,)


def test_create_solve_records_pb_on_non_dnf(fake_supabase_factory, client, auth_headers):
    fake = fake_supabase_factory(scripts={
        "solves": [{"data": [{
            "id": "solve-1", "time": 10.5,
            "created_at": "2026-04-20T00:00:00Z",
        }]}],
        "personal_bests": [
            {"data": []},      # no existing PB
            {"data": [{}]},    # insert acknowledged
        ],
    })

    r = client.post(
        "/api/solves",
        headers=auth_headers,
        json={"puzzle_type": "333", "time": 10.5},
    )
    assert r.status_code == 200
    # Two PB queries: one select + one insert
    pb_queries = [q for q in fake.queries if q.table_name == "personal_bests"]
    assert len(pb_queries) == 2
    insert_call = pb_queries[1].calls[0]
    assert insert_call[0] == "insert"
    assert insert_call[1][0]["time"] == 10.5


def test_create_solve_skips_pb_on_dnf(fake_supabase_factory, client, auth_headers):
    fake = fake_supabase_factory(scripts={
        "solves": [{"data": [{
            "id": "s1", "time": 10.0,
            "created_at": "2026-04-20T00:00:00Z",
        }]}],
    })
    r = client.post(
        "/api/solves",
        headers=auth_headers,
        json={"puzzle_type": "333", "time": 10.0, "dnf": True},
    )
    assert r.status_code == 200
    assert not any(q.table_name == "personal_bests" for q in fake.queries)


def test_create_solve_422_on_validation(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory()
    r = client.post(
        "/api/solves",
        headers=auth_headers,
        json={"puzzle_type": "999", "time": -1},
    )
    assert r.status_code == 422


def test_patch_solve_whitelists_fields(fake_supabase_factory, client, auth_headers):
    fake = fake_supabase_factory(scripts={
        "solves": [{"data": [{"id": "abc", "dnf": True}]}],
    })
    r = client.patch(
        "/api/solves/abc",
        headers=auth_headers,
        json={"dnf": True, "time": 999, "user_id": "hax"},
    )
    assert r.status_code == 200
    update_call = fake.queries[0].calls[0]
    assert update_call[0] == "update"
    assert update_call[1][0] == {"dnf": True}  # time/user_id stripped


def test_delete_solve_writes_iso_timestamp(fake_supabase_factory, client, auth_headers):
    fake = fake_supabase_factory(scripts={
        "solves": [{"data": [{"id": "abc"}]}],
    })
    r = client.delete("/api/solves/abc", headers=auth_headers)
    assert r.status_code == 200
    update_call = fake.queries[0].calls[0]
    assert update_call[0] == "update"
    deleted_at = update_call[1][0]["deleted_at"]
    # Parse round-trips as a real ISO UTC timestamp
    parsed = datetime.fromisoformat(deleted_at)
    assert parsed.tzinfo is not None
    assert parsed.tzinfo.utcoffset(parsed) == timezone.utc.utcoffset(parsed)


def test_delete_solve_404_when_missing(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory(scripts={"solves": [{"data": []}]})
    r = client.delete("/api/solves/nope", headers=auth_headers)
    assert r.status_code == 404


def test_delete_solve_removes_matching_pb(fake_supabase_factory, client, auth_headers):
    fake = fake_supabase_factory(scripts={
        "solves": [{"data": [{"id": "abc"}]}],
        "personal_bests": [{"data": [{"id": "pb-1"}]}],
    })
    r = client.delete("/api/solves/abc", headers=auth_headers)
    assert r.status_code == 200

    pb_queries = [q for q in fake.queries if q.table_name == "personal_bests"]
    assert len(pb_queries) == 1
    ops = [c[0] for c in pb_queries[0].calls]
    assert "delete" in ops
    eq_calls = [c for c in pb_queries[0].calls if c[0] == "eq"]
    eq_args = {c[1][0]: c[1][1] for c in eq_calls}
    assert eq_args.get("user_id") == "user-123"
    assert eq_args.get("solve_id") == "abc"


def test_personal_bests_endpoint(fake_supabase_factory, client, auth_headers):
    rows = [{"id": "pb1", "time": 9.0}]
    fake_supabase_factory(scripts={"personal_bests": [{"data": rows}]})
    r = client.get("/api/personal-bests?puzzle_type=333", headers=auth_headers)
    assert r.status_code == 200
    assert r.get_json() == rows


def test_create_solve_rejects_tiny_time(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory()
    r = client.post(
        "/api/solves",
        headers=auth_headers,
        json={"puzzle_type": "333", "time": 0.05},
    )
    assert r.status_code == 422
    body = r.get_json()
    assert "time" in body.get("fields", {})

def test_patch_solve_404_when_missing(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory(scripts={"solves": [{"data": []}]})
    r = client.patch(
        "/api/solves/nope",
        headers=auth_headers,
        json={"dnf": True},
    )
    assert r.status_code == 404


def test_patch_solve_422_on_invalid_type(fake_supabase_factory, client, auth_headers):
    fake_supabase_factory()
    r = client.patch(
        "/api/solves/abc",
        headers=auth_headers,
        json={"dnf": "yes"},
    )
    assert r.status_code == 422
    body = r.get_json()
    assert "dnf" in body.get("fields", {})


# ---------------------------------------------------------------------------
# Shareable solve tokens
# ---------------------------------------------------------------------------
def test_share_token_requires_owner(fake_supabase_factory, client, auth_headers, app):
    app.config["SHARE_SECRET"] = "test-share-secret"
    fake_supabase_factory(scripts={"solves": [{"data": []}]})
    r = client.get("/api/solves/abc/share-token", headers=auth_headers)
    assert r.status_code == 404


def test_share_token_round_trip(
    fake_supabase_factory, fake_service_supabase_factory, client, auth_headers, app
):
    app.config["SHARE_SECRET"] = "test-share-secret"
    fake_supabase_factory(scripts={"solves": [{"data": [{"id": "abc"}]}]})
    r = client.get("/api/solves/abc/share-token", headers=auth_headers)
    assert r.status_code == 200
    token = r.get_json()["token"]
    assert "." in token

    fake_service_supabase_factory(scripts={
        "solves": [{"data": [{
            "id": "abc",
            "puzzle_type": "333",
            "time": 9.87,
            "dnf": False,
            "plus_two": False,
            "scramble": "R U R' U'",
            "created_at": "2026-04-20T00:00:00Z",
        }]}],
    })
    r2 = client.get(f"/api/solves/share/{token}")
    assert r2.status_code == 200
    body = r2.get_json()
    assert body["id"] == "abc"
    assert body["time"] == 9.87
    assert "user_id" not in body


def test_share_token_rejects_tampered(
    fake_supabase_factory, fake_service_supabase_factory, client, auth_headers, app
):
    app.config["SHARE_SECRET"] = "test-share-secret"
    fake_supabase_factory(scripts={"solves": [{"data": [{"id": "abc"}]}]})
    token = client.get("/api/solves/abc/share-token", headers=auth_headers).get_json()["token"]

    id_part, mac_part = token.split(".", 1)
    swapped = "A" if mac_part[0] != "A" else "B"
    tampered = f"{id_part}.{swapped}{mac_part[1:]}"

    fake_service_supabase_factory(scripts={"solves": [{"data": [{"id": "abc"}]}]})
    r = client.get(f"/api/solves/share/{tampered}")
    assert r.status_code == 404


def test_share_token_404_on_soft_deleted(
    fake_supabase_factory, fake_service_supabase_factory, client, auth_headers, app
):
    app.config["SHARE_SECRET"] = "test-share-secret"
    fake_supabase_factory(scripts={"solves": [{"data": [{"id": "abc"}]}]})
    token = client.get("/api/solves/abc/share-token", headers=auth_headers).get_json()["token"]

    fake_service_supabase_factory(scripts={"solves": [{"data": []}]})
    r = client.get(f"/api/solves/share/{token}")
    assert r.status_code == 404
