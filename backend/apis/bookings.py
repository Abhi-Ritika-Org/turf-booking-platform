import logging
from datetime import datetime
from flask import make_response, request
from flask import current_app as app
from flask_jwt_extended import get_jwt_identity
from flask_restful import Resource
import shortuuid


def _serialize_booking(doc):
    return {
        'id': doc.get('booking_id'),
        'name': doc.get('name', ''),
        'phone': doc.get('phone', ''),
        'date': doc.get('date', ''),
        'time_slot': doc.get('time_slot', ''),
        'created_at': doc.get('created_at').isoformat() if doc.get('created_at') else None,
        'user_id': doc.get('user_id', ''),
    }


def _build_user_bookings_query(user_id, user_mobile=None, from_date=None):
    # Primary filter is user_id. For older records created before user_id existed,
    # allow a safe fallback by matching the authenticated user's mobile number.
    criteria = [{'user_id': user_id}]
    if user_mobile:
        criteria.append({'user_id': {'$exists': False}, 'phone': user_mobile})

    query = {'$or': criteria}
    if from_date:
        query['date'] = {'$gte': from_date}
    return query


def _build_user_booking_match(user_id, user_mobile=None):
    criteria = [{'user_id': user_id}]
    if user_mobile:
        criteria.append({'user_id': {'$exists': False}, 'phone': user_mobile})
    return {'$or': criteria}


class CreateBooking(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def _list_bookings(self):
        user_id = get_jwt_identity()
        from_date = request.args.get('from') or request.args.get('from_date')
        user = self.mongo_db.users.find_one({'user_id': user_id}, {'_id': 0, 'mobile': 1}) or {}
        user_mobile = user.get('mobile')

        query = _build_user_bookings_query(user_id, user_mobile, from_date)

        cursor = self.mongo_db.bookings.find(query, {'_id': 0}).sort([
            ('date', 1),
            ('time_slot', 1),
            ('created_at', -1),
        ])

        return make_response([_serialize_booking(item) for item in cursor], 200)

    def get(self):
        """List current user bookings (optionally from a start date)."""
        try:
            return self._list_bookings()
        except Exception:
            logging.exception('Error in CreateBooking.get')
            return make_response({'status': 500, 'error': 'Failed to fetch bookings'}, 500)

    def post(self):
        """Create a booking for the authenticated user."""
        try:
            payload = request.get_json() or {}
            user_id = get_jwt_identity()

            name = str(payload.get('name', '')).strip()
            phone = str(payload.get('phone', '')).strip()
            date = str(payload.get('date', '')).strip()
            time_slot = str(payload.get('time_slot', '')).strip()

            if not name or not phone or not date or not time_slot:
                return make_response({'status': 400, 'error': 'name, phone, date and time_slot are required'}, 400)

            try:
                datetime.strptime(date, '%Y-%m-%d')
            except ValueError:
                return make_response({'status': 400, 'error': 'date must be in YYYY-MM-DD format'}, 400)

            conflict = self.mongo_db.bookings.find_one(
                {'date': date, 'time_slot': time_slot},
                {'_id': 0, 'booking_id': 1},
            )
            if conflict:
                return make_response({'status': 409, 'error': 'Selected slot is already booked'}, 409)

            booking_doc = {
                'booking_id': shortuuid.ShortUUID().random(length=10),
                'user_id': user_id,
                'name': name,
                'phone': phone,
                'date': date,
                'time_slot': time_slot,
                'created_at': datetime.utcnow(),
            }

            self.mongo_db.bookings.insert_one(booking_doc)

            return make_response(
                {
                    'status': 201,
                    'message': 'Booking created successfully',
                    'booking': _serialize_booking(booking_doc),
                },
                201,
            )
        except Exception as e:
            logging.exception('Error in CreateBooking.post')
            return make_response({'status': 500, 'error': str(e)}, 500)


class ListBookings(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def get(self):
        """Compatibility endpoint to list current user bookings."""
        try:
            from_date = request.args.get('from') or request.args.get('from_date')
            user_id = get_jwt_identity()
            user = self.mongo_db.users.find_one({'user_id': user_id}, {'_id': 0, 'mobile': 1}) or {}
            user_mobile = user.get('mobile')

            query = _build_user_bookings_query(user_id, user_mobile, from_date)

            cursor = self.mongo_db.bookings.find(query, {'_id': 0}).sort([
                ('date', 1),
                ('time_slot', 1),
                ('created_at', -1),
            ])

            return make_response([_serialize_booking(item) for item in cursor], 200)
        except Exception as e:
            logging.exception('Error in ListBookings.get')
            return make_response({'status': 500, 'error': str(e)}, 500)


class CancelBooking(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def delete(self, booking_id):
        try:
            user_id = get_jwt_identity()
            user = self.mongo_db.users.find_one({'user_id': user_id}, {'_id': 0, 'mobile': 1}) or {}
            user_mobile = user.get('mobile')

            booking = self.mongo_db.bookings.find_one(
                {
                    'booking_id': booking_id,
                    **_build_user_booking_match(user_id, user_mobile),
                },
                {'_id': 0},
            )

            if not booking:
                return make_response({'status': 404, 'error': 'Booking not found'}, 404)

            today = datetime.utcnow().strftime('%Y-%m-%d')
            if str(booking.get('date', '')) < today:
                return make_response({'status': 400, 'error': 'Past bookings cannot be cancelled'}, 400)

            self.mongo_db.bookings.delete_one({'booking_id': booking_id})
            return make_response({'status': 200, 'message': 'Booking cancelled successfully'}, 200)
        except Exception as e:
            logging.exception('Error in CancelBooking.delete')
            return make_response({'status': 500, 'error': str(e)}, 500)


class RescheduleBooking(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def patch(self, booking_id):
        try:
            payload = request.get_json() or {}
            user_id = get_jwt_identity()

            new_date = str(payload.get('date', '')).strip()
            new_time_slot = str(payload.get('time_slot', '')).strip()

            if not new_date or not new_time_slot:
                return make_response({'status': 400, 'error': 'date and time_slot are required'}, 400)

            try:
                datetime.strptime(new_date, '%Y-%m-%d')
            except ValueError:
                return make_response({'status': 400, 'error': 'date must be in YYYY-MM-DD format'}, 400)

            today = datetime.utcnow().strftime('%Y-%m-%d')
            if new_date < today:
                return make_response({'status': 400, 'error': 'Cannot reschedule to a past date'}, 400)

            user = self.mongo_db.users.find_one({'user_id': user_id}, {'_id': 0, 'mobile': 1}) or {}
            user_mobile = user.get('mobile')

            booking = self.mongo_db.bookings.find_one(
                {
                    'booking_id': booking_id,
                    **_build_user_booking_match(user_id, user_mobile),
                },
                {'_id': 0},
            )

            if not booking:
                return make_response({'status': 404, 'error': 'Booking not found'}, 404)

            if str(booking.get('date', '')) < today:
                return make_response({'status': 400, 'error': 'Past bookings cannot be rescheduled'}, 400)

            conflict = self.mongo_db.bookings.find_one(
                {
                    'date': new_date,
                    'time_slot': new_time_slot,
                    'booking_id': {'$ne': booking_id},
                },
                {'_id': 0, 'booking_id': 1},
            )
            if conflict:
                return make_response({'status': 409, 'error': 'Selected slot is already booked'}, 409)

            self.mongo_db.bookings.update_one(
                {'booking_id': booking_id},
                {
                    '$set': {
                        'date': new_date,
                        'time_slot': new_time_slot,
                        'updated_at': datetime.utcnow(),
                    }
                },
            )

            updated_booking = self.mongo_db.bookings.find_one({'booking_id': booking_id}, {'_id': 0})

            return make_response(
                {
                    'status': 200,
                    'message': 'Booking rescheduled successfully',
                    'booking': _serialize_booking(updated_booking or {}),
                },
                200,
            )
        except Exception as e:
            logging.exception('Error in RescheduleBooking.patch')
            return make_response({'status': 500, 'error': str(e)}, 500)