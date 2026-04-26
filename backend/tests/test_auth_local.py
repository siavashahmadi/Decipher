"""Local JWT verification unit tests.

We verify the contract `verify_token_local(token) -> Optional[str]`:
  - returns sub on a valid signed token
  - returns None on bad signature, malformed token, missing SUPABASE_URL,
    or any unexpected error.
The actual JWKS network fetch is patched at the module boundary.
"""
import importlib
import sys
from types import SimpleNamespace

import jwt
import pytest


@pytest.fixture
def auth_module(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    sys.modules.pop("app.auth", None)
    return importlib.import_module("app.auth")


def test_returns_none_when_supabase_url_missing(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    sys.modules.pop("app.auth", None)
    sys.modules.pop("app.config", None)
    auth_module = importlib.import_module("app.auth")
    auth_module._jwks_client = None
    assert auth_module.verify_token_local("anything") is None


def test_returns_none_for_malformed_token(auth_module):
    assert auth_module.verify_token_local("not-a-jwt") is None


def test_returns_sub_on_valid_signature(auth_module, monkeypatch):
    fake_key = SimpleNamespace(key="secret")

    class FakeClient:
        def get_signing_key_from_jwt(self, token):
            return fake_key

    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
    monkeypatch.setattr(
        auth_module.jwt,
        "decode",
        lambda token, key, **kwargs: {"sub": "user-xyz"},
    )

    assert auth_module.verify_token_local("any.token.value") == "user-xyz"


def test_returns_none_when_jwt_decode_raises(auth_module, monkeypatch):
    fake_key = SimpleNamespace(key="secret")

    class FakeClient:
        def get_signing_key_from_jwt(self, token):
            return fake_key

    def boom(*a, **kw):
        raise jwt.InvalidSignatureError("nope")

    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
    monkeypatch.setattr(auth_module.jwt, "decode", boom)

    assert auth_module.verify_token_local("any.token.value") is None


def test_returns_none_when_sub_missing(auth_module, monkeypatch):
    fake_key = SimpleNamespace(key="secret")

    class FakeClient:
        def get_signing_key_from_jwt(self, token):
            return fake_key

    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
    monkeypatch.setattr(
        auth_module.jwt,
        "decode",
        lambda token, key, **kwargs: {"aud": "authenticated"},
    )

    assert auth_module.verify_token_local("any.token.value") is None


# ---------------------------------------------------------------------------
# B.1 / B.2 / B.3 hardening
# ---------------------------------------------------------------------------
import logging  # noqa: E402
import threading  # noqa: E402
from concurrent.futures import ThreadPoolExecutor  # noqa: E402


def test_decode_called_with_issuer(auth_module, monkeypatch):
    """B.1: jwt.decode must receive issuer=<SUPABASE_URL>/auth/v1."""
    fake_key = SimpleNamespace(key="secret")

    class FakeClient:
        def get_signing_key_from_jwt(self, token):
            return fake_key

    captured = {}

    def fake_decode(token, key, **kwargs):
        captured.update(kwargs)
        return {"sub": "u-1"}

    # Override Config.SUPABASE_URL directly. The auth_module fixture sets
    # SUPABASE_URL via env, but Config is imported and cached and the .env
    # file may shadow the env var via load_dotenv(override=True).
    monkeypatch.setattr(auth_module.Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
    monkeypatch.setattr(auth_module.jwt, "decode", fake_decode)
    auth_module.verify_token_local("any.token.value")

    assert captured.get("issuer") == "https://example.supabase.co/auth/v1"


def test_expired_token_logs_at_debug_and_returns_none(auth_module, monkeypatch, caplog):
    """B.2: expired tokens log a 'token_expired' marker at DEBUG."""
    fake_key = SimpleNamespace(key="secret")

    class FakeClient:
        def get_signing_key_from_jwt(self, token):
            return fake_key

    def boom(*a, **kw):
        raise jwt.ExpiredSignatureError("nope")

    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
    monkeypatch.setattr(auth_module.jwt, "decode", boom)

    with caplog.at_level(logging.DEBUG, logger=auth_module.__name__):
        assert auth_module.verify_token_local("any.token.value") is None
    assert any("token_expired" in r.message for r in caplog.records)


def test_invalid_token_logs_at_debug(auth_module, monkeypatch, caplog):
    """B.2: bad-signature / bad-issuer / bad-audience all collapse into
    InvalidTokenError and log 'token_invalid' at DEBUG."""
    fake_key = SimpleNamespace(key="secret")

    class FakeClient:
        def get_signing_key_from_jwt(self, token):
            return fake_key

    def boom(*a, **kw):
        raise jwt.InvalidSignatureError("nope")

    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
    monkeypatch.setattr(auth_module.jwt, "decode", boom)

    with caplog.at_level(logging.DEBUG, logger=auth_module.__name__):
        assert auth_module.verify_token_local("any.token.value") is None
    assert any("token_invalid" in r.message for r in caplog.records)


def test_unexpected_exception_propagates(auth_module, monkeypatch):
    """B.2: programmer bugs / surprise infra errors must NOT be swallowed."""
    fake_key = SimpleNamespace(key="secret")

    class FakeClient:
        def get_signing_key_from_jwt(self, token):
            return fake_key

    def boom(*a, **kw):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(auth_module, "_get_jwks_client", lambda: FakeClient())
    monkeypatch.setattr(auth_module.jwt, "decode", boom)

    with pytest.raises(RuntimeError):
        auth_module.verify_token_local("any.token.value")


def test_jwks_client_constructed_with_lifespan_and_cap(auth_module, monkeypatch):
    """B.3: PyJWKClient must be created with lifespan=300 and max_cached_keys=16."""
    auth_module._jwks_client = None
    captured = {}

    class FakePyJWKClient:
        def __init__(self, url, **kwargs):
            captured["url"] = url
            captured["kwargs"] = kwargs

    monkeypatch.setattr(auth_module.jwt, "PyJWKClient", FakePyJWKClient)
    result = auth_module._get_jwks_client()
    assert result is not None
    assert captured["kwargs"].get("lifespan") == 300
    assert captured["kwargs"].get("max_cached_keys") == 16
    assert captured["kwargs"].get("cache_keys") is True


def test_jwks_client_init_is_thread_safe(auth_module, monkeypatch):
    """B.3: concurrent first calls must not double-construct the client."""
    import time
    auth_module._jwks_client = None
    construction_count = {"n": 0}
    construction_lock = threading.Lock()

    class FakePyJWKClient:
        def __init__(self, url, **kwargs):
            # Sleep so any thread that races past the `is None` check has a
            # chance to also enter __init__ before the first one returns.
            time.sleep(0.05)
            with construction_lock:
                construction_count["n"] += 1

    monkeypatch.setattr(auth_module.jwt, "PyJWKClient", FakePyJWKClient)

    # Align all 8 threads at a barrier OUTSIDE the constructor so they
    # contend for the same `is None` window inside _get_jwks_client.
    barrier = threading.Barrier(8)

    def call():
        barrier.wait()
        return auth_module._get_jwks_client()

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(lambda _: call(), range(8)))

    assert construction_count["n"] == 1
