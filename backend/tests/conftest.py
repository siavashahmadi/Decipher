"""Shared pytest fixtures for backend tests.

We don't hit Supabase in tests — `get_supabase_client` is monkey-patched to
return a FakeSupabase that records calls and returns scripted responses.
Auth is similarly stubbed so routes behave as if a valid user is signed in.
"""
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
# create_app() enforces a SHARE_SECRET length floor in production. Tests
# satisfy the check with a deterministic 32-char value; individual tests
# that exercise share-link signing override app.config['SHARE_SECRET'].
os.environ.setdefault("SHARE_SECRET", "test-share-secret-padded-xxxxxxxx")

import importlib  # noqa: E402
from app import create_app  # noqa: E402

# `app.routes` re-exports the `solves` Blueprint under the name `solves`,
# which shadows the submodule on the package. Load the module explicitly.
solves_module = importlib.import_module("app.routes.solves")


class FakeQuery:
    """Fluent stub that records filters and returns a scripted `execute` value."""

    def __init__(self, table_name, script):
        self.table_name = table_name
        self.script = script  # list of {"op": ..., "result": {"data": [...]}}
        self.calls = []

    def _record(self, op, *args, **kwargs):
        self.calls.append((op, args, kwargs))
        return self

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return lambda *a, **kw: self._record(name, *a, **kw)

    def execute(self):
        self.calls.append(("execute", (), {}))
        if self.script:
            return SimpleNamespace(**self.script.pop(0))
        return SimpleNamespace(data=[])


class FakeSupabase:
    def __init__(self, user_id="user-123", scripts=None):
        self.user_id = user_id
        # scripts: dict[table_name] -> list of {"data": [...]} queued responses
        self.scripts = scripts or {}
        self.queries = []  # all FakeQuery instances created
        self.auth = MagicMock()
        self.auth.get_user.return_value = SimpleNamespace(
            user=SimpleNamespace(id=self.user_id)
        )
        self.postgrest = MagicMock()

    def table(self, name):
        # Share the script list across table() calls on the same name so
        # sequential queries (e.g. SELECT count then INSERT) drain the queue
        # in order. A fresh list per call would reset the cursor.
        q = FakeQuery(name, self.scripts.setdefault(name, []))
        self.queries.append(q)
        return q


@pytest.fixture
def fake_supabase_factory(monkeypatch):
    """Returns a function to install a FakeSupabase into the solves module."""
    created = {}

    def install(user_id="user-123", scripts=None):
        fake = FakeSupabase(user_id=user_id, scripts=scripts)
        monkeypatch.setattr(
            solves_module,
            "get_supabase_client",
            lambda access_token=None: fake,
        )
        created["fake"] = fake
        return fake

    return install


@pytest.fixture
def fake_service_supabase_factory(monkeypatch):
    """Installs a FakeSupabase for the service-role client used by share routes."""
    def install(scripts=None):
        fake = FakeSupabase(scripts=scripts)
        monkeypatch.setattr(
            solves_module,
            "get_supabase_service_client",
            lambda: fake,
        )
        return fake
    return install


@pytest.fixture
def app():
    app = create_app()
    app.config["TESTING"] = True
    # Disable rate limiting so we can exercise endpoints freely in tests
    from app.extensions import limiter
    limiter.enabled = False
    return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer fake-token"}
