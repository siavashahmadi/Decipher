import logging
from typing import Optional

logger = logging.getLogger(__name__)


class PersonalBestsRepository:
    """All Supabase access for the personal_bests table and PB-related RPCs."""

    def __init__(self, supabase):
        self.sb = supabase

    def record_if_better(
        self,
        user_id: str,
        puzzle_type: str,
        solve_id: str,
        time: float,
        achieved_at: str,
    ) -> None:
        """Call the record_pb_if_better RPC (atomic advisory-lock based).

        Non-fatal: errors are logged but not re-raised so the caller's
        solve creation response still succeeds.
        """
        try:
            self.sb.rpc("record_pb_if_better", {
                "p_user_id":     user_id,
                "p_puzzle_type": puzzle_type,
                "p_solve_id":    solve_id,
                "p_time":        time,
                "p_achieved_at": achieved_at,
            }).execute()
        except Exception:
            logger.exception("PB materialization failed (non-fatal)")

    def recompute_for_user(self, user_id: str, puzzle_types: list) -> None:
        """Call recompute_pbs_for_user RPC for the given puzzle types.

        Non-fatal: errors are logged but not re-raised.
        """
        try:
            self.sb.rpc("recompute_pbs_for_user", {
                "p_user_id":      user_id,
                "p_puzzle_types": puzzle_types,
            }).execute()
        except Exception:
            logger.exception("Batch PB recompute failed (non-fatal)")

    def list_for_user(self, user_id: str, puzzle_type: Optional[str] = None) -> list:
        """Return personal best rows for a user, ordered by achieved_at ascending."""
        query = (
            self.sb.table("personal_bests")
            .select("id,puzzle_type,time,achieved_at,solve_id")
            .eq("user_id", user_id)
        )
        if puzzle_type:
            query = query.eq("puzzle_type", puzzle_type)
        query = query.order("achieved_at")
        result = query.execute()
        return result.data

    def cleanup_for_solve(self, solve_id: str, user_id: str) -> None:
        """Delete any PB row referencing this solve.

        Non-fatal: errors are logged but not re-raised.
        """
        try:
            (
                self.sb.table("personal_bests")
                .delete()
                .eq("user_id", user_id)
                .eq("solve_id", solve_id)
                .execute()
            )
        except Exception:
            logger.exception("PB cleanup on delete failed (non-fatal)")
