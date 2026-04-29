"""Local JWT verification using Supabase's JWKS endpoint.

require_auth uses verify_token_local(token) to skip the per-request Supabase
auth.get_user round-trip. Returns None on token-validation failure (expired,
bad signature, malformed, wrong issuer, wrong audience) so the caller can
fall back to the server-side path. Unexpected exceptions propagate so
observability tooling sees them.
"""
import logging
import threading
from typing import Optional

import jwt

from .config import Config

logger = logging.getLogger(__name__)

BEARER_PREFIX = "Bearer "

_jwks_client: Optional[jwt.PyJWKClient] = None
_jwks_lock = threading.Lock()  # B.3: serialize first-call construction


def _get_jwks_client() -> Optional[jwt.PyJWKClient]:
    global _jwks_client
    # Fast path: avoid the lock once initialized.
    if _jwks_client is not None:
        return _jwks_client
    with _jwks_lock:
        # Double-check under lock; another thread may have initialized.
        if _jwks_client is not None:
            return _jwks_client
        url = Config.SUPABASE_URL
        if not url:
            return None
        _jwks_client = jwt.PyJWKClient(
            f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            lifespan=300,        # B.3: rotate the cache every 5 minutes
            max_cached_keys=16,  # B.3: bound memory under key churn
        )
        return _jwks_client


def verify_token_local(token: str) -> Optional[str]:
    """Return the JWT subject (user id) on success, None on token failure.

    Token-shaped failures (expired, bad signature, malformed, wrong
    issuer, wrong audience) return None and are logged at DEBUG.
    Anything else propagates: programmer bugs and infrastructure errors
    should be visible, not silently coerced to "auth failed".
    """
    client = _get_jwks_client()
    if client is None:
        return None

    url = Config.SUPABASE_URL
    issuer = f"{url.rstrip('/')}/auth/v1" if url else None

    try:
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=issuer,  # B.1: reject tokens not minted by our project
        )
    except jwt.ExpiredSignatureError:
        logger.debug("verify_token_local: token_expired")
        return None
    except jwt.InvalidTokenError:
        # Covers InvalidSignatureError, InvalidIssuerError,
        # InvalidAudienceError, DecodeError, MissingRequiredClaimError.
        logger.debug("verify_token_local: token_invalid")
        return None

    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None
