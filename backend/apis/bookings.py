import os
import razorpay
from flask import current_app as app
from flask import jsonify, make_response, request
from flask_restful import Resource
from flask_jwt_extended import get_jwt_identity
from datetime import datetime, timedelta, timezone
import logging
import math
import shortuuid
from razorpay.errors import SignatureVerificationError


def get_razorpay_client():
    api_key = os.environ.get('RAZORPAY_API_KEY')
    api_secret = os.environ.get('RAZORPAY_KEY_SECRET')
    if not api_key or not api_secret:
        raise Exception("Razorpay API key and secret must be set in environment variables.")
    return razorpay.Client(auth=(api_key, api_secret))


class PaymentProviderError(Exception):
    """Razorpay could not be reached or rejected the request."""


def round_half_up(value):
    # Matches JS Math.round for the positive amounts used here (Python's round() uses banker's rounding).
    return int(math.floor(value + 0.5))


def mark_booking_confirmed(mongo_db, booking_filter, razorpay_payment_id):
    """Confirm a pending booking. Conditional on status so verify-payment and the webhook stay idempotent."""
    result = mongo_db['bookings'].update_one(
        {**booking_filter, 'status': 'payment_pending'},
        {'$set': {
            'status': 'confirmed',
            'razorpay_payment_id': razorpay_payment_id,
            'modified_at': datetime.now(),
        }}
    )
    return result.modified_count == 1


class CreateBooking(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']
    
    def create_razorpay_order(self, amount, platform_fee):
        try:
            client = get_razorpay_client()

            order_amount = (amount + platform_fee) * 100  # whole rupees -> paise, as Razorpay expects
            order = client.order.create({
                "amount": order_amount,
                "currency": "INR",
                "receipt": f"razorpay_receipt_{shortuuid.uuid()}"
            })
            return order
        except Exception as e:
            logging.error(f"Error creating Razorpay order: {e}")
            raise PaymentProviderError("Failed to create Razorpay order.") from e

    def create_booking_object(self, start_datetime, end_datetime, turf_id=None, amount=None, razorpay_order_id=None, razorpay_receipt=None):
        booking_id = str(shortuuid.uuid())
        user_id = get_jwt_identity()
        obj = {
            'booking_id': booking_id,
            'turf_id': turf_id,
            'user_id': user_id,
            'start_time': start_datetime,
            'end_time': end_datetime,
            "created_at": datetime.now(),
            "modified_at": datetime.now(),
            "status": "payment_pending",
            "amount": amount,
            "razorpay_order_id": razorpay_order_id,
            "razorpay_receipt": razorpay_receipt

        }
        return obj
    
    def confirm_if_previously_booked(self, start_datetime, end_datetime, turf_id=None):
        # check if there is any booking for the turf in the given time range

        ### defensive check, will never be true as already verified in the post method, but added for safety
        if not turf_id:
            raise ValueError("Turf ID is required to check for existing bookings.")
        if not start_datetime or not end_datetime:
            raise ValueError("Start datetime and end datetime are required to check for existing bookings.")

        existing_booking = self.mongo_db['bookings'].find_one({
            'turf_id': turf_id,
            'start_time': {'$lt': end_datetime},
            'end_time': {'$gt': start_datetime},
            'status': {'$in': ['confirmed', 'payment_pending']}
        })
        if existing_booking:
            return False, "The selected time slot is already booked."
        return True, "The selected time slot is available."
    
    def calculate_amount(self, start_datetime, end_datetime, price_per_hour):
        # Whole rupees, rounded the same way as calculateBookingTotals in src/lib/turfBooking.ts so the charge matches the UI.
        turf_amount = round_half_up(price_per_hour * ((end_datetime - start_datetime).total_seconds() / 3600))
        platform_fee_rate = float(os.environ.get('PLATFORM_FEE_RATE', 0.03))
        minimum_platform_fee = int(os.environ.get('MINIMUM_PLATFORM_FEE', 9))
        platform_fee = max(minimum_platform_fee, round_half_up(turf_amount * platform_fee_rate))
        return turf_amount, platform_fee

    def post(self):
        """Create a new booking for a turf on a specific date and time range --->##to be modified"""
        try:
            payload = request.get_json() or {}
            logging.info(f"CreateBooking.post called with payload: {payload}")

            turf_id = payload.get('turf_id')
            if not turf_id:
                return make_response({'status': 400, 'error': 'Turf ID is required!'}, 400)
            booking_date_str = payload.get('booking_date')
            if not booking_date_str:
                return make_response({'status': 400, 'error': 'Booking date is required!'}, 400)
            
            booking_start_time_str = payload.get('booking_start_time')
            booking_end_time_str = payload.get('booking_end_time')
            if not booking_start_time_str or not booking_end_time_str:
                return make_response({'status': 400, 'error': 'Start time and end time are required!'}, 400)

            try:
                booking_start_datetime = datetime.strptime(f"{booking_date_str} {booking_start_time_str}", "%d-%m-%Y %H:%M").replace(tzinfo=timezone.utc)
                booking_end_datetime = datetime.strptime(f"{booking_date_str} {booking_end_time_str}", "%d-%m-%Y %H:%M").replace(tzinfo=timezone.utc)
            except ValueError:
                return make_response({'status': False, 'error': 'Invalid date/time format!'}, 400)
            
            # The last slot of the day ends at "00:00", which belongs to the next date.
            if booking_end_time_str == "00:00":
                booking_end_datetime += timedelta(days=1)

            logging.info(f"Parsed booking start datetime: {booking_start_datetime}, end datetime: {booking_end_datetime}")

            if booking_end_datetime <= booking_start_datetime:
                return make_response({'status': False, 'error': 'End time must be after start time!'}, 400)

            turf = self.mongo_db['turfs'].find_one({'id': turf_id}, {'price_per_hour': 1, '_id': 0})
            if not turf:
                return make_response({'status': False, 'error': 'Turf not found!'}, 404)
            price_per_hour = turf.get('price_per_hour')
            if isinstance(price_per_hour, bool) or not isinstance(price_per_hour, (int, float)) or price_per_hour <= 0:
                logging.error(f"Turf {turf_id} has invalid price_per_hour: {price_per_hour}")
                return make_response({'status': False, 'error': 'Turf pricing is not available!'}, 400)

            is_available, message = self.confirm_if_previously_booked(booking_start_datetime, booking_end_datetime, turf_id)
            if not is_available:
                return make_response({'status': False, 'error': message}, 409)
            
            amount, platform_fee = self.calculate_amount(booking_start_datetime, booking_end_datetime, price_per_hour)
            logging.info(f"Calculated booking amount: {amount}, Platform fee: {platform_fee}")

            razorpay_order_obj = self.create_razorpay_order(amount, platform_fee)
            razorpay_order_id = razorpay_order_obj.get('id')
            razorpay_receipt = razorpay_order_obj.get('receipt')
            amount = razorpay_order_obj.get('amount') / 100  # convert back to rupees
            
            booking_obj = self.create_booking_object(booking_start_datetime, booking_end_datetime, turf_id, amount, razorpay_order_id, razorpay_receipt)
            self.mongo_db['bookings'].insert_one(booking_obj)

            result = {
                'status': 200,
                'message': 'Booking created successfully',
                'amount': amount,
                'platform_fee': platform_fee,
                "order_id": razorpay_order_id,
                "booking_id": booking_obj['booking_id'],
            }
            
            return make_response({"status": True, "data": result}, 200)
        except PaymentProviderError:
            logging.exception('Payment provider error in CreateBooking.post', exc_info=True)
            return make_response({'status': False, 'error': 'Payment service is unavailable. Please try again shortly.'}, 502)
        except Exception:
            logging.exception('Error in CreateBooking.post', exc_info=True)
            return make_response({'status': False, 'error': 'Something went wrong while creating the booking.'}, 500)


class VerifyPayment(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def post(self):
        """Verify the Razorpay payment signature and confirm the booking"""
        try:
            payload = request.get_json() or {}
            booking_id = payload.get('booking_id')
            razorpay_payment_id = payload.get('razorpay_payment_id')
            razorpay_order_id = payload.get('razorpay_order_id')
            razorpay_signature = payload.get('razorpay_signature')
            if not booking_id or not razorpay_payment_id or not razorpay_order_id or not razorpay_signature:
                return make_response({'status': False, 'error': 'booking_id, razorpay_payment_id, razorpay_order_id and razorpay_signature are required!'}, 400)

            user_id = get_jwt_identity()
            booking = self.mongo_db['bookings'].find_one({'booking_id': booking_id, 'user_id': user_id}, {'_id': 0})
            if not booking:
                return make_response({'status': False, 'error': 'Booking not found!'}, 404)
            if booking.get('razorpay_order_id') != razorpay_order_id:
                return make_response({'status': False, 'error': 'Order does not match this booking!'}, 400)

            try:
                get_razorpay_client().utility.verify_payment_signature({
                    'razorpay_order_id': razorpay_order_id,
                    'razorpay_payment_id': razorpay_payment_id,
                    'razorpay_signature': razorpay_signature,
                })
            except SignatureVerificationError:
                logging.warning(f"Invalid Razorpay signature for booking {booking_id}")
                return make_response({'status': False, 'error': 'Payment verification failed!'}, 400)

            if not mark_booking_confirmed(self.mongo_db, {'booking_id': booking_id}, razorpay_payment_id):
                current = self.mongo_db['bookings'].find_one({'booking_id': booking_id}, {'status': 1, '_id': 0}) or {}
                if current.get('status') != 'confirmed':
                    return make_response({'status': False, 'error': f"Booking cannot be confirmed from status '{current.get('status')}'."}, 409)

            data = {'booking_id': booking_id, 'status': 'confirmed', 'razorpay_payment_id': razorpay_payment_id}
            return make_response({'status': True, 'message': 'Payment verified', 'data': data}, 200)
        except Exception as e:
            logging.exception('Error in VerifyPayment.post', exc_info=True)
            return make_response({'status': False, 'error': 'Something went wrong while verifying the payment.'}, 500)


class BookingDetails(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def get(self, booking_id):
        """Get the current status and details of the caller's booking"""
        try:
            user_id = get_jwt_identity()
            booking = self.mongo_db['bookings'].find_one(
                {'booking_id': booking_id, 'user_id': user_id},
                {'_id': 0, 'booking_id': 1, 'turf_id': 1, 'status': 1, 'start_time': 1, 'end_time': 1, 'amount': 1, 'razorpay_order_id': 1}
            )
            if not booking:
                return make_response({'status': False, 'error': 'Booking not found!'}, 404)

            start_time = booking.pop('start_time')
            end_time = booking.pop('end_time')
            booking['booking_date'] = start_time.strftime("%d-%m-%Y")
            booking['booking_start_time'] = start_time.strftime("%H:%M")
            booking['booking_end_time'] = end_time.strftime("%H:%M")
            return make_response({'status': True, 'data': booking}, 200)
        except Exception as e:
            logging.exception('Error in BookingDetails.get', exc_info=True)
            return make_response({'status': False, 'error': 'Something went wrong while fetching the booking.'}, 500)
