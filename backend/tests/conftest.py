"""Shared fixtures for the backend test suite.

The tests are written against the HTTP contract (paths, status codes, response
bodies), not against Flask or FastAPI internals, so the same suite verifies both
sides of the framework migration. Mongo and Redis are swapped for in-memory
fakes; Razorpay is mocked per test.
"""
import os

# Set before config.py is imported, so its module-level clients are built with
# harmless local values instead of whatever happens to be in backend/.env.
os.environ.setdefault('MONGO_URI', 'mongodb://localhost:27017')
os.environ.setdefault('MONGO_DB', 'turfbook_test')
os.environ.setdefault('REDIS_HOST', 'localhost')
os.environ['JWT_ACCESS_SECRET'] = 'test_access_secret'
os.environ['JWT_REFRESH_SECRET'] = 'test_refresh_secret'
os.environ['RAZORPAY_API_KEY'] = 'rzp_test_key'
os.environ['RAZORPAY_KEY_SECRET'] = 'rzp_test_secret'
os.environ['RAZORPAY_WEBHOOK_SECRET'] = 'test_webhook_secret'
os.environ['PLATFORM_FEE_RATE'] = '0.03'
os.environ['MINIMUM_PLATFORM_FEE'] = '9'

import fakeredis
import mongomock
import pytest


SIGNUP_PAYLOAD = {
    'email': 'Player@Example.com',
    'mobile': '+919876543210',
    'full_name': 'Test Player',
    'password': 'password123',
}

TURF_ID = 'turf_test_1'
TURF_DOC = {
    'id': TURF_ID,
    'name': 'Test Turf',
    'location': 'Baner, Pune',
    'price_per_hour': 1000,
    'thumbnail': 'turf_images/turf_test_1/thumb.jpg',
}


def body(response):
    """The response JSON, as a dict."""
    return response.json()


@pytest.fixture(scope='session')
def mongo_client():
    """A real Mongo when one is reachable, mongomock otherwise.

    Booking overlap queries compare stored naive-UTC datetimes against
    timezone-aware ones, which only the real driver normalizes, so prefer a real
    server: `docker compose up -d turf-mongo` (host) or the compose network.
    """
    import pymongo

    uri = os.environ.get('TEST_MONGO_URI') or os.environ['MONGO_URI']
    try:
        client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=1500)
        client.admin.command('ping')
        return client
    except Exception:
        return mongomock.MongoClient()


@pytest.fixture
def mongo_db(mongo_client):
    db = mongo_client['turfbook_test']
    for name in ('users', 'turfs', 'bookings', 'payment_events'):
        db[name].delete_many({})
    return db


@pytest.fixture
def redis_client():
    return fakeredis.FakeRedis(decode_responses=True)


@pytest.fixture
def app(mongo_db, redis_client):
    """The application under test, with fake Mongo/Redis swapped in."""
    from app import create_app
    from config import get_db, get_redis

    application = create_app()
    application.dependency_overrides[get_db] = lambda: mongo_db
    application.dependency_overrides[get_redis] = lambda: redis_client
    return application


@pytest.fixture
def client(app):
    from starlette.testclient import TestClient

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def turf(mongo_db):
    mongo_db['turfs'].insert_one(dict(TURF_DOC))
    return dict(TURF_DOC)


@pytest.fixture
def signed_up_user(client, mongo_db):
    response = client.post('/api/auth/user-signup', json=SIGNUP_PAYLOAD)
    assert response.status_code == 200, body(response)
    return mongo_db['users'].find_one({'email': SIGNUP_PAYLOAD['email'].lower()}, {'_id': 0})


@pytest.fixture
def access_token(client, signed_up_user):
    response = client.post(
        '/api/auth/user-login',
        json={'email': SIGNUP_PAYLOAD['email'], 'password': SIGNUP_PAYLOAD['password']},
    )
    assert response.status_code == 200, body(response)
    return body(response)['access_token']


@pytest.fixture
def auth_headers(access_token):
    return {'Authorization': f'Bearer {access_token}'}


@pytest.fixture
def user_id(signed_up_user):
    return signed_up_user['user_id']


class FakeOrder:
    def __init__(self, order_id='order_test_1', amount=103000):
        self.order_id = order_id
        self.amount = amount
        self.created = []

    def create(self, data):
        self.created.append(data)
        return {
            'id': self.order_id,
            'amount': data.get('amount', self.amount),
            'currency': 'INR',
            'receipt': data.get('receipt'),
        }


class FakeUtility:
    def __init__(self, valid=True):
        self.valid = valid

    def verify_payment_signature(self, params):
        if not self.valid:
            from razorpay.errors import SignatureVerificationError

            raise SignatureVerificationError('Invalid signature')
        return True


class FakeRazorpayClient:
    def __init__(self, order_id='order_test_1', signature_valid=True):
        self.order = FakeOrder(order_id=order_id)
        self.utility = FakeUtility(valid=signature_valid)


@pytest.fixture
def fake_razorpay(monkeypatch):
    """Patch get_razorpay_client; returns a setter so a test can pick the behaviour."""
    import apis.bookings as bookings_module

    holder = {}

    def use(client=None, raises=None):
        def factory():
            if raises is not None:
                raise raises
            return client or FakeRazorpayClient()

        monkeypatch.setattr(bookings_module, 'get_razorpay_client', factory)
        holder['client'] = client
        return client

    use(FakeRazorpayClient())
    return use
