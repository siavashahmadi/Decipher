"""Slow-path observability test for require_auth (audit I.5).

When verify_token_local returns None, require_auth falls back to a
Supabase auth.get_user round-trip. Operators need to see this happening
so they can detect JWKS unreachability or sustained legacy-token usage.
The contract: each fallback emits an INFO log containing
'event=auth_slow_path' from app.routes.solves.
"""
import logging


def test_require_auth_logs_slow_path_when_falling_back(
    monkeypatch, caplog, client, auth_headers, fake_supabase_factory, solves_module,
):
    """When verify_token_local returns None, require_auth must emit an
    INFO log line with event=auth_slow_path.
    """
    fake_supabase_factory(user_id="user-xyz")
    monkeypatch.setattr(solves_module, "verify_token_local", lambda token: None)

    with caplog.at_level(logging.INFO, logger="app.routes.solves"):
        resp = client.get("/api/v1/solves?puzzle_type=333", headers=auth_headers)

    assert resp.status_code == 200, resp.get_data(as_text=True)
    matching = [r for r in caplog.records if "auth_slow_path" in r.getMessage()]
    assert matching, (
        f"expected an auth_slow_path log line; got "
        f"{[r.getMessage() for r in caplog.records]}"
    )


def test_require_auth_does_not_log_slow_path_on_fast_path(
    monkeypatch, caplog, client, auth_headers, fake_supabase_factory, solves_module,
):
    """When verify_token_local succeeds, no slow-path log should appear."""
    fake_supabase_factory(user_id="user-xyz")
    monkeypatch.setattr(solves_module, "verify_token_local", lambda token: "user-xyz")

    with caplog.at_level(logging.INFO, logger="app.routes.solves"):
        resp = client.get("/api/v1/solves?puzzle_type=333", headers=auth_headers)

    assert resp.status_code == 200, resp.get_data(as_text=True)
    matching = [r for r in caplog.records if "auth_slow_path" in r.getMessage()]
    assert not matching, (
        f"slow-path log should NOT appear on fast path; got "
        f"{[r.getMessage() for r in matching]}"
    )
