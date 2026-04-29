"""Supabase client factories.

We deliberately read config inside each factory call (B.5) so a test or
hot-reload that mutates Config picks up the new value, and we wire an
explicit httpx timeout into the PostgREST client (B.6) so a stalled
Supabase region fails the request in seconds rather than hanging the
worker.

Note on auth fallback: solves.py calls supabase.auth.get_user() when
local JWT verification fails. The supabase-py 2.22 ClientOptions does
not expose an auth-client timeout (only postgrest/storage/functions),
so the auth subclient inherits its own internal default. This is
acceptable because the auth fallback is a cold path that runs only when
local JWKS verification cannot succeed.
"""
import httpx
from supabase import Client, ClientOptions, create_client

from .config import Config

# Tight client-side budget. Connect should complete on a warm pool in
# under 100 ms; reads are bounded by Supabase's own 5 s edge timeout.
# Anything past this should surface as a 503 rather than hang a worker.
_SUPABASE_TIMEOUT = httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0)


def _client_options() -> ClientOptions:
    return ClientOptions(
        postgrest_client_timeout=_SUPABASE_TIMEOUT,
        storage_client_timeout=_SUPABASE_TIMEOUT,
        function_client_timeout=_SUPABASE_TIMEOUT,
    )


def get_supabase_client(access_token=None) -> Client:
    """Create a Supabase client with optional authentication."""
    url = Config.SUPABASE_URL
    key = Config.SUPABASE_ANON_KEY
    client = create_client(url, key, options=_client_options())
    if access_token:
        client.postgrest.auth(access_token)
    return client


# H.8: get_supabase_service_client lives in app.dangerous_admin.
# That module's name is loud at every call site, and its docstring
# states the contract.
