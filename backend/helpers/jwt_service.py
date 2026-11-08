"""Access/refresh token helpers.

Replaces flask-jwt-extended. The claim set and the refresh cookie attributes are
kept the same, so the frontend contract (bearer access token in the login
response, httpOnly `refresh_token` cookie) does not change.
"""
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Response

from config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ACCESS_SECRET,
    JWT_ALGORITHM,
    JWT_COOKIE_SAMESITE,
    JWT_COOKIE_SECURE,
    JWT_REFRESH_SECRET,
    REFRESH_TOKEN_EXPIRE_DAYS,
)

ACCESS_TOKEN_TYPE = 'access'
REFRESH_TOKEN_TYPE = 'refresh'
REFRESH_COOKIE_NAME = 'refresh_token'


class TokenError(Exception):
    """The token is missing, malformed, expired or of the wrong type."""


def _secret_for(token_type):
    return JWT_ACCESS_SECRET if token_type == ACCESS_TOKEN_TYPE else JWT_REFRESH_SECRET


def _create_token(identity, token_type, expires_delta):
    now = datetime.now(timezone.utc)
    payload = {
        'sub': str(identity),
        'type': token_type,
        'jti': str(uuid.uuid4()),
        'fresh': False,
        'iat': now,
        'nbf': now,
        'exp': now + expires_delta,
    }
    return jwt.encode(payload, _secret_for(token_type), algorithm=JWT_ALGORITHM)


def create_access_token(identity):
    return _create_token(identity, ACCESS_TOKEN_TYPE, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(identity):
    return _create_token(identity, REFRESH_TOKEN_TYPE, timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))


def decode_token(token, expected_type=ACCESS_TOKEN_TYPE):
    """Return the token's claims, or raise TokenError."""
    if not token:
        raise TokenError('Token is missing')
    try:
        claims = jwt.decode(token, _secret_for(expected_type), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc

    if claims.get('type') != expected_type:
        raise TokenError(f"Expected a {expected_type} token")
    if not claims.get('sub'):
        raise TokenError('Token has no subject')
    return claims


def refresh_cookie_max_age():
    return int(timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())


def set_refresh_cookie(response: Response, token, max_age=None):
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        token,
        max_age=max_age if max_age is not None else refresh_cookie_max_age(),
        path='/',
        httponly=True,
        secure=JWT_COOKIE_SECURE,
        samesite=JWT_COOKIE_SAMESITE.lower(),
    )


def unset_refresh_cookie(response: Response):
    response.delete_cookie(
        REFRESH_COOKIE_NAME,
        path='/',
        httponly=True,
        secure=JWT_COOKIE_SECURE,
        samesite=JWT_COOKIE_SAMESITE.lower(),
    )
