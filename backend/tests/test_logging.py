"""Tests for JSON logging configuration (I.6).

The formatter must:
- Emit valid JSON on stdout.
- Include level, logger, message, timestamp.
- Include request_id and user_id when present on flask.g.
- Include exception info as a single string field.

Wiring:
- create_app installs the JSON handler via configure_logging().
- A before_request hook attaches g.request_id (uuid hex).
- An after_request hook emits one access log per request.
"""
import json
import logging


def _make_record(name="test", level=logging.INFO, msg="hello", args=(), exc=None):
    return logging.LogRecord(
        name=name, level=level, pathname=__file__, lineno=10,
        msg=msg, args=args, exc_info=exc,
    )


def test_formatter_emits_valid_json():
    from app.logging_config import JsonFormatter
    f = JsonFormatter()
    out = f.format(_make_record())
    parsed = json.loads(out)
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "test"
    assert parsed["message"] == "hello"
    assert "timestamp" in parsed


def test_formatter_includes_request_context_when_app_pushed():
    from flask import Flask, g
    from app.logging_config import JsonFormatter
    app = Flask(__name__)
    f = JsonFormatter()
    with app.test_request_context("/"):
        g.request_id = "req-abc"
        g.user_id = "user-xyz"
        out = f.format(_make_record())
    parsed = json.loads(out)
    assert parsed["request_id"] == "req-abc"
    assert parsed["user_id"] == "user-xyz"


def test_formatter_omits_request_context_outside_request():
    from app.logging_config import JsonFormatter
    f = JsonFormatter()
    out = f.format(_make_record())
    parsed = json.loads(out)
    assert "request_id" not in parsed
    assert "user_id" not in parsed


def test_formatter_includes_exception_info():
    import sys
    from app.logging_config import JsonFormatter
    f = JsonFormatter()
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        rec = _make_record(level=logging.ERROR, msg="failed", exc=sys.exc_info())
    parsed = json.loads(f.format(rec))
    assert "exception" in parsed
    assert "RuntimeError: boom" in parsed["exception"]


def test_create_app_calls_configure_logging(monkeypatch):
    """create_app must install JSON logging at boot."""
    calls = []
    from app import logging_config
    monkeypatch.setattr(
        logging_config,
        "configure_logging",
        lambda level="INFO": calls.append(level),
    )
    # Ensure create_app re-imports its reference.
    import app as app_pkg
    monkeypatch.setattr(app_pkg, "configure_logging", logging_config.configure_logging)

    from app import create_app
    create_app()
    assert calls, "configure_logging was not called"


def test_each_request_gets_a_request_id(
    app, client, auth_headers, fake_supabase_factory, solves_module, monkeypatch,
):
    """A before_request hook sets g.request_id on every request."""
    fake_supabase_factory()
    monkeypatch.setattr(solves_module, "verify_token_local", lambda token: "user-1")

    captured = {}

    @app.after_request
    def _capture(response):
        from flask import g
        captured["request_id"] = getattr(g, "request_id", None)
        return response

    client.get("/api/v1/solves?puzzle_type=333", headers=auth_headers)
    assert captured.get("request_id") is not None
    assert isinstance(captured["request_id"], str)
    assert len(captured["request_id"]) >= 8


def test_request_emits_access_log_with_status_and_path(
    client, auth_headers, fake_supabase_factory, solves_module, monkeypatch, caplog,
):
    """An after_request hook emits one structured access log per request."""
    fake_supabase_factory()
    monkeypatch.setattr(solves_module, "verify_token_local", lambda token: "user-1")

    with caplog.at_level(logging.INFO, logger="app.access"):
        client.get("/api/v1/solves?puzzle_type=333", headers=auth_headers)

    matching = [r for r in caplog.records if "/api/v1/solves" in r.getMessage()]
    assert matching, (
        f"no access log; got "
        f"{[(r.name, r.getMessage()) for r in caplog.records]}"
    )
    msg = matching[0].getMessage()
    assert "200" in msg
    assert "GET" in msg
