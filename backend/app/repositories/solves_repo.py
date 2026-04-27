from datetime import datetime, timezone
from typing import Optional


class SolvesRepository:
    """All Supabase access for the solves table."""

    def __init__(self, supabase):
        self.sb = supabase

    def list_for_user(
        self,
        user_id: str,
        *,
        puzzle_type: Optional[str] = None,
        limit: int,
        cursor: Optional[tuple] = None,
    ) -> list:
        """Return a page of solves for the user, newest-first.

        cursor is a (created_at_str, solve_id_str) pair from _decode_solve_cursor.
        When cursor_id is present, use the composite tiebreaker filter.
        """
        query = (
            self.sb.table("solves")
            .select("id,puzzle_type,time,dnf,plus_two,scramble,created_at")
            .eq("user_id", user_id)
            .is_("deleted_at", None)
        )
        if puzzle_type:
            query = query.eq("puzzle_type", puzzle_type)
        if cursor is not None:
            cursor_ts, cursor_id = cursor
            if cursor_id:
                query = query.or_(
                    f"created_at.lt.{cursor_ts},"
                    f"and(created_at.eq.{cursor_ts},id.lt.{cursor_id})"
                )
            else:
                query = query.lt("created_at", cursor_ts)
        query = query.order("created_at", desc=True).limit(limit)
        result = query.execute()
        return result.data

    def get_by_id(self, solve_id: str, user_id: str) -> Optional[dict]:
        """Return a solve row by id scoped to user, or None if not found."""
        result = (
            self.sb.table("solves")
            .select("id")
            .eq("id", solve_id)
            .eq("user_id", user_id)
            .is_("deleted_at", None)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def insert(self, solve: dict) -> dict:
        """Insert a single solve row and return it."""
        result = self.sb.table("solves").insert(solve).execute()
        return result.data[0]

    def update(self, solve_id: str, user_id: str, patch: dict) -> Optional[dict]:
        """Apply patch to a non-deleted solve owned by user. Returns the row or None."""
        result = (
            self.sb.table("solves")
            .update(patch)
            .eq("id", solve_id)
            .eq("user_id", user_id)
            .is_("deleted_at", None)
            .execute()
        )
        return result.data[0] if result.data else None

    def soft_delete(self, solve_id: str, user_id: str) -> Optional[dict]:
        """Set deleted_at on a non-deleted solve. Returns the deleted row or None."""
        deleted_at = datetime.now(timezone.utc).isoformat()
        result = (
            self.sb.table("solves")
            .update({"deleted_at": deleted_at})
            .eq("id", solve_id)
            .eq("user_id", user_id)
            .is_("deleted_at", None)
            .execute()
        )
        return result.data[0] if result.data else None

    def insert_many(self, solves: list) -> list:
        """Bulk-insert solve rows (one atomic PostgREST statement). Returns inserted rows."""
        result = self.sb.table("solves").insert(solves).execute()
        return result.data or []

    def get_public_by_id(self, solve_id: str) -> Optional[dict]:
        """Fetch public fields for any non-deleted solve (no user_id filter).

        Intended for use with the service-role client, which bypasses RLS.
        """
        result = (
            self.sb.table("solves")
            .select("id,puzzle_type,time,dnf,plus_two,scramble,created_at")
            .eq("id", solve_id)
            .is_("deleted_at", None)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None

    def user_solve_count(self, user_id: str) -> int:
        """Read the cached solve_count from user_stats. Returns 0 if no row exists."""
        result = (
            self.sb.table("user_stats")
            .select("solve_count")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return result.data[0]["solve_count"] if result.data else 0
