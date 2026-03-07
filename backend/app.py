from importlib import reload
from flask import Flask
from flask_jwt_extended import JWTManager
from flask_restful import Api
from config import APP_CONFIG
from middleware import configure_middleware
from routers import create_routes


def create_app():
    app = Flask(__name__)

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

# Expose Flask WSGI app for Gunicorn
# Run with: gunicorn --worker-class geventwebsocket.gunicorn.workers.GeventWebSocketWorker app:flask_app
app = flask_app

# Health check
@flask_app.route('/health-check', methods=['GET'])
def health_check():
    return {"status": 200, "data": "Success"}

