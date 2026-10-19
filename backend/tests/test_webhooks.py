import hashlib
import hmac
import json

import pytest

from tests.conftest import body

WEBHOOK_URL = '/api/webhook/razorpay'
SECRET = 'test_webhook_secret'


def signed(payload, event_id='evt_test_1', secret=SECRET):
    raw = json.dumps(payload).encode()
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    headers = {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': signature,
        'X-Razorpay-Event-Id': event_id,
    }
    return raw, headers


def captured_event(order_id='order_test_1', amount=103000, payment_id='pay_test_1'):
    return {
        'event': 'payment.captured',
        'created_at': 1700000000,
        'payload': {'payment': {'entity': {'id': payment_id, 'order_id': order_id, 'amount': amount}}},
    }


def post_event(client, payload, event_id='evt_test_1', secret=SECRET):
    raw, headers = signed(payload, event_id=event_id, secret=secret)
    return client.post(WEBHOOK_URL, data=raw, headers=headers)


@pytest.fixture
def pending_booking(mongo_db):
    from datetime import datetime

    doc = {
        'booking_id': 'bk_webhook_1',
        'turf_id': 'turf_test_1',
        'user_id': 'user_1',
        'start_time': datetime(2026, 10, 20, 18, 0),
        'end_time': datetime(2026, 10, 20, 19, 0),
        'status': 'payment_pending',
        'amount': 1030,
        'razorpay_order_id': 'order_test_1',
    }
    mongo_db['bookings'].insert_one(dict(doc))
    return doc


def test_needs_no_jwt(client, pending_booking):
    response = post_event(client, captured_event())
    assert response.status_code == 200, body(response)


def test_invalid_signature_is_rejected(client, pending_booking, mongo_db):
    response = post_event(client, captured_event(), secret='wrong_secret')
    assert response.status_code == 400, body(response)
    assert mongo_db['bookings'].find_one({'booking_id': 'bk_webhook_1'})['status'] == 'payment_pending'


def test_missing_signature_header_is_rejected(client, pending_booking):
    raw = json.dumps(captured_event()).encode()
    response = client.post(WEBHOOK_URL, data=raw, headers={'Content-Type': 'application/json'})
    assert response.status_code == 400


def test_missing_webhook_secret_is_500(client, pending_booking, monkeypatch):
    monkeypatch.delenv('RAZORPAY_WEBHOOK_SECRET')
    response = post_event(client, captured_event())
    assert response.status_code == 500


def test_payment_captured_confirms_the_booking(client, pending_booking, mongo_db):
    response = post_event(client, captured_event())
    assert response.status_code == 200, body(response)

    booking = mongo_db['bookings'].find_one({'booking_id': 'bk_webhook_1'})
    assert booking['status'] == 'confirmed'
    assert booking['razorpay_payment_id'] == 'pay_test_1'

    event = mongo_db['payment_events'].find_one({'event_id': 'evt_test_1'})
    assert event['outcome'] == 'confirmed'


def test_order_paid_confirms_the_booking(client, pending_booking, mongo_db):
    payload = {
        'event': 'order.paid',
        'created_at': 1700000000,
        'payload': {'order': {'entity': {'id': 'order_test_1', 'amount_paid': 103000}}},
    }
    assert post_event(client, payload).status_code == 200
    assert mongo_db['bookings'].find_one({'booking_id': 'bk_webhook_1'})['status'] == 'confirmed'


def test_duplicate_event_is_ignored(client, pending_booking, mongo_db):
    assert post_event(client, captured_event()).status_code == 200
    assert post_event(client, captured_event()).status_code == 200
    assert mongo_db['payment_events'].count_documents({'event_id': 'evt_test_1'}) == 1


def test_redelivery_with_a_new_event_id_stays_confirmed(client, pending_booking, mongo_db):
    assert post_event(client, captured_event(), event_id='evt_1').status_code == 200
    assert post_event(client, captured_event(), event_id='evt_2').status_code == 200
    assert mongo_db['payment_events'].find_one({'event_id': 'evt_2'})['outcome'] == 'already_confirmed'
    assert mongo_db['bookings'].find_one({'booking_id': 'bk_webhook_1'})['status'] == 'confirmed'


def test_amount_mismatch_does_not_confirm(client, pending_booking, mongo_db):
    assert post_event(client, captured_event(amount=100)).status_code == 200
    assert mongo_db['bookings'].find_one({'booking_id': 'bk_webhook_1'})['status'] == 'payment_pending'
    assert mongo_db['payment_events'].find_one({'event_id': 'evt_test_1'})['outcome'] == 'amount_mismatch'


def test_unknown_order_is_recorded(client, mongo_db):
    assert post_event(client, captured_event(order_id='order_unknown')).status_code == 200
    assert mongo_db['payment_events'].find_one({'event_id': 'evt_test_1'})['outcome'] == 'booking_not_found'


def test_payment_failed_leaves_the_booking_pending(client, pending_booking, mongo_db):
    payload = {
        'event': 'payment.failed',
        'created_at': 1700000000,
        'payload': {'payment': {'entity': {'id': 'pay_test_1', 'order_id': 'order_test_1', 'amount': 103000}}},
    }
    assert post_event(client, payload).status_code == 200
    assert mongo_db['bookings'].find_one({'booking_id': 'bk_webhook_1'})['status'] == 'payment_pending'
    assert mongo_db['payment_events'].find_one({'event_id': 'evt_test_1'})['outcome'] == 'payment_failed'


def test_unhandled_event_is_ignored(client, pending_booking, mongo_db):
    payload = {'event': 'payment.authorized', 'created_at': 1700000000, 'payload': {}}
    assert post_event(client, payload).status_code == 200
    assert mongo_db['payment_events'].find_one({'event_id': 'evt_test_1'})['outcome'] == 'ignored'


def test_payment_for_an_expired_booking_is_flagged(client, pending_booking, mongo_db):
    mongo_db['bookings'].update_one({'booking_id': 'bk_webhook_1'}, {'$set': {'status': 'expired'}})
    assert post_event(client, captured_event()).status_code == 200
    assert mongo_db['payment_events'].find_one({'event_id': 'evt_test_1'})['outcome'] == 'paid_in_status_expired'
