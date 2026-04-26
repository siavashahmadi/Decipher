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
