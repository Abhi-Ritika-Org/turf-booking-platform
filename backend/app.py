from importlib import reload
from flask import Flask
from flask_jwt_extended import JWTManager
from flask_restful import Api
from config import APP_CONFIG
from middleware import configure_middleware
from routers import create_routes

##### Logging setup
import logging
import sys

logging.basicConfig(
    level=logging.DEBUG,  # change to INFO in production
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
# Silence noisy libraries
logging.getLogger("pymongo").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("boto3").setLevel(logging.WARNING)
logging.getLogger("botocore").setLevel(logging.WARNING)

def create_app():
    app = Flask(__name__)

    # Attach Gunicorn logger to Flask app
    gunicorn_logger = logging.getLogger("gunicorn.error")
    if gunicorn_logger.handlers:
        app.logger.handlers = gunicorn_logger.handlers
        app.logger.setLevel(gunicorn_logger.level)
    else:
        app.logger.setLevel(logging.DEBUG)

    app.config.from_mapping(APP_CONFIG)
    configure_middleware(app)
    JWTManager(app)

    return app

# Create Flask WSGI app and register resources
flask_app = create_app()
BASE_PATH = '/api/'

api = Api(flask_app, BASE_PATH)
# Let routers.create_routes register all resources via api.add_resource
create_routes(api)

app = flask_app

# Health check
@flask_app.route('/health-check', methods=['GET'])
def health_check():
    return {"status": 200, "data": "Success"}

