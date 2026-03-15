import logging
import os
from dotenv import load_dotenv
from flask import g, make_response, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

load_dotenv()

raw = os.getenv('FRONTEND_ORIGINS', 'http://localhost:8000')
FRONTEND_ORIGINS = [o.strip() for o in raw.split(',') if o.strip()]
### if not present in envs then add from here
for host in (
    'http://127.0.0.1:5173', 'http://localhost:5173',
    'http://127.0.0.1:3000', 'http://localhost:3000',
    'http://localhost:8080', 'http://127.0.0.1:8080',
    'http://localhost:8081', 'http://127.0.0.1:8081'
):
    if host not in FRONTEND_ORIGINS:
        FRONTEND_ORIGINS.append(host)

# Public endpoints that do not need access token validation
PUBLIC_PATHS = {
    '/health-check',
    '/api/auth/user-login',
    '/api/auth/refresh',
    '/api/auth/user-signup',
}


def configure_middleware(app):
    try:
        from flask_cors import CORS as FlaskCORS

        logging.debug(f"Configuring Flask CORS with origins: {FRONTEND_ORIGINS}")
        FlaskCORS(
            app,
            resources={r"/*": {"origins": FRONTEND_ORIGINS}},
            supports_credentials=True,
            expose_headers=["Set-Cookie", "Authorization"],
            allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept"],
            methods=["GET", "HEAD", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"],
        )
    except Exception:
        logging.exception("Failed to configure CORS for Flask app")

    @app.before_request
    def validate_access_token():
        if request.method == 'OPTIONS':
            return None

        path = request.path.rstrip('/') or '/'
        if path in PUBLIC_PATHS:
            return None

        try:
            verify_jwt_in_request(optional=False, locations=['headers'])
            g.current_user_id = get_jwt_identity()
            request.environ['current_user_id'] = g.current_user_id
        except Exception:
            logging.debug("Access token validation failed", exc_info=True)
            return make_response({'status': 401, 'error': 'Invalid or expired access token'}, 401)

        return None
