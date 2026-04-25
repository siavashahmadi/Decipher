import os
from flask import Flask
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
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024  # 16KB; solve payloads are sub-1KB

    share_secret = os.environ.get("SHARE_SECRET", "")
    if len(share_secret) < 32:
        raise RuntimeError(
            "SHARE_SECRET must be set and at least 32 characters"
        )
    app.config["SHARE_SECRET"] = share_secret

    # SD-5: Token bucket rate limiter (in-memory, no Redis required)
    limiter.init_app(app)

    # Register blueprints
    app.register_blueprint(solves, url_prefix='/api')

    @app.route('/api/health')
    def health_check():
        return {"status": "healthy"}

    return app