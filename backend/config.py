from dotenv import load_dotenv
import os
import pymongo
from passlib.context import CryptContext
import redis

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
REDIS_HOST = os.getenv('REDIS_HOST')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))
REDIS_DB = int(os.getenv('REDIS_DB', '0'))
AWS_ACCESS_KEY = os.getenv('AWS_ACCESS_KEY')
AWS_SECRET_KEY = os.getenv('AWS_SECRET_KEY')
AWS_REGION = os.getenv('AWS_REGION')
S3_TURF_ASSETS_BUCKET = os.getenv('S3_TURF_ASSETS_BUCKET')
S3_BASE_URL = os.getenv('S3_BASE_URL')
RAZORPAY_WEBHOOK_SECRET = os.getenv('RAZORPAY_WEBHOOK_SECRET')
CHROMA_HOST = os.getenv('CHROMA_HOST', 'turf-chroma')
CHROMA_PORT = int(os.getenv('CHROMA_PORT', '8000'))
CHROMA_COLLECTION = os.getenv('CHROMA_COLLECTION', 'turfbook_kb')

# Sync pymongo client (single client used for simplicity)
MongoClient = pymongo.MongoClient(MONGO_URI)
MongoDb = MongoClient[MONGO_DB]

pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")

# Redis client (single shared client)
RedisClient = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)


def get_db():
    """FastAPI dependency: the shared Mongo database handle."""
    return MongoDb


def get_redis():
    """FastAPI dependency: the shared Redis client."""
    return RedisClient


def get_pwd_context():
    """FastAPI dependency: the shared passlib context."""
    return pwd_context
