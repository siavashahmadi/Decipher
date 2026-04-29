"""dangerous_admin.py: service-role client lives here, not in db.py.

The module name is intentionally loud at every call site (H.8). These tests
also re-cover the timeout / missing-key behaviour that previously lived in
test_db.py.
"""
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app import dangerous_admin
from app.config import Config


def _patched_create_client(mock):
    fake_client = MagicMock()
    mock.return_value = fake_client
    return mock


def test_dangerous_admin_module_importable():
    """The function is callable from dangerous_admin."""
    assert callable(dangerous_admin.get_supabase_service_client)


def test_db_module_no_longer_exports_service_client():
    """db.py must not re-export the service-role factory (H.8 invariant)."""
    import app.db as db
    assert not hasattr(db, "get_supabase_service_client")


def test_get_supabase_service_client_passes_timeout(monkeypatch):
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_SERVICE_ROLE_KEY", "service-key")
    with patch("app.dangerous_admin.create_client") as mock_create:
        _patched_create_client(mock_create)
        dangerous_admin.get_supabase_service_client()
    options = mock_create.call_args.kwargs.get("options")
    assert options is not None
    assert isinstance(options.postgrest_client_timeout, httpx.Timeout)


def test_get_supabase_service_client_raises_without_service_key(monkeypatch):
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_SERVICE_ROLE_KEY", None)
    with pytest.raises(RuntimeError):
        dangerous_admin.get_supabase_service_client()
