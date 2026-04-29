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


def _split_top_level(expr):
    """Split a PostgREST OR expression on top-level commas, respecting parens."""
    parts = []
    depth = 0
    start = 0
    for i, ch in enumerate(expr):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            parts.append(expr[start:i])
            start = i + 1
    parts.append(expr[start:])
    return parts


def _eval_postgrest_cond(row, cond):
    """Evaluate a PostgREST condition string against a row dict.

    Supports `field.op.value` and nested `and(...)` / `or(...)`. Comparisons
    are string-based, which is sufficient for the cursor tiebreaker (ISO
    timestamps and UUIDs both sort lexicographically).
    """
    if cond.startswith("and(") and cond.endswith(")"):
        return all(_eval_postgrest_cond(row, p) for p in _split_top_level(cond[4:-1]))
    if cond.startswith("or(") and cond.endswith(")"):
        return any(_eval_postgrest_cond(row, p) for p in _split_top_level(cond[3:-1]))
    parts = cond.split(".", 2)
    if len(parts) != 3:
        return True  # malformed: pass through rather than mask production bugs
    col, op, val = parts
    rv = row.get(col)
    if rv is None:
        return False
    sv = str(rv)
    if op == "lt":
        return sv < val
    if op == "gt":
        return sv > val
    if op == "eq":
        return sv == val
    return True  # unknown op


def _matches_filter(row, op, args):
    if op == "eq":
        return row.get(args[0]) == args[1]
    if op == "is_":
        return row.get(args[0]) is args[1]
    if op == "lt":
        rv = row.get(args[0])
        return rv is not None and rv < args[1]
    if op == "gt":
        rv = row.get(args[0])
        return rv is not None and rv > args[1]
    if op == "or_":
        return any(_eval_postgrest_cond(row, p) for p in _split_top_level(args[0]))
    return True  # unrecognised filter passes through


_FILTER_OPS = {"eq", "is_", "lt", "gt", "or_"}


def _apply_filters_to_data(data, calls):
    """Apply recorded SELECT-style filters to a list of dict rows."""
    rows = list(data)
    for op, args, _kwargs in calls:
        if op in _FILTER_OPS:
            rows = [r for r in rows if _matches_filter(r, op, args)]
    for op, args, kwargs in calls:
        if op == "order":
            col = args[0]
            desc = kwargs.get("desc", False)
            rows.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
        elif op == "limit":
            rows = rows[: args[0]]
    return rows


class FakeQuery:
    """Fluent stub that records filters and returns a scripted `execute` value.

    With `apply_filters=True`, recorded `.eq()`, `.is_()`, `.lt()`, `.gt()`,
    `.or_()`, `.order()`, and `.limit()` calls are applied to the scripted
    `data` before it is returned. This lets tests script realistic rows
    (including soft-deleted ones) and verify that production filters actually
    drop them.

    Default is `False` for backwards compatibility: most existing tests
    script contrived rows that omit `user_id` and would be incorrectly
    dropped by `.eq("user_id", ...)`. New tests that want to verify filter
    behaviour should opt in via `fake_supabase_factory(filtered=True)`.
    """

    def __init__(self, table_name, script, apply_filters=False):
        self.table_name = table_name
        self.script = script  # list of {"data": [...]} queued responses
        self.calls = []
        self.apply_filters = apply_filters

    def _record(self, op, *args, **kwargs):
        self.calls.append((op, args, kwargs))
        return self

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return lambda *a, **kw: self._record(name, *a, **kw)

    def execute(self):
        self.calls.append(("execute", (), {}))
        if not self.script:
            return SimpleNamespace(data=[])
        result = self.script.pop(0)
        if self.apply_filters and isinstance(result.get("data"), list):
            filtered = _apply_filters_to_data(result["data"], self.calls)
            return SimpleNamespace(**{**result, "data": filtered})
        return SimpleNamespace(**result)


class FakeSupabase:
    def __init__(self, user_id="user-123", scripts=None, apply_filters=False):
        self.user_id = user_id
        # scripts: dict[table_name] -> list of {"data": [...]} queued responses
        self.scripts = scripts or {}
        self.queries = []  # all FakeQuery instances created
        self.apply_filters = apply_filters
        self.auth = MagicMock()
        self.auth.get_user.return_value = SimpleNamespace(
            user=SimpleNamespace(id=self.user_id)
        )
        self.postgrest = MagicMock()

    def table(self, name):
        # Share the script list across table() calls on the same name so
        # sequential queries (e.g. SELECT count then INSERT) drain the queue
        # in order. A fresh list per call would reset the cursor.
        q = FakeQuery(
            name,
            self.scripts.setdefault(name, []),
            apply_filters=self.apply_filters,
        )
        self.queries.append(q)
        return q

    def rpc(self, function_name, params=None):
        # Reuse the FakeQuery scripted-response mechanism. Scripts for an RPC
        # are queued under the key f"rpc:{function_name}". RPC results are
        # always returned raw (no filter application).
        key = f"rpc:{function_name}"
        q = FakeQuery(key, self.scripts.setdefault(key, []), apply_filters=False)
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
    """Returns a function to install a FakeSupabase into the solves module.

    Pass `filtered=True` to enable filter-aware mode (FakeQuery applies the
    recorded `.eq()`, `.is_()`, etc. calls to scripted rows). Default is off
    to preserve historical script behaviour; new soft-delete / cursor /
    filter tests should opt in.
    """
    created = {}

    def install(user_id="user-123", scripts=None, filtered=False):
        fake = FakeSupabase(user_id=user_id, scripts=scripts, apply_filters=filtered)
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
    def install(scripts=None, filtered=False):
        fake = FakeSupabase(scripts=scripts, apply_filters=filtered)
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
