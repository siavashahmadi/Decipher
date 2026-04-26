"""db.py: lazy config reads + explicit Supabase HTTP timeouts."""
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app import db
from app.config import Config


def _patched_create_client(mock):
    """Make `create_client(...)` return an object whose .postgrest.auth(...) is callable."""
    fake_client = MagicMock()
    mock.return_value = fake_client
    return mock


def test_get_supabase_client_reads_config_lazily(monkeypatch):
    """B.5: changing Config.SUPABASE_URL after import must be observed."""
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://other.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_ANON_KEY", "rotated-key")
    with patch("app.db.create_client") as mock_create:
        _patched_create_client(mock_create)
        db.get_supabase_client()
    args, _kwargs = mock_create.call_args
    assert args[0] == "https://other.supabase.co"
    assert args[1] == "rotated-key"


def test_get_supabase_client_passes_postgrest_timeout(monkeypatch):
    """B.6: postgrest_client_timeout must be configured."""
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_ANON_KEY", "anon")
    with patch("app.db.create_client") as mock_create:
        _patched_create_client(mock_create)
        db.get_supabase_client()
    options = mock_create.call_args.kwargs.get("options")
    assert options is not None, "ClientOptions must be passed to create_client"
    timeout = options.postgrest_client_timeout
    assert isinstance(timeout, httpx.Timeout)
    assert timeout.connect == 2.0
    assert timeout.read == 5.0


def test_get_supabase_client_attaches_token(monkeypatch):
    """Auth token forwarding still works under the new options path."""
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_ANON_KEY", "anon")
    with patch("app.db.create_client") as mock_create:
        fake = _patched_create_client(mock_create).return_value
        db.get_supabase_client(access_token="user-jwt")
        fake.postgrest.auth.assert_called_once_with("user-jwt")


def test_get_supabase_service_client_passes_timeout(monkeypatch):
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_SERVICE_ROLE_KEY", "service-key")
    with patch("app.db.create_client") as mock_create:
        _patched_create_client(mock_create)
        db.get_supabase_service_client()
    options = mock_create.call_args.kwargs.get("options")
    assert options is not None
    assert isinstance(options.postgrest_client_timeout, httpx.Timeout)


def test_get_supabase_service_client_raises_without_service_key(monkeypatch):
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_SERVICE_ROLE_KEY", None)
    with pytest.raises(RuntimeError):
        db.get_supabase_service_client()
