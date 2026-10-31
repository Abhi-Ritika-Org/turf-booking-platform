import pytest

from tests.conftest import TURF_ID, FakeRazorpayClient, body

DATE = '20-10-2026'


def create_payload(**overrides):
    payload = {
        'turf_id': TURF_ID,
        'booking_date': DATE,
        'booking_start_time': '18:00',
        'booking_end_time': '19:00',
    }
    payload.update(overrides)
    return payload


def create(client, auth_headers, **overrides):
    return client.post('/api/bookings/create-booking', json=create_payload(**overrides), headers=auth_headers)


class TestCreateBooking:
    def test_success_prices_in_rupees_and_returns_order(self, client, auth_headers, turf, mongo_db, fake_razorpay):
        response = create(client, auth_headers)
        assert response.status_code == 200, body(response)
        data = body(response)['data']

        assert data['amount'] == 1030  # 1000 for the hour + 30 platform fee
        assert data['platform_fee'] == 30
        assert data['order_id'] == 'order_test_1'
        assert data['booking_id']

        booking = mongo_db['bookings'].find_one({'booking_id': data['booking_id']})
        assert booking['status'] == 'payment_pending'
        assert booking['turf_id'] == TURF_ID
        assert booking['razorpay_order_id'] == 'order_test_1'

    def test_platform_fee_has_a_minimum(self, client, auth_headers, turf, mongo_db, fake_razorpay):
        mongo_db['turfs'].update_one({'id': TURF_ID}, {'$set': {'price_per_hour': 100}})
        data = body(create(client, auth_headers, booking_end_time='18:30'))['data']
        assert data['platform_fee'] == 9  # max(9, round(50 * 0.03))

    def test_booking_is_owned_by_the_caller(self, client, auth_headers, turf, mongo_db, fake_razorpay, user_id):
        data = body(create(client, auth_headers))['data']
        assert mongo_db['bookings'].find_one({'booking_id': data['booking_id']})['user_id'] == user_id

    def test_midnight_end_time_rolls_to_the_next_day(self, client, auth_headers, turf, mongo_db, fake_razorpay):
        response = create(client, auth_headers, booking_start_time='23:30', booking_end_time='00:00')
        assert response.status_code == 200, body(response)
        booking = mongo_db['bookings'].find_one({'booking_id': body(response)['data']['booking_id']})
        assert booking['end_time'].day == booking['start_time'].day + 1
        assert body(response)['data']['amount'] == 515  # 500 for the half hour + 15 platform fee

    @pytest.mark.parametrize('missing', ['turf_id', 'booking_date', 'booking_start_time', 'booking_end_time'])
    def test_missing_fields_are_rejected(self, client, auth_headers, turf, fake_razorpay, missing):
        payload = {k: v for k, v in create_payload().items() if k != missing}
        response = client.post('/api/bookings/create-booking', json=payload, headers=auth_headers)
        assert response.status_code == 400, body(response)

    def test_malformed_date_is_rejected(self, client, auth_headers, turf, fake_razorpay):
        assert create(client, auth_headers, booking_date='2026-10-20').status_code == 400

    def test_end_not_after_start_is_rejected(self, client, auth_headers, turf, fake_razorpay):
        assert create(client, auth_headers, booking_end_time='18:00').status_code == 400
        assert create(client, auth_headers, booking_end_time='17:00').status_code == 400

    def test_unknown_turf_is_404(self, client, auth_headers, fake_razorpay):
        assert create(client, auth_headers, turf_id='turf_does_not_exist').status_code == 404

    @pytest.mark.parametrize('price', [0, -100, 'free', True])
    def test_turf_with_an_unusable_price_is_rejected(
        self, client, auth_headers, turf, mongo_db, fake_razorpay, price
    ):
        mongo_db['turfs'].update_one({'id': TURF_ID}, {'$set': {'price_per_hour': price}})
        assert create(client, auth_headers).status_code == 400

    def test_turf_without_a_price_field_is_404(self, client, auth_headers, turf, mongo_db, fake_razorpay):
        # The price-only projection comes back empty, which the endpoint reads as "turf not found".
        mongo_db['turfs'].update_one({'id': TURF_ID}, {'$unset': {'price_per_hour': ''}})
        assert create(client, auth_headers).status_code == 404

    def test_overlapping_booking_conflicts(self, client, auth_headers, turf, fake_razorpay):
        assert create(client, auth_headers).status_code == 200
        response = create(client, auth_headers, booking_start_time='18:30', booking_end_time='19:30')
        assert response.status_code == 409, body(response)

    def test_adjacent_booking_is_allowed(self, client, auth_headers, turf, fake_razorpay):
        assert create(client, auth_headers).status_code == 200
        response = create(client, auth_headers, booking_start_time='19:00', booking_end_time='20:00')
        assert response.status_code == 200, body(response)

    def test_no_order_is_created_when_the_slot_is_taken(self, client, auth_headers, turf, fake_razorpay):
        razorpay = fake_razorpay(FakeRazorpayClient())
        create(client, auth_headers)
        create(client, auth_headers)
        assert len(razorpay.order.created) == 1

    def test_payment_provider_failure_is_502_and_stores_no_booking(
        self, client, auth_headers, turf, mongo_db, fake_razorpay
    ):
        fake_razorpay(raises=Exception('Network is unreachable'))
        response = create(client, auth_headers)
        assert response.status_code == 502, body(response)
        assert mongo_db['bookings'].count_documents({}) == 0

    def test_requires_a_token(self, client, turf, fake_razorpay):
        assert client.post('/api/bookings/create-booking', json=create_payload()).status_code == 401


@pytest.fixture
def pending_booking(client, auth_headers, turf, fake_razorpay):
    return body(create(client, auth_headers))['data']


def verify_payload(booking, **overrides):
    payload = {
        'booking_id': booking['booking_id'],
        'razorpay_payment_id': 'pay_test_1',
        'razorpay_order_id': booking['order_id'],
        'razorpay_signature': 'signature_test_1',
    }
    payload.update(overrides)
    return payload


class TestVerifyPayment:
    def test_valid_signature_confirms_the_booking(self, client, auth_headers, pending_booking, mongo_db):
        response = client.post(
            '/api/bookings/verify-payment', json=verify_payload(pending_booking), headers=auth_headers
        )
        assert response.status_code == 200, body(response)

        booking = mongo_db['bookings'].find_one({'booking_id': pending_booking['booking_id']})
        assert booking['status'] == 'confirmed'
        assert booking['razorpay_payment_id'] == 'pay_test_1'

    def test_is_idempotent(self, client, auth_headers, pending_booking):
        payload = verify_payload(pending_booking)
        assert client.post('/api/bookings/verify-payment', json=payload, headers=auth_headers).status_code == 200
        assert client.post('/api/bookings/verify-payment', json=payload, headers=auth_headers).status_code == 200

    @pytest.mark.parametrize(
        'missing', ['booking_id', 'razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature']
    )
    def test_missing_fields_are_rejected(self, client, auth_headers, pending_booking, missing):
        payload = {k: v for k, v in verify_payload(pending_booking).items() if k != missing}
        response = client.post('/api/bookings/verify-payment', json=payload, headers=auth_headers)
        assert response.status_code == 400, body(response)

    def test_unknown_booking_is_404(self, client, auth_headers, pending_booking):
        response = client.post(
            '/api/bookings/verify-payment',
            json=verify_payload(pending_booking, booking_id='bk_nope'),
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_order_mismatch_is_rejected(self, client, auth_headers, pending_booking):
        response = client.post(
            '/api/bookings/verify-payment',
            json=verify_payload(pending_booking, razorpay_order_id='order_other'),
            headers=auth_headers,
        )
        assert response.status_code == 400

    def test_invalid_signature_leaves_the_booking_pending(
        self, client, auth_headers, pending_booking, mongo_db, fake_razorpay
    ):
        fake_razorpay(FakeRazorpayClient(signature_valid=False))
        response = client.post(
            '/api/bookings/verify-payment', json=verify_payload(pending_booking), headers=auth_headers
        )
        assert response.status_code == 400, body(response)
        assert mongo_db['bookings'].find_one({'booking_id': pending_booking['booking_id']})['status'] == 'payment_pending'

    def test_another_users_booking_is_404(self, client, auth_headers, pending_booking, mongo_db):
        mongo_db['bookings'].update_one(
            {'booking_id': pending_booking['booking_id']}, {'$set': {'user_id': 'someone_else'}}
        )
        response = client.post(
            '/api/bookings/verify-payment', json=verify_payload(pending_booking), headers=auth_headers
        )
        assert response.status_code == 404

    def test_cancelled_booking_cannot_be_confirmed(self, client, auth_headers, pending_booking, mongo_db):
        mongo_db['bookings'].update_one(
            {'booking_id': pending_booking['booking_id']}, {'$set': {'status': 'cancelled'}}
        )
        response = client.post(
            '/api/bookings/verify-payment', json=verify_payload(pending_booking), headers=auth_headers
        )
        assert response.status_code == 409, body(response)

    def test_requires_a_token(self, client, pending_booking):
        response = client.post('/api/bookings/verify-payment', json=verify_payload(pending_booking))
        assert response.status_code == 401


class TestBookingDetails:
    def test_returns_status_and_formatted_times(self, client, auth_headers, pending_booking):
        response = client.get(f"/api/bookings/booking-details/{pending_booking['booking_id']}", headers=auth_headers)
        assert response.status_code == 200, body(response)
        data = body(response)['data']
        assert data['status'] == 'payment_pending'
        assert data['booking_date'] == DATE
        assert data['booking_start_time'] == '18:00'
        assert data['booking_end_time'] == '19:00'
        assert data['amount'] == 1030

    def test_unknown_booking_is_404(self, client, auth_headers):
        assert client.get('/api/bookings/booking-details/bk_nope', headers=auth_headers).status_code == 404

    def test_another_users_booking_is_404(self, client, auth_headers, pending_booking, mongo_db):
        mongo_db['bookings'].update_one(
            {'booking_id': pending_booking['booking_id']}, {'$set': {'user_id': 'someone_else'}}
        )
        response = client.get(f"/api/bookings/booking-details/{pending_booking['booking_id']}", headers=auth_headers)
        assert response.status_code == 404

    def test_requires_a_token(self, client, pending_booking):
        assert client.get(f"/api/bookings/booking-details/{pending_booking['booking_id']}").status_code == 401
