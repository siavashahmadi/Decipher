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
        lambda token, key, algorithms, audience: {"sub": "user-xyz"},
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
        lambda token, key, algorithms, audience: {"aud": "authenticated"},
    )

    assert auth_module.verify_token_local("any.token.value") is None
