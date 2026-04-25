from supabase import create_client, Client
from .config import Config

url = Config.SUPABASE_URL
key = Config.SUPABASE_ANON_KEY

def get_supabase_client(access_token=None) -> Client:
    """Create a Supabase client with optional authentication."""
    client = create_client(url, key)
    if access_token:
        # Set auth header directly instead of using set_session
        client.postgrest.auth(access_token)
    return client


def get_supabase_service_client() -> Client:
    """
    Service-role client that bypasses RLS. Only use on narrow, server-verified
    paths (e.g. signed share tokens) where the request is authorized by
    something other than the end-user's JWT.
    """
    service_key = Config.SUPABASE_SERVICE_ROLE_KEY
    if not service_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    return create_client(url, service_key)