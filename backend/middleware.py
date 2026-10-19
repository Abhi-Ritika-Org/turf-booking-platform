import logging
import os

from dotenv import load_dotenv
from fastapi import HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from helpers.jwt_service import ACCESS_TOKEN_TYPE, TokenError, decode_token

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

INVALID_TOKEN_MESSAGE = 'Invalid or expired access token'


def configure_middleware(app):
    logging.debug(f"Configuring CORS with origins: {FRONTEND_ORIGINS}")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=FRONTEND_ORIGINS,
        allow_credentials=True,
        expose_headers=["Set-Cookie", "Authorization"],
        allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Accept"],
        allow_methods=["GET", "HEAD", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"],
    )


def current_user_id(request: Request) -> str:
    """Dependency for every non-public route: validates the bearer access token.

    Replaces the Flask `before_request` hook and `PUBLIC_PATHS`; a route is
    public simply by not depending on this.
    """
    authorization = request.headers.get('Authorization', '')
    scheme, _, token = authorization.partition(' ')
    if scheme.lower() != 'bearer' or not token.strip():
        logging.debug("Access token missing or malformed Authorization header")
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    try:
        claims = decode_token(token.strip(), ACCESS_TOKEN_TYPE)
    except TokenError:
        logging.debug("Access token validation failed", exc_info=True)
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_MESSAGE)

    user_id = claims['sub']
    request.state.current_user_id = user_id
    return user_id


async def raw_request_body(request: Request) -> bytes:
    """Dependency for signature-verified webhooks: the exact bytes that were sent."""
    return await request.body()
