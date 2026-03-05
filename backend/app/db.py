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