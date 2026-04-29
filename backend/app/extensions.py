import os

from flask import request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from .auth import BEARER_PREFIX, verify_token_local

# B.11: allow swapping the limiter store via env. Default 'memory://'
# keeps single-process deployments working unchanged. Production
# multi-worker setups should set LIMITER_STORAGE_URI=redis://... so
# token buckets are shared across workers.
LIMITER_STORAGE_URI = os.environ.get("LIMITER_STORAGE_URI", "memory://")


def _user_or_ip_key() -> str:
    """B.10: per-user buckets when authenticated, per-IP otherwise.

    flask-limiter's per-route limit fires from a before_request hook,
    before the view's @require_auth decorator runs, so we cannot rely on
    g.user_id being set. Instead, parse the bearer token here via
    the cached JWKS path. Cost is one HMAC verify per request (a few
    hundred microseconds, served from the in-process cache).

    On unauth routes (e.g. GET /solves/share/<token>) the Authorization
    header is absent and we fall back to remote address, so the
    aggregate IP rate limit still protects against scraping.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith(BEARER_PREFIX):
        token = auth.removeprefix(BEARER_PREFIX).strip()
        if token:
            sub = verify_token_local(token)
            if sub:
                return f"user:{sub}"
    return get_remote_address()


# Limiter instance created here; init_app(app) called in create_app().
# Token bucket algorithm: capacity C, refill rate R, each request consumes 1 token.
limiter = Limiter(key_func=_user_or_ip_key, storage_uri=LIMITER_STORAGE_URI)
