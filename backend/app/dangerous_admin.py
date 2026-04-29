"""Service-role Supabase access. THIS BYPASSES ROW-LEVEL SECURITY.

Only call from server-verified, narrowly-scoped paths where the request is
authorized by something other than the end-user's JWT (e.g. a cryptographically
signed share token whose signature was verified before reaching this code).

If you find yourself importing this module, ask: 'is the access control here
strictly stronger than the user's JWT would have been?' If you cannot give a
crisp yes, do not use this client.
"""
from supabase import Client, create_client

from .config import Config
from .db import _client_options


def get_supabase_service_client() -> Client:
    """Service-role client that bypasses RLS. See module docstring."""
    url = Config.SUPABASE_URL
    service_key = Config.SUPABASE_SERVICE_ROLE_KEY
    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    return create_client(url, service_key, options=_client_options())
