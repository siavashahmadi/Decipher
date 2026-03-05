from flask import Flask
from flask_cors import CORS
from .routes.solves import solves
from .config import Config

def create_app(config_class=Config):
    app = Flask(__name__)
    
    # Enable CORS with a more permissive development configuration
    CORS(app, resources={
        r"/api/*": {
            "origins": ["http://localhost:3000"],
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True
        }
    })

    # Load configuration
    app.config.from_object(config_class)
    # Register blueprints
    app.register_blueprint(solves, url_prefix='/api')

     # Add health check route directly in create_app
    @app.route('/api/health')
    def health_check():
        return {"status": "healthy"}

    return app