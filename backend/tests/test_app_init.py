"""Startup config validation. create_app must refuse to boot when any of
the four required Supabase / share-link env vars is missing or empty.

These tests bypass the .env file by monkeypatching Config attributes and
SHARE_SECRET (read from os.environ at create_app time) directly. We do
not re-import the app package because config.py calls
load_dotenv(override=True), which would re-inject .env values and defeat
the test.
"""
import pytest

from app import create_app
from app.config import Config


SUPABASE_VARS = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY")


@pytest.mark.parametrize("missing", SUPABASE_VARS)
def test_create_app_refuses_when_supabase_var_missing(monkeypatch, missing):
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_ANON_KEY", "x" * 40)
    monkeypatch.setattr(Config, "SUPABASE_SERVICE_ROLE_KEY", "x" * 40)
    monkeypatch.setenv("SHARE_SECRET", "x" * 40)
    monkeypatch.setattr(Config, missing, None)

    with pytest.raises(RuntimeError) as exc:
        create_app()
    assert missing in str(exc.value)


def test_create_app_refuses_when_share_secret_missing(monkeypatch):
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_ANON_KEY", "x" * 40)
    monkeypatch.setattr(Config, "SUPABASE_SERVICE_ROLE_KEY", "x" * 40)
    monkeypatch.delenv("SHARE_SECRET", raising=False)

    with pytest.raises(RuntimeError) as exc:
        create_app()
    assert "SHARE_SECRET" in str(exc.value)


def test_create_app_refuses_short_share_secret(monkeypatch):
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_ANON_KEY", "x" * 40)
    monkeypatch.setattr(Config, "SUPABASE_SERVICE_ROLE_KEY", "x" * 40)
    monkeypatch.setenv("SHARE_SECRET", "tooshort")

    with pytest.raises(RuntimeError) as exc:
        create_app()
    assert "32" in str(exc.value)


def test_create_app_boots_with_all_vars_set(monkeypatch):
    monkeypatch.setattr(Config, "SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setattr(Config, "SUPABASE_ANON_KEY", "x" * 40)
    monkeypatch.setattr(Config, "SUPABASE_SERVICE_ROLE_KEY", "x" * 40)
    monkeypatch.setenv("SHARE_SECRET", "x" * 40)

    app = create_app()
    assert app is not None
