"""Service for resolving share-link tokens to public solve data.

Token signing and verification stay in routes/solves.py because they depend
on Flask app config (SHARE_SECRET) and the existing test suite monkeypatches
module-level helpers there. This service handles only the database side:
given a verified solve_id, fetch the public fields via the service-role client.
"""
from typing import Optional


class ShareLinksService:
    """Resolves a verified solve_id to its public fields via the service-role client."""

    def __init__(self, solves_repo):
        self.solves = solves_repo

    def get_public_solve(self, solve_id: str) -> Optional[dict]:
        """Fetch public solve fields by id (no user_id filter; uses service-role RLS bypass).

        Returns None if the solve does not exist or is soft-deleted.
        """
        return self.solves.get_public_by_id(solve_id)
