"""Business rules for the solves domain.

This module is Flask-free. It depends on repository objects that implement
the same interface as SolvesRepository and PersonalBestsRepository, making
it straightforward to unit-test with fake repos.
"""
from .exceptions import SolveLimitReached, SolveNotFound

SOLVE_LIFETIME_CAP = 100_000


class SolvesService:
    def __init__(self, solves_repo, pb_repo):
        self.solves = solves_repo
        self.pbs = pb_repo

    def list_solves(
        self,
        user_id: str,
        *,
        puzzle_type=None,
        limit: int,
        cursor=None,
    ) -> list:
        return self.solves.list_for_user(
            user_id, puzzle_type=puzzle_type, limit=limit, cursor=cursor
        )

    def create(self, user_id: str, payload: dict) -> dict:
        """Insert a solve after checking the lifetime cap. Records PB if non-DNF."""
        if self.solves.user_solve_count(user_id) >= SOLVE_LIFETIME_CAP:
            raise SolveLimitReached(SOLVE_LIFETIME_CAP)
        solve = self.solves.insert({**payload, "user_id": user_id})
        if not payload.get("dnf", False):
            self.pbs.record_if_better(
                user_id,
                payload["puzzle_type"],
                solve["id"],
                float(solve["time"]),
                solve["created_at"],
            )
        return solve

    def update(self, user_id: str, solve_id: str, patch: dict) -> dict:
        """Apply an allowed patch to a solve. Raises SolveNotFound if not found."""
        result = self.solves.update(solve_id, user_id, patch)
        if result is None:
            raise SolveNotFound()
        return result

    def delete(self, user_id: str, solve_id: str) -> dict:
        """Soft-delete a solve and clean up its PB row (for non-DNF). Returns the deleted row."""
        deleted = self.solves.soft_delete(solve_id, user_id)
        if deleted is None:
            raise SolveNotFound()
        if not deleted.get("dnf"):
            self.pbs.cleanup_for_solve(solve_id, user_id)
        return deleted

    def create_batch(self, user_id: str, rows: list) -> list:
        """Bulk-insert validated solve rows after a combined cap check. Recomputes PBs."""
        existing = self.solves.user_solve_count(user_id)
        if existing + len(rows) > SOLVE_LIFETIME_CAP:
            raise SolveLimitReached(SOLVE_LIFETIME_CAP)
        prepared = [
            {
                "user_id":     user_id,
                "puzzle_type": row["puzzle_type"],
                "time":        row["time"],
                "dnf":         row.get("dnf", False),
                "plus_two":    row.get("plus_two", False),
                "scramble":    row.get("scramble", ""),
            }
            for row in rows
        ]
        inserted = self.solves.insert_many(prepared)
        puzzle_types = sorted({row["puzzle_type"] for row in rows})
        self.pbs.recompute_for_user(user_id, puzzle_types)
        return inserted

    def list_personal_bests(self, user_id: str, puzzle_type=None) -> list:
        return self.pbs.list_for_user(user_id, puzzle_type)

    def get_by_id(self, user_id: str, solve_id: str):
        """Return a solve row if it exists and belongs to user, else None."""
        return self.solves.get_by_id(solve_id, user_id)
