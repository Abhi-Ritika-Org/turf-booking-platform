import logging
import re
from datetime import datetime
from typing import Optional

import phonenumbers
import shortuuid
from fastapi import Depends, Request
from fastapi.responses import JSONResponse
from phonenumbers.phonenumberutil import NumberParseException
from pydantic import BaseModel

from config import get_db, get_pwd_context, get_redis
from helpers.jwt_service import (
    REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_TYPE,
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    refresh_cookie_max_age,
    set_refresh_cookie,
    unset_refresh_cookie,
)
from middleware import current_user_id



class SignupRequest(BaseModel):
    # Optional so that missing fields produce this module's own 400 messages
    # instead of FastAPI's generic validation error.
    email: Optional[str] = None
    mobile: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None


class LoginRequest(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None


def is_email_valid(email: str) -> bool:
    if not email:
        return False
    email_regex = r"^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z]{2,})+$"
    return bool(re.fullmatch(email_regex, email))


def is_mobile_valid(mobile: str) -> bool:
    try:
        if not mobile:
            return False
        m_raw = str(mobile).strip()
        # If already E.164, parse directly
        if m_raw.startswith('+'):
            parsed = phonenumbers.parse(m_raw, None)
            return phonenumbers.is_valid_number(parsed)

        # Remove non-digit characters and treat as international by prepending '+'
        digits = ''.join(ch for ch in m_raw if ch.isdigit())
        # Basic length sanity check for international numbers
        if len(digits) < 7 or len(digits) > 15:
            return False
        try:
            parsed = phonenumbers.parse('+' + digits, None)
            return phonenumbers.is_valid_number(parsed)
        except NumberParseException:
            return False
    except Exception:
        logging.exception("Error validating mobile number")
        return False


def user_signup(payload: SignupRequest, mongo_db=Depends(get_db), pwd_ctx=Depends(get_pwd_context)):
    try:
        if not payload.email:
            return JSONResponse({'status': 400, 'error': "Email is required"}, status_code=400)
        elif not payload.mobile:
            return JSONResponse({'status': 400, 'error': "Mobile Number is required"}, status_code=400)
        elif not payload.full_name:
            return JSONResponse({'status': 400, 'error': "Name is required"}, status_code=400)
        elif not payload.password:
            return JSONResponse({'status': 400, 'error': "Password is required"}, status_code=400)

        mobile = str(payload.mobile).strip()
        email = str(payload.email).strip().lower()
        full_name = str(payload.full_name).strip()
        password = payload.password

        # Basic validations
        if not is_email_valid(email):
            return JSONResponse({'status': 400, 'error': "Enter valid email"}, status_code=400)

        # Validate mobile number format
        if not is_mobile_valid(mobile):
            return JSONResponse(
                {'status': 400, 'error': 'Enter a valid mobile number (include country code or provide local number)'},
                status_code=400,
            )

        if len(password) < 8:
            return JSONResponse({'status': 400, 'error': 'Password must be at least 8 characters'}, status_code=400)

        # Check for existing user by email
        existing = mongo_db.users.find_one({'email': email}, {"_id": 0})
        if existing:
            return JSONResponse({'status': 409, 'error': 'Email already exists'}, status_code=409)

        # Hash the password (bcrypt via passlib). This is irreversible by design and is the secure best practice.
        hashed = pwd_ctx.hash(password)
        uid = shortuuid.ShortUUID().random(length=6)

        user_doc = {
            "user_id": uid,
            'email': email,
            'mobile': mobile,
            'full_name': full_name,
            'password': hashed,
            'created_at': datetime.now()
        }

        res = mongo_db.users.insert_one(user_doc)
        if res.inserted_id:
            return JSONResponse({'status': 200, 'message': 'User signed up successfully'}, status_code=200)
        return JSONResponse({'status': 500, 'error': 'Error in user signup'}, status_code=500)
    except Exception:
        logging.exception('Error in user_signup')
        return JSONResponse({'status': 500, 'error': 'Error in user signup'}, status_code=500)


def user_login(payload: LoginRequest, mongo_db=Depends(get_db), pwd_ctx=Depends(get_pwd_context), redis_client=Depends(get_redis)):
    try:
        email = str(payload.email or '').strip().lower()
        password = payload.password

        if not email or not password:
            return JSONResponse({'status': 400, 'error': 'Email and password are required'}, status_code=400)

        # Validate credentials
        user = mongo_db.users.find_one({'email': email}, {'_id': 0})

        if not user:
            return JSONResponse({'status': 400, 'error': 'User does not exists'}, status_code=400)

        if not pwd_ctx.verify(password, user.get('password', '')):
            return JSONResponse({'status': 400, 'error': 'Email and password does not match'}, status_code=400)

        user_id = user['user_id']
        logging.info(f"User {user_id} credentials valid")

        active_session = redis_client.get(f"login_session:{user_id}")
        logging.info(f"Active session check for {user_id}: {active_session}")

        if active_session:
            # Active session exists
            logging.info(f"Multiple Device Login Conflict for user {user_id}")
            return JSONResponse({
                'status': 409,
                'error': 'Account already logged in on another device',
            }, status_code=409)

        access_token = create_access_token(user_id)
        refresh_token = create_refresh_token(user_id)
        max_age = refresh_cookie_max_age()

        response = JSONResponse({'status': 200, 'access_token': access_token}, status_code=200)
        set_refresh_cookie(response, refresh_token, max_age=max_age)
        redis_client.setex(f"login_session:{user_id}", max_age, 'active')
        return response
    except Exception:
        logging.exception('Error in user_login')
        return JSONResponse({'status': 500, 'error': 'Login failed due to unknown error'}, status_code=500)


def _refresh_claims(request: Request):
    """Claims from the refresh cookie, or None when it is missing/invalid."""
    try:
        claims = decode_token(request.cookies.get(REFRESH_COOKIE_NAME), REFRESH_TOKEN_TYPE)
    except TokenError:
        logging.debug('Refresh token invalid or expired', exc_info=True)
        return None
    if not claims.get('jti'):
        return None
    return claims


def refresh_access_token(request: Request):
    try:
        claims = _refresh_claims(request)
        if not claims:
            return JSONResponse({'status': 401, 'error': 'Refresh token expired or invalid'}, status_code=401)

        new_access = create_access_token(claims['sub'])
        return JSONResponse({'status': 200, 'access_token': new_access}, status_code=200)
    except Exception:
        logging.exception('Error in refresh_access_token')
        return JSONResponse({'status': 401, 'error': 'Refresh token expired or invalid'}, status_code=401)


def user_logout(request: Request, user_id: str = Depends(current_user_id), redis_client=Depends(get_redis)):
    try:
        # The access token already identifies the caller, so log out even when the
        # refresh cookie is missing or expired; otherwise the Redis session key
        # would survive and block the next login with a 409.
        if _refresh_claims(request) is None:
            logging.info(f"Logging out {user_id} without a valid refresh cookie")

        # Delete the active session so the user can log in again (incl. on another device)
        redis_client.delete(f"login_session:{user_id}")

        response = JSONResponse({'status': 200, 'message': 'Logged out successfully'}, status_code=200)
        unset_refresh_cookie(response)
        return response
    except Exception:
        logging.exception('Error in user_logout')
        return JSONResponse({'status': 500, 'error': 'Logout failed'}, status_code=500)


def current_user_data(user_id: str = Depends(current_user_id), mongo_db=Depends(get_db)):
    try:
        user_data = mongo_db.users.find_one(
            {"user_id": user_id}, {"_id": 0, "password": 0, "created_at": 0}
        )
        return user_data
    except Exception:
        logging.exception('Error in current_user_data')
        return JSONResponse({'status': 500, 'error': 'Failed to fetch user data'}, status_code=500)
