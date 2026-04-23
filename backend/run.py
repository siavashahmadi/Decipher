import os
from app import create_app

app = create_app()

if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    env = os.environ.get('FLASK_ENV', 'development').lower()
    if debug and env == 'production':
        raise RuntimeError("Refusing to start with debug=True in production")
    app.run(debug=debug, port=5000)