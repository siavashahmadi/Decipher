from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Limiter instance created here; init_app(app) called in create_app().
# Uses in-memory storage — no Redis required.
# Token bucket algorithm: capacity C, refill rate R, each request consumes 1 token.
limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")
