from datetime import datetime, timedelta

import pytest

from tests.conftest import TURF_ID, body

DATE = '20-10-2026'


def booking_doc(start, end, status='confirmed', turf_id=TURF_ID):
    return {
        'booking_id': f'bk_{start:%H%M}_{status}',
        'turf_id': turf_id,
        'user_id': 'someone',
        'start_time': start,
        'end_time': end,
        'status': status,
        'amount': 1000,
    }


def at(hour, minute=0):
    # Naive UTC, the way pymongo stores the timezone-aware values the app writes.
    return datetime(2026, 10, 20, hour, minute)


class TestTurfList:
    def test_returns_turfs_with_total_and_thumbnail_url(self, client, auth_headers, turf):
        response = client.post('/api/turfs/turf-list', json={}, headers=auth_headers)
        assert response.status_code == 200, body(response)
        payload = body(response)
        assert payload['total'] == 1
        assert payload['data'][0]['id'] == TURF_ID
        assert turf['thumbnail'] in payload['data'][0]['thumbnail_url']

    def test_no_turfs_returns_404(self, client, auth_headers):
        response = client.post('/api/turfs/turf-list', json={}, headers=auth_headers)
        assert response.status_code == 404

    def test_pagination_offset_skips_pages(self, client, auth_headers, mongo_db, turf):
        mongo_db['turfs'].insert_one({'id': 'turf_test_2', 'name': 'Second', 'price_per_hour': 500})
        page = body(client.post('/api/turfs/turf-list', json={'offset': 1, 'limit': 1}, headers=auth_headers))
        assert len(page['data']) == 1
        assert page['data'][0]['id'] == 'turf_test_2'
        assert page['total'] == 2

    @pytest.mark.parametrize('payload', [{'limit': 0}, {'limit': 101}, {'offset': -1}, {'limit': -5}])
    def test_out_of_range_pagination_is_rejected(self, client, auth_headers, turf, payload):
        # limit=0 would make Mongo return the whole collection and a negative
        # offset would make skip negative, so both must be refused.
        response = client.post('/api/turfs/turf-list', json=payload, headers=auth_headers)
        assert response.status_code == 400, body(response)
        assert body(response)['error']

    def test_largest_allowed_page_is_accepted(self, client, auth_headers, turf):
        response = client.post('/api/turfs/turf-list', json={'offset': 0, 'limit': 100}, headers=auth_headers)
        assert response.status_code == 200, body(response)

    def test_requires_a_token(self, client, turf):
        assert client.post('/api/turfs/turf-list', json={}).status_code == 401


class TestTurfDetails:
    def url(self, date=DATE, turf_id=TURF_ID):
        return f'/api/turfs/turf-details/{turf_id}?date={date}'

    def test_returns_48_half_hour_slots(self, client, auth_headers, turf):
        response = client.get(self.url(), headers=auth_headers)
        assert response.status_code == 200, body(response)
        slots = body(response)['available_slots']
        assert len(slots) == 48
        assert slots[0]['start_time'] == '00:00'
        assert slots[1]['start_time'] == '00:30'
        assert all(slot['available'] for slot in slots)

    def test_missing_date_is_rejected(self, client, auth_headers, turf):
        response = client.get(f'/api/turfs/turf-details/{TURF_ID}', headers=auth_headers)
        assert response.status_code == 400

    def test_unknown_turf_is_404(self, client, auth_headers):
        response = client.get(self.url(turf_id='turf_does_not_exist'), headers=auth_headers)
        assert response.status_code == 404

    def test_confirmed_booking_marks_its_slots_unavailable(self, client, auth_headers, turf, mongo_db):
        mongo_db['bookings'].insert_one(booking_doc(at(18), at(19)))
        slots = body(client.get(self.url(), headers=auth_headers))['available_slots']
        by_start = {slot['start_time']: slot['available'] for slot in slots}
        assert by_start['17:30'] is True
        assert by_start['18:00'] is False
        assert by_start['18:30'] is False
        assert by_start['19:00'] is True

    def test_pending_booking_does_not_block_display(self, client, auth_headers, turf, mongo_db):
        mongo_db['bookings'].insert_one(booking_doc(at(18), at(19), status='payment_pending'))
        slots = body(client.get(self.url(), headers=auth_headers))['available_slots']
        by_start = {slot['start_time']: slot['available'] for slot in slots}
        assert by_start['18:00'] is True

    def test_booking_on_another_date_does_not_affect_slots(self, client, auth_headers, turf, mongo_db):
        mongo_db['bookings'].insert_one(booking_doc(at(18) + timedelta(days=1), at(19) + timedelta(days=1)))
        slots = body(client.get(self.url(), headers=auth_headers))['available_slots']
        assert all(slot['available'] for slot in slots)

    def test_midnight_booking_belongs_to_the_next_date(self, client, auth_headers, turf, mongo_db):
        # 23:30 -> 00:00 is the last slot of DATE and must not block 00:00 the next day.
        mongo_db['bookings'].insert_one(booking_doc(at(23, 30), at(0) + timedelta(days=1)))

        today = body(client.get(self.url(), headers=auth_headers))['available_slots']
        assert today[-1]['start_time'] == '23:30'
        assert today[-1]['available'] is False

        tomorrow = body(client.get(self.url(date='21-10-2026'), headers=auth_headers))['available_slots']
        assert tomorrow[0]['start_time'] == '00:00'
        assert tomorrow[0]['available'] is True

    def test_requires_a_token(self, client, turf):
        assert client.get(self.url()).status_code == 401

    def test_malformed_date_is_rejected(self, client, auth_headers, turf):
        response = client.get(self.url(date='2026-10-20'), headers=auth_headers)
        assert response.status_code == 400, body(response)
