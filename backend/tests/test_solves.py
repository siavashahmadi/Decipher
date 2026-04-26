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
        "solves": [
            {"data": [], "count": 0},
            {"data": [{
                "id": "solve-1", "time": 10.5,
                "created_at": "2026-04-20T00:00:00Z",
            }]},
        ],
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
        "solves": [
            {"data": [], "count": 0},
            {"data": [{
                "id": "s1", "time": 10.0,
                "created_at": "2026-04-20T00:00:00Z",
            }]},
        ],
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


def test_create_solve_returns_429_above_lifetime_cap(
    fake_supabase_factory, client, auth_headers
):
    fake_supabase_factory(scripts={
        "solves": [{"data": [], "count": 100_001}],
    })
    r = client.post(
        "/api/solves",
        headers=auth_headers,
        json={"puzzle_type": "333", "time": 10.0},
    )
    assert r.status_code == 429
    assert "limit" in r.get_json().get("error", "").lower()


def test_create_solve_under_cap_inserts_normally(
    fake_supabase_factory, client, auth_headers
):
    fake = fake_supabase_factory(scripts={
        "solves": [
            {"data": [], "count": 5},
            {"data": [{
                "id": "solve-1", "time": 10.5,
                "created_at": "2026-04-20T00:00:00Z",
            }]},
        ],
        "personal_bests": [
            {"data": []},
            {"data": [{}]},
        ],
    })
    r = client.post(
        "/api/solves",
        headers=auth_headers,
        json={"puzzle_type": "333", "time": 10.5},
    )
    assert r.status_code == 200
    # First solves query is the count, second is the insert.
    solves_queries = [q for q in fake.queries if q.table_name == "solves"]
    assert len(solves_queries) == 2
    assert any(c[0] == "select" for c in solves_queries[0].calls)
    assert any(c[0] == "insert" for c in solves_queries[1].calls)


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
    assert token.count(".") == 3

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

    parts = token.split(".")
    # Flip a mid-segment char of the MAC. Mutating the first or last char is
    # flaky: the first b64 char only encodes the high bits of the first byte
    # (replacement might match), and the last char of a 22-char MAC encodes
    # only the top 2 bits of the trailing byte, so 4 different b64 chars
    # decode to the same byte.
    mac = parts[-1]
    swap = "B" if mac[5] != "B" else "C"
    parts[-1] = mac[:5] + swap + mac[6:]
    tampered = ".".join(parts)

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


def test_create_solve_rejects_when_at_lifetime_cap(fake_supabase_factory, client, auth_headers):
    from app.routes.solves import SOLVE_LIFETIME_CAP
    fake_supabase_factory(scripts={
        "solves": [{"data": [], "count": SOLVE_LIFETIME_CAP}],
    })
    r = client.post(
        "/api/solves",
        headers=auth_headers,
        json={"puzzle_type": "333", "time": 12.34, "scramble": ""},
    )
    assert r.status_code == 429
    assert "limit" in r.get_json()["error"].lower()


def test_create_solve_allows_one_under_cap(fake_supabase_factory, client, auth_headers):
    from app.routes.solves import SOLVE_LIFETIME_CAP
    fake_supabase_factory(scripts={
        "solves": [
            {"data": [], "count": SOLVE_LIFETIME_CAP - 1},
            {"data": [{
                "id": "s1", "time": 12.34, "puzzle_type": "333",
                "scramble": "", "dnf": False, "plus_two": False,
                "created_at": "2026-04-25T00:00:00Z",
            }]},
        ],
    })
    r = client.post(
        "/api/solves",
        headers=auth_headers,
        json={"puzzle_type": "333", "time": 12.34, "scramble": "", "dnf": True},
    )
    assert r.status_code == 200


def test_patch_returns_404_for_soft_deleted_solve(fake_supabase_factory, client, auth_headers):
    # Soft-deleted rows should not be reachable via PATCH.
    # We assert two things: the route returns 404 when the (filtered) query
    # returns empty, AND the route actually applied the `.is_('deleted_at', None)`
    # filter on the query (otherwise this test would pass even without the fix).
    fake = fake_supabase_factory(scripts={
        "solves": [{"data": []}],
    })
    r = client.patch(
        "/api/solves/abc-123",
        headers=auth_headers,
        json={"dnf": True},
    )
    assert r.status_code == 404
    query = fake.queries[0]
    is_calls = [c for c in query.calls if c[0] == "is_"]
    assert is_calls, "PATCH must filter out soft-deleted rows via .is_('deleted_at', None)"
    assert is_calls[0][1] == ("deleted_at", None)


def test_patch_rejects_empty_allowed_body(fake_supabase_factory, client, auth_headers):
    # Body with no recognized fields should 422 before hitting Supabase.
    fake_supabase_factory()
    r = client.patch(
        "/api/solves/abc-123",
        headers=auth_headers,
        json={"time": 999},
    )
    assert r.status_code == 422
    body = r.get_json()
    assert body.get("fields", {}).get("body") == "must include dnf or plus_two"


def test_share_token_has_four_segments(app, fake_supabase_factory, client, auth_headers):
    app.config["SHARE_SECRET"] = "x" * 32
    fake_supabase_factory(scripts={
        "solves": [{"data": [{"id": "abc-123"}]}],
    })
    r = client.get("/api/solves/abc-123/share-token", headers=auth_headers)
    assert r.status_code == 200
    token = r.get_json()["token"]
    # New token format: id . iat . exp . mac
    assert token.count(".") == 3


def test_share_token_expired_returns_404(app, monkeypatch, fake_service_supabase_factory, client):
    import importlib
    solves_module = importlib.import_module("app.routes.solves")
    app.config["SHARE_SECRET"] = "x" * 32
    real_now = solves_module._now_seconds
    # Sign a token, then jump the clock past the TTL
    monkeypatch.setattr(
        solves_module,
        "_now_seconds",
        lambda: real_now() - solves_module.SHARE_TOKEN_TTL_SECONDS - 1,
    )
    with app.app_context():
        token = solves_module._sign_solve_id("abc-123")
    monkeypatch.setattr(solves_module, "_now_seconds", real_now)
    fake_service_supabase_factory(scripts={"solves": [{"data": [{"id": "abc-123"}]}]})
    r = client.get(f"/api/solves/share/{token}")
    assert r.status_code == 404


def test_share_token_tampered_mac_returns_404(app, fake_service_supabase_factory, client):
    import importlib
    solves_module = importlib.import_module("app.routes.solves")
    app.config["SHARE_SECRET"] = "x" * 32
    with app.app_context():
        token = solves_module._sign_solve_id("abc-123")
    # Flip the first char of the MAC segment. Flipping the last char is
    # unreliable because base64url's final char encodes only 2 useful bits
    # for a 16-byte payload; substitutions can decode to identical bytes.
    parts = token.split(".")
    parts[-1] = ("A" if parts[-1][0] != "A" else "B") + parts[-1][1:]
    bad_token = ".".join(parts)
    r = client.get(f"/api/solves/share/{bad_token}")
    assert r.status_code == 404
