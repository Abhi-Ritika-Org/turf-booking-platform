from dotenv import load_dotenv
import os
import pymongo
from datetime import timedelta
from passlib.context import CryptContext

load_dotenv()

MONGO_URI = os.getenv('MONGO_URI', 'mongodb://turf-mongo:27017')
MONGO_DB = os.getenv('MONGO_DB', 'turfbook')
JWT_ACCESS_SECRET = os.getenv('JWT_ACCESS_SECRET', 'change_me_access')
JWT_REFRESH_SECRET = os.getenv('JWT_REFRESH_SECRET', 'change_me_refresh')
JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '15'))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('REFRESH_TOKEN_EXPIRE_DAYS', '7'))
JWT_COOKIE_SECURE = os.getenv('JWT_COOKIE_SECURE', 'false').lower() == 'true'
JWT_COOKIE_SAMESITE = os.getenv('JWT_COOKIE_SAMESITE', 'Lax')

# Sync pymongo client (single client used for simplicity)
MongoClient = pymongo.MongoClient(MONGO_URI)
MongoDb = MongoClient[MONGO_DB]

pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")

APP_CONFIG = {
    'MONGO_URI': MONGO_URI,
    'MONGO_DB_NAME': MONGO_DB,
    'MONGO_CLIENT': MongoClient,
    'MONGO_DB': MongoDb,
    'PWD_CONTEXT': pwd_context,
    'JWT_SECRET_KEY': JWT_ACCESS_SECRET,
    'JWT_REFRESH_SECRET_KEY': JWT_REFRESH_SECRET,
    'JWT_ALGORITHM': JWT_ALGORITHM,
    'ACCESS_TOKEN_EXPIRE_MINUTES': ACCESS_TOKEN_EXPIRE_MINUTES,
    'REFRESH_TOKEN_EXPIRE_DAYS': REFRESH_TOKEN_EXPIRE_DAYS,
    'JWT_ACCESS_TOKEN_EXPIRES': timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    'JWT_REFRESH_TOKEN_EXPIRES': timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    'JWT_TOKEN_LOCATION': ['headers', 'cookies'],
    'JWT_COOKIE_CSRF_PROTECT': False,
    'JWT_REFRESH_COOKIE_NAME': 'refresh_token',
    'JWT_COOKIE_SECURE': JWT_COOKIE_SECURE,
    'JWT_COOKIE_HTTPONLY': True,
    'JWT_COOKIE_SAMESITE': JWT_COOKIE_SAMESITE,
}


def _from_app_or_default(key, default):
    try:
        from flask import current_app
        if current_app:
            return current_app.config.get(key, default)
    except RuntimeError:
        pass
    return default


def get_mongo_client():
    return _from_app_or_default('MONGO_CLIENT', MongoClient)


def get_mongo_db():
    return _from_app_or_default('MONGO_DB', MongoDb)


def get_pwd_context():
    return _from_app_or_default('PWD_CONTEXT', pwd_context)


def get_access_expiry():
    return _from_app_or_default('JWT_ACCESS_TOKEN_EXPIRES', timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))


def get_refresh_expiry():
    return _from_app_or_default('JWT_REFRESH_TOKEN_EXPIRES', timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
