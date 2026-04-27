"""Unit tests for SolvesService using fake repositories.

No Flask, no Supabase, no HTTP. Tests exercise the business rules in isolation.
"""
import pytest

from app.services.exceptions import SolveLimitReached, SolveNotFound
from app.services.solves_service import SolvesService, SOLVE_LIFETIME_CAP


# ---------------------------------------------------------------------------
# Fake repositories
# ---------------------------------------------------------------------------

class FakeSolvesRepo:
    def __init__(self):
        self.solves = {}
        self.count_value = 0
        self._next_id = 0

    def _new_id(self):
        self._next_id += 1
        return f"solve-{self._next_id}"

    def user_solve_count(self, user_id: str) -> int:
        return self.count_value

    def insert(self, solve: dict) -> dict:
        row = {"id": self._new_id(), "created_at": "2026-04-20T00:00:00Z", **solve}
        self.solves[row["id"]] = row
        return row

    def insert_many(self, solves: list) -> list:
        result = []
        for s in solves:
            row = {"id": self._new_id(), "created_at": "2026-04-20T00:00:00Z", **s}
            self.solves[row["id"]] = row
            result.append(row)
        return result

    def update(self, solve_id: str, user_id: str, patch: dict):
        if solve_id not in self.solves:
            return None
        row = self.solves[solve_id]
        if row.get("user_id") != user_id:
            return None
        row.update(patch)
        return row

    def soft_delete(self, solve_id: str, user_id: str):
        if solve_id not in self.solves:
            return None
        row = self.solves[solve_id]
        if row.get("user_id") != user_id:
            return None
        row["deleted_at"] = "2026-04-20T12:00:00Z"
        return row

    def list_for_user(self, user_id: str, *, puzzle_type=None, limit: int, cursor=None) -> list:
        return [r for r in self.solves.values() if r.get("user_id") == user_id]


class FakePbsRepo:
    def __init__(self):
        self.record_calls = []
        self.recompute_calls = []
        self.cleanup_calls = []

    def record_if_better(self, user_id, puzzle_type, solve_id, time, achieved_at):
        self.record_calls.append({
            "user_id": user_id,
            "puzzle_type": puzzle_type,
            "solve_id": solve_id,
            "time": time,
            "achieved_at": achieved_at,
        })

    def recompute_for_user(self, user_id, puzzle_types):
        self.recompute_calls.append({"user_id": user_id, "puzzle_types": puzzle_types})

    def list_for_user(self, user_id, puzzle_type=None):
        return []

    def cleanup_for_solve(self, solve_id, user_id):
        self.cleanup_calls.append({"solve_id": solve_id, "user_id": user_id})


def _service(count_value=0):
    solves_repo = FakeSolvesRepo()
    solves_repo.count_value = count_value
    pb_repo = FakePbsRepo()
    svc = SolvesService(solves_repo, pb_repo)
    return svc, solves_repo, pb_repo


# ---------------------------------------------------------------------------
# Cap enforcement
# ---------------------------------------------------------------------------

def test_create_raises_at_cap():
    svc, _, _ = _service(count_value=SOLVE_LIFETIME_CAP)
    with pytest.raises(SolveLimitReached) as exc_info:
        svc.create("u1", {"puzzle_type": "333", "time": 9.0})
    assert exc_info.value.limit == SOLVE_LIFETIME_CAP


def test_create_raises_above_cap():
    svc, _, _ = _service(count_value=SOLVE_LIFETIME_CAP + 1)
    with pytest.raises(SolveLimitReached):
        svc.create("u1", {"puzzle_type": "333", "time": 9.0})


def test_create_allows_one_under_cap():
    svc, repo, _ = _service(count_value=SOLVE_LIFETIME_CAP - 1)
    result = svc.create("u1", {"puzzle_type": "333", "time": 9.0, "dnf": True})
    assert result["user_id"] == "u1"


# ---------------------------------------------------------------------------
# PB materialization
# ---------------------------------------------------------------------------

def test_create_non_dnf_calls_record_if_better():
    svc, _, pb_repo = _service()
    svc.create("u1", {"puzzle_type": "333", "time": 9.5, "dnf": False})
    assert len(pb_repo.record_calls) == 1
    call = pb_repo.record_calls[0]
    assert call["user_id"] == "u1"
    assert call["puzzle_type"] == "333"
    assert call["time"] == 9.5


def test_create_dnf_skips_pb_record():
    svc, _, pb_repo = _service()
    svc.create("u1", {"puzzle_type": "333", "time": 9.5, "dnf": True})
    assert pb_repo.record_calls == []


def test_create_missing_dnf_field_treated_as_non_dnf():
    """Payload without 'dnf' key should still trigger PB recording."""
    svc, _, pb_repo = _service()
    svc.create("u1", {"puzzle_type": "333", "time": 9.5})
    assert len(pb_repo.record_calls) == 1


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

def test_update_returns_solve_not_found_when_missing():
    svc, _, _ = _service()
    with pytest.raises(SolveNotFound):
        svc.update("u1", "nonexistent-id", {"dnf": True})


def test_update_applies_patch_and_returns_row():
    svc, repo, _ = _service()
    repo.solves["s1"] = {"id": "s1", "user_id": "u1", "dnf": False, "plus_two": False}
    result = svc.update("u1", "s1", {"dnf": True})
    assert result["dnf"] is True


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def test_delete_raises_solve_not_found_when_missing():
    svc, _, _ = _service()
    with pytest.raises(SolveNotFound):
        svc.delete("u1", "nonexistent-id")


def test_delete_non_dnf_triggers_pb_cleanup():
    svc, repo, pb_repo = _service()
    repo.solves["s1"] = {"id": "s1", "user_id": "u1", "dnf": False}
    svc.delete("u1", "s1")
    assert len(pb_repo.cleanup_calls) == 1
    assert pb_repo.cleanup_calls[0]["solve_id"] == "s1"


def test_delete_dnf_skips_pb_cleanup():
    svc, repo, pb_repo = _service()
    repo.solves["s1"] = {"id": "s1", "user_id": "u1", "dnf": True}
    svc.delete("u1", "s1")
    assert pb_repo.cleanup_calls == []


def test_delete_returns_deleted_row():
    svc, repo, _ = _service()
    repo.solves["s1"] = {"id": "s1", "user_id": "u1", "dnf": False}
    result = svc.delete("u1", "s1")
    assert result["id"] == "s1"
    assert "deleted_at" in result


# ---------------------------------------------------------------------------
# Batch create
# ---------------------------------------------------------------------------

def test_create_batch_raises_when_combined_count_exceeds_cap():
    svc, _, _ = _service(count_value=SOLVE_LIFETIME_CAP - 1)
    rows = [{"puzzle_type": "333", "time": 9.0}, {"puzzle_type": "333", "time": 8.5}]
    with pytest.raises(SolveLimitReached):
        svc.create_batch("u1", rows)


def test_create_batch_inserts_and_recomputes_pbs():
    svc, repo, pb_repo = _service()
    rows = [
        {"puzzle_type": "333", "time": 9.0, "dnf": False, "plus_two": False, "scramble": ""},
        {"puzzle_type": "222", "time": 4.0, "dnf": False, "plus_two": False, "scramble": ""},
    ]
    result = svc.create_batch("u1", rows)
    assert len(result) == 2
    assert len(pb_repo.recompute_calls) == 1
    call = pb_repo.recompute_calls[0]
    assert call["user_id"] == "u1"
    assert sorted(call["puzzle_types"]) == ["222", "333"]


def test_create_batch_allows_at_exact_cap_boundary():
    svc, repo, _ = _service(count_value=SOLVE_LIFETIME_CAP - 1)
    rows = [{"puzzle_type": "333", "time": 9.0, "dnf": False, "plus_two": False, "scramble": ""}]
    result = svc.create_batch("u1", rows)
    assert len(result) == 1
