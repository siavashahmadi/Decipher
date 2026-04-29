import os
from flask import Flask, current_app, jsonify
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from .routes.solves import solves
from .config import Config
from .extensions import limiter

def create_app(config_class=Config):
    app = Flask(__name__)

    # Trust X-Forwarded-* from a single upstream proxy so flask-limiter sees
    # the real client IP instead of the proxy's socket address.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

    # Enable CORS with a more permissive development configuration
    CORS(app, resources={
        r"/api/*": {
            "origins": [os.environ.get("FRONTEND_URL", "http://localhost:3000")],
            "methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True
        }
    })

    # Load configuration
    app.config.from_object(config_class)
    # 256KB lets the batch migration endpoint accept up to 1000 solves in
    # one request (~85KB JSON). Single-solve routes are still validated
    # against their own much smaller schema.
    app.config['MAX_CONTENT_LENGTH'] = 256 * 1024

    # B.4: refuse to boot on any missing required config. Crashing here
    # produces a clear stack at deploy time rather than a 500 on first
    # request when something downstream tries to call create_client(None).
    required = {
        "SUPABASE_URL": Config.SUPABASE_URL,
        "SUPABASE_ANON_KEY": Config.SUPABASE_ANON_KEY,
        "SUPABASE_SERVICE_ROLE_KEY": Config.SUPABASE_SERVICE_ROLE_KEY,
        "SHARE_SECRET": os.environ.get("SHARE_SECRET", ""),
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        raise RuntimeError(
            f"Required environment variables missing: {', '.join(missing)}"
        )

    share_secret = required["SHARE_SECRET"]
    # A.7: prevent boot with a weak share-link signing key.
    if len(share_secret) < 32:
        raise RuntimeError(
            "SHARE_SECRET must be at least 32 characters "
            f"(got {len(share_secret)})"
        )
    app.config["SHARE_SECRET"] = share_secret

    # SD-5: Token bucket rate limiter (in-memory, no Redis required)
    limiter.init_app(app)

    # Register blueprints
    app.register_blueprint(solves, url_prefix='/api')

    @app.route('/api/health')
    def health_check():
        return {"status": "healthy"}

    @app.route('/api/ready')
    def readiness_check():
        # Lazy imports so a Supabase outage at boot never breaks health.
        from . import db as db_module
        from .auth import jwks_cache_state

        checks: dict[str, str] = {}
        overall_ok = True

        try:
            client = db_module.get_supabase_client()
            client.table('solves').select('id').limit(1).execute()
            checks['supabase'] = 'ok'
        except Exception:
            current_app.logger.exception('readiness_supabase_failed')
            checks['supabase'] = 'fail'
            overall_ok = False

        try:
            checks['jwks'] = jwks_cache_state()
        except Exception:
            current_app.logger.exception('readiness_jwks_failed')
            checks['jwks'] = 'fail'
            overall_ok = False

        status = 'ready' if overall_ok else 'not_ready'
        return jsonify({"status": status, "checks": checks}), (200 if overall_ok else 503)

    # B.7 (phase 1, Report-Only). Once the report-only header has been
    # quiet in production for a burn-in window, swap the CSP header name
    # to 'Content-Security-Policy' (phase 2). The other four headers are
    # always enforcing.
    csp = (
        "default-src 'self'; "
        "script-src 'self' 'wasm-unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; "
        "font-src 'self'; "
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co; "
        "worker-src 'self' blob:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )

    @app.after_request
    def _security_headers(response):
        response.headers.setdefault("Content-Security-Policy-Report-Only", csp)
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
        return response

    return app