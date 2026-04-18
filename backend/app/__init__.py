import os
from flask import Flask
from flask_cors import CORS
from .routes.solves import solves
from .config import Config
from .extensions import limiter

def create_app(config_class=Config):
    app = Flask(__name__)

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

    # SD-5: Token bucket rate limiter (in-memory, no Redis required)
    limiter.init_app(app)

    # Register blueprints
    app.register_blueprint(solves, url_prefix='/api')

    @app.route('/api/health')
    def health_check():
        return {"status": "healthy"}

    return app