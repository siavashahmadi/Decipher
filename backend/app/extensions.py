import os

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# B.11: allow swapping the limiter store via env. Default 'memory://'
# keeps single-process deployments working unchanged. Production
# multi-worker setups should set LIMITER_STORAGE_URI=redis://... so
# token buckets are shared across workers.
LIMITER_STORAGE_URI = os.environ.get("LIMITER_STORAGE_URI", "memory://")

# Limiter instance created here; init_app(app) called in create_app().
# Token bucket algorithm: capacity C, refill rate R, each request consumes 1 token.
limiter = Limiter(key_func=get_remote_address, storage_uri=LIMITER_STORAGE_URI)
