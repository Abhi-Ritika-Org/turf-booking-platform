from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from config import MongoClient, RedisClient
from middleware import configure_middleware
from routers import create_api_router

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

BASE_PATH = '/api'


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("Starting TurfBook API")
    yield
    # Close the shared clients created in config.py.
    try:
        MongoClient.close()
    except Exception:
        logging.exception("Error closing the Mongo client")
    try:
        RedisClient.close()
    except Exception:
        logging.exception("Error closing the Redis client")


def create_app() -> FastAPI:
    app = FastAPI(title="TurfBook API", lifespan=lifespan)

    configure_middleware(app)
    app.include_router(create_api_router(), prefix=BASE_PATH)

    # Errors keep the {status, error} shape the frontend reads, with no tracebacks.
    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request, exc: RequestValidationError):
        first = (exc.errors() or [{}])[0]
        field = '.'.join(str(part) for part in first.get('loc', ()) if part not in ('body', 'query', 'path'))
        message = first.get('msg', 'Invalid request')
        return JSONResponse(
            {'status': 400, 'error': f"{field}: {message}" if field else message}, status_code=400
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(request, exc: StarletteHTTPException):
        return JSONResponse(
            {'status': exc.status_code, 'error': exc.detail}, status_code=exc.status_code, headers=exc.headers
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request, exc: Exception):
        logging.exception(f"Unhandled error on {request.method} {request.url.path}")
        return JSONResponse({'status': 500, 'error': 'Internal server error'}, status_code=500)

    @app.get('/health-check')
    def health_check():
        return {"status": 200, "data": "Success"}

    return app


# ASGI entrypoint: `uvicorn app:app`
app = create_app()
