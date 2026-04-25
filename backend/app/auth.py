"""Local JWT verification using Supabase's JWKS endpoint.

require_auth uses verify_token_local(token) to skip the per-request Supabase
auth.get_user round-trip. Returns None on any failure so the caller can fall
back to the server-side path (legacy HS256 projects, JWKS fetch failure,
expired keys).
"""
from typing import Optional

import jwt

from .config import Config


_jwks_client: Optional[jwt.PyJWKClient] = None


def _get_jwks_client() -> Optional[jwt.PyJWKClient]:
    global _jwks_client
    if _jwks_client is not None:
        return _jwks_client
    url = Config.SUPABASE_URL
    if not url:
        return None
    _jwks_client = jwt.PyJWKClient(
        f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json",
        cache_keys=True,
    )
    return _jwks_client


def verify_token_local(token: str) -> Optional[str]:
    """Return the JWT subject (user id) on success, None on any failure."""
    client = _get_jwks_client()
    if client is None:
        return None
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )
    except Exception:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None
