"""B.10 + B.11: limiter configuration."""
import importlib
import sys


def _reload_extensions(monkeypatch, env):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    sys.modules.pop("app.extensions", None)
    return importlib.import_module("app.extensions")


def test_limiter_storage_uri_defaults_to_memory(monkeypatch):
    monkeypatch.delenv("LIMITER_STORAGE_URI", raising=False)
    mod = _reload_extensions(monkeypatch, {})
    assert mod.LIMITER_STORAGE_URI == "memory://"


def test_limiter_storage_uri_honors_env(monkeypatch):
    mod = _reload_extensions(monkeypatch, {"LIMITER_STORAGE_URI": "redis://localhost:6379"})
    assert mod.LIMITER_STORAGE_URI == "redis://localhost:6379"


# ---------------------------------------------------------------------------
# B.10: user-or-IP key function
# ---------------------------------------------------------------------------
from flask import Flask  # noqa: E402


def test_key_func_returns_user_when_jwt_valid(monkeypatch):
    sys.modules.pop("app.extensions", None)
    mod = importlib.import_module("app.extensions")
    monkeypatch.setattr(mod, "verify_token_local", lambda t: "u-42")
    app = Flask(__name__)
    with app.test_request_context(headers={"Authorization": "Bearer abc"}):
        assert mod._user_or_ip_key() == "user:u-42"


def test_key_func_falls_back_to_ip_when_unauth(monkeypatch):
    sys.modules.pop("app.extensions", None)
    mod = importlib.import_module("app.extensions")
    monkeypatch.setattr(mod, "verify_token_local", lambda t: None)
    app = Flask(__name__)
    with app.test_request_context(headers={}, environ_base={"REMOTE_ADDR": "1.2.3.4"}):
        assert mod._user_or_ip_key() == "1.2.3.4"


def test_key_func_falls_back_to_ip_on_invalid_jwt(monkeypatch):
    sys.modules.pop("app.extensions", None)
    mod = importlib.import_module("app.extensions")
    monkeypatch.setattr(mod, "verify_token_local", lambda t: None)
    app = Flask(__name__)
    with app.test_request_context(
        headers={"Authorization": "Bearer garbage"},
        environ_base={"REMOTE_ADDR": "5.6.7.8"},
    ):
        assert mod._user_or_ip_key() == "5.6.7.8"


def test_key_func_falls_back_to_ip_when_bearer_empty(monkeypatch):
    """A header like 'Bearer ' (with trailing space, empty token) must not
    crash and must fall back to IP."""
    sys.modules.pop("app.extensions", None)
    mod = importlib.import_module("app.extensions")
    # verify_token_local should not be called with an empty token; trip the
    # test if it is.
    def trap(*_a, **_k):
        raise AssertionError("verify_token_local called with empty token")
    monkeypatch.setattr(mod, "verify_token_local", trap)
    app = Flask(__name__)
    with app.test_request_context(
        headers={"Authorization": "Bearer  "},
        environ_base={"REMOTE_ADDR": "9.9.9.9"},
    ):
        assert mod._user_or_ip_key() == "9.9.9.9"
