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
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
# create_app() enforces a 32-byte SHARE_SECRET floor. Set a deterministic
# value at module load so create_app() boots; the `_share_secret` autouse
# fixture re-asserts it for every test in case a test mutates os.environ.
TEST_SHARE_SECRET = "test-share-secret-padded-xxxxxxxx"
os.environ.setdefault("SHARE_SECRET", TEST_SHARE_SECRET)

import importlib  # noqa: E402
from app import create_app  # noqa: E402

# `app.routes` re-exports the `solves` Blueprint under the name `solves`,
# which shadows the submodule on the package. Load the module explicitly so
# tests can monkeypatch its module-level functions (verify_token_local,
# _now_seconds, get_supabase_client, etc.). Exposed as a fixture below.
_solves_module = importlib.import_module("app.routes.solves")


class FakeQuery:
    """Fluent stub that records filters and returns a scripted `execute` value.

    IMPORTANT: FakeQuery records every filter call (.eq, .is_, .lt, etc) but does
    NOT apply them to the scripted response. Tests that depend on a production
    query actually applying a filter must assert the call's presence explicitly,
    e.g. `[c for c in query.calls if c[0] == "is_"]`. See the G.17 follow-up in
    docs/audits/2026-04-25-full-stack-audit.md for the long-term fix (path 2: teach
    FakeQuery to apply filters to scripted data).
    """

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

    def rpc(self, function_name, params=None):
        # Reuse the FakeQuery scripted-response mechanism. Scripts for an RPC
        # are queued under the key f"rpc:{function_name}".
        key = f"rpc:{function_name}"
        q = FakeQuery(key, self.scripts.setdefault(key, []))
        q.calls.append(("rpc", (function_name,), {"params": params or {}}))
        self.queries.append(q)
        return q


@pytest.fixture(autouse=True)
def _share_secret(monkeypatch):
    """Pins SHARE_SECRET to a known 32-byte value for every test.

    Tests that previously set `app.config['SHARE_SECRET']` per-case can rely
    on this fixture instead. Sign + verify both read this value through the
    app config, which is loaded from the environment at create_app() time.
    """
    monkeypatch.setenv("SHARE_SECRET", TEST_SHARE_SECRET)


@pytest.fixture
def solves_module():
    """The `app.routes.solves` module, importable for monkeypatch targets.

    Hoisted from a duplicated `importlib.import_module(...)` block previously
    repeated across test_solves.py.
    """
    return _solves_module


@pytest.fixture
def fake_supabase_factory(monkeypatch):
    """Returns a function to install a FakeSupabase into the solves module."""
    created = {}

    def install(user_id="user-123", scripts=None):
        fake = FakeSupabase(user_id=user_id, scripts=scripts)
        monkeypatch.setattr(
            _solves_module,
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
            _solves_module,
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


@pytest.fixture
def make_solve():
    counter = {"i": 0}

    def _make(**overrides):
        counter["i"] += 1
        return {
            "id": f"solve-{counter['i']}",
            "user_id": "test-user",
            "puzzle_type": "333",
            "time": 10.0,
            "dnf": False,
            "plus_two": False,
            "scramble": "",
            "created_at": "2026-04-20T00:00:00Z",
            **overrides,
        }

    return _make
