from importlib import reload
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_restful import Api
from config import APP_CONFIG
from middleware import configure_middleware
from routers import create_routes
import logging


def create_app():
    app = Flask(__name__)

    app.config.from_mapping(APP_CONFIG)
    configure_middleware(app)
    JWTManager(app)

    return app

# Create Flask WSGI app and register resources
flask_app = create_app()
BASE_PATH = '/api/'

CORS(flask_app)
api = Api(flask_app, BASE_PATH)
# Let routers.create_routes register all resources via api.add_resource
create_routes(api)

# Attempt to wrap Flask app as ASGI for uvicorn compatibility
try:
    from asgiref.wsgi import WsgiToAsgi
    app = WsgiToAsgi(flask_app)
except Exception:
    logging.warning('asgiref not available or failed to wrap WSGI app; exposing Flask WSGI app directly. Use a WSGI server or install asgiref to run with uvicorn.')
    # Expose the WSGI app under the name `app` as a fallback (uvicorn will fail in this case)
    app = flask_app

# Health check
@flask_app.route('/health-check', methods=['GET'])
def health_check():
    return {"status": 200, "data": "Success"}

