import logging
import os
import uuid
from flask import Flask, current_app, g, jsonify, request
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from .routes.solves import solves
from .config import Config
from .extensions import limiter
from .logging_config import configure_logging
from .errors import (
    INTERNAL_ERROR,
    NOT_FOUND,
    RATE_LIMITED,
    error_response,
)

def create_app(config_class=Config):
    configure_logging(os.environ.get("LOG_LEVEL", "INFO"))
    access_logger = logging.getLogger("app.access")

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

    # H.1: register the same blueprint at /api/v1 (canonical) and /api
    # (transitional). Frontend points at /api/v1; existing share links and
    # external clients keep working under /api with a Deprecation header.
    # The `name=` kwarg is required because Flask refuses to register the
    # same blueprint twice under one default name.
    app.register_blueprint(solves, url_prefix='/api/v1')
    app.register_blueprint(solves, url_prefix='/api', name='solves_legacy')

    @app.before_request
    def _attach_request_id():
        # I.6: every request gets a uuid available on g.request_id; the
        # JSON formatter pulls it onto every log line emitted during the
        # request.
        g.request_id = uuid.uuid4().hex

    @app.before_request
    def _legacy_api_deprecation():
        path = request.path
        # Mark unversioned /api/* requests, except the operational liveness
        # /readiness routes which are not part of the versioned API surface.
        if (
            path.startswith('/api/')
            and not path.startswith('/api/v1/')
            and not path.startswith('/api/health')
            and not path.startswith('/api/ready')
        ):
            g.legacy_api = True

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

    # H.2: standardize error envelope on framework-emitted errors too.
    # Per-route 4xx errors already use error_response; these handlers cover
    # the framework defaults (rate limiter 429, missing routes 404, generic
    # 500s) so every error response on the wire matches the same shape.
    @app.errorhandler(429)
    def _handle_rate_limit(_e):
        return error_response(
            RATE_LIMITED, "Too many requests, please slow down", 429,
        )

    @app.errorhandler(404)
    def _handle_not_found(_e):
        return error_response(NOT_FOUND, "Resource not found", 404)

    @app.errorhandler(500)
    def _handle_internal_error(_e):
        return error_response(INTERNAL_ERROR, "Internal server error", 500)

    @app.after_request
    def _access_log(response):
        # I.6: one structured access log per request. Method, path, status.
        # request_id and user_id are folded in by the JSON formatter.
        access_logger.info(
            f"{request.method} {request.path} {response.status_code}"
        )
        return response

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

    @app.after_request
    def _legacy_api_headers(response):
        # H.1: legacy /api/* paths get RFC 8594 Sunset signals so external
        # clients (notably saved share links) can be discovered and migrated
        # before the un-versioned mount is removed.
        if getattr(g, 'legacy_api', False):
            response.headers.setdefault('Deprecation', 'true')
            response.headers.setdefault(
                'Sunset', 'Wed, 01 Jul 2026 00:00:00 GMT',
            )
            response.headers.setdefault(
                'Link', '</api/v1>; rel="successor-version"',
            )
        return response

    return app