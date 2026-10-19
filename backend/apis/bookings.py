import logging
import math
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import razorpay
import shortuuid
from fastapi import Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from razorpay.errors import SignatureVerificationError

from config import get_db
from middleware import current_user_id



def get_razorpay_client():
    api_key = os.environ.get('RAZORPAY_API_KEY')
    api_secret = os.environ.get('RAZORPAY_KEY_SECRET')
    if not api_key or not api_secret:
        raise Exception("Razorpay API key and secret must be set in environment variables.")
    return razorpay.Client(auth=(api_key, api_secret))


class PaymentProviderError(Exception):
    """Razorpay could not be reached or rejected the request."""


class CreateBookingRequest(BaseModel):
    # Optional so that missing fields produce this module's own 400 messages
    # instead of FastAPI's generic validation error.
    turf_id: Optional[str] = None
    booking_date: Optional[str] = None
    booking_start_time: Optional[str] = None
    booking_end_time: Optional[str] = None


class VerifyPaymentRequest(BaseModel):
    booking_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_order_id: Optional[str] = None
    razorpay_signature: Optional[str] = None


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


def create_razorpay_order(amount, platform_fee):
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


def create_booking_object(user_id, start_datetime, end_datetime, turf_id=None, amount=None, razorpay_order_id=None, razorpay_receipt=None):
    return {
        'booking_id': str(shortuuid.uuid()),
        'turf_id': turf_id,
        'user_id': user_id,
        'start_time': start_datetime,
        'end_time': end_datetime,
        "created_at": datetime.now(),
        "modified_at": datetime.now(),
        "status": "payment_pending",
        "amount": amount,
        "razorpay_order_id": razorpay_order_id,
        "razorpay_receipt": razorpay_receipt,
    }


def confirm_if_previously_booked(mongo_db, start_datetime, end_datetime, turf_id=None):
    # check if there is any booking for the turf in the given time range

    ### defensive check, will never be true as already verified in the endpoint, but added for safety
    if not turf_id:
        raise ValueError("Turf ID is required to check for existing bookings.")
    if not start_datetime or not end_datetime:
        raise ValueError("Start datetime and end datetime are required to check for existing bookings.")

    existing_booking = mongo_db['bookings'].find_one({
        'turf_id': turf_id,
        'start_time': {'$lt': end_datetime},
        'end_time': {'$gt': start_datetime},
        'status': {'$in': ['confirmed', 'payment_pending']}
    })
    if existing_booking:
        return False, "The selected time slot is already booked."
    return True, "The selected time slot is available."


def calculate_amount(start_datetime, end_datetime, price_per_hour):
    # Whole rupees, rounded the same way as calculateBookingTotals in src/lib/turfBooking.ts so the charge matches the UI.
    turf_amount = round_half_up(price_per_hour * ((end_datetime - start_datetime).total_seconds() / 3600))
    platform_fee_rate = float(os.environ.get('PLATFORM_FEE_RATE', 0.03))
    minimum_platform_fee = int(os.environ.get('MINIMUM_PLATFORM_FEE', 9))
    platform_fee = max(minimum_platform_fee, round_half_up(turf_amount * platform_fee_rate))
    return turf_amount, platform_fee


def create_booking(
    payload: CreateBookingRequest,
    user_id: str = Depends(current_user_id),
    mongo_db=Depends(get_db),
):
    """Create a new booking for a turf on a specific date and time range"""
    try:
        logging.info(f"create_booking called with payload: {payload}")

        if not payload.turf_id:
            return JSONResponse({'status': 400, 'error': 'Turf ID is required!'}, status_code=400)
        if not payload.booking_date:
            return JSONResponse({'status': 400, 'error': 'Booking date is required!'}, status_code=400)
        if not payload.booking_start_time or not payload.booking_end_time:
            return JSONResponse({'status': 400, 'error': 'Start time and end time are required!'}, status_code=400)

        turf_id = payload.turf_id
        try:
            booking_start_datetime = datetime.strptime(
                f"{payload.booking_date} {payload.booking_start_time}", "%d-%m-%Y %H:%M"
            ).replace(tzinfo=timezone.utc)
            booking_end_datetime = datetime.strptime(
                f"{payload.booking_date} {payload.booking_end_time}", "%d-%m-%Y %H:%M"
            ).replace(tzinfo=timezone.utc)
        except ValueError:
            return JSONResponse({'status': False, 'error': 'Invalid date/time format!'}, status_code=400)

        # The last slot of the day ends at "00:00", which belongs to the next date.
        if payload.booking_end_time == "00:00":
            booking_end_datetime += timedelta(days=1)

        logging.info(f"Parsed booking start datetime: {booking_start_datetime}, end datetime: {booking_end_datetime}")

        if booking_end_datetime <= booking_start_datetime:
            return JSONResponse({'status': False, 'error': 'End time must be after start time!'}, status_code=400)

        turf = mongo_db['turfs'].find_one({'id': turf_id}, {'price_per_hour': 1, '_id': 0})
        if not turf:
            return JSONResponse({'status': False, 'error': 'Turf not found!'}, status_code=404)
        price_per_hour = turf.get('price_per_hour')
        if isinstance(price_per_hour, bool) or not isinstance(price_per_hour, (int, float)) or price_per_hour <= 0:
            logging.error(f"Turf {turf_id} has invalid price_per_hour: {price_per_hour}")
            return JSONResponse({'status': False, 'error': 'Turf pricing is not available!'}, status_code=400)

        is_available, message = confirm_if_previously_booked(
            mongo_db, booking_start_datetime, booking_end_datetime, turf_id
        )
        if not is_available:
            return JSONResponse({'status': False, 'error': message}, status_code=409)

        amount, platform_fee = calculate_amount(booking_start_datetime, booking_end_datetime, price_per_hour)
        logging.info(f"Calculated booking amount: {amount}, Platform fee: {platform_fee}")

        razorpay_order_obj = create_razorpay_order(amount, platform_fee)
        razorpay_order_id = razorpay_order_obj.get('id')
        razorpay_receipt = razorpay_order_obj.get('receipt')
        amount = razorpay_order_obj.get('amount') / 100  # convert back to rupees

        booking_obj = create_booking_object(
            user_id, booking_start_datetime, booking_end_datetime, turf_id, amount, razorpay_order_id, razorpay_receipt
        )
        mongo_db['bookings'].insert_one(booking_obj)

        result = {
            'status': 200,
            'message': 'Booking created successfully',
            'amount': amount,
            'platform_fee': platform_fee,
            "order_id": razorpay_order_id,
            "booking_id": booking_obj['booking_id'],
        }

        return JSONResponse({"status": True, "data": result}, status_code=200)
    except PaymentProviderError:
        logging.exception('Payment provider error in create_booking')
        return JSONResponse(
            {'status': False, 'error': 'Payment service is unavailable. Please try again shortly.'}, status_code=502
        )
    except Exception:
        logging.exception('Error in create_booking')
        return JSONResponse(
            {'status': False, 'error': 'Something went wrong while creating the booking.'}, status_code=500
        )


def verify_payment(
    payload: VerifyPaymentRequest,
    user_id: str = Depends(current_user_id),
    mongo_db=Depends(get_db),
):
    """Verify the Razorpay payment signature and confirm the booking"""
    try:
        booking_id = payload.booking_id
        razorpay_payment_id = payload.razorpay_payment_id
        razorpay_order_id = payload.razorpay_order_id
        razorpay_signature = payload.razorpay_signature
        if not booking_id or not razorpay_payment_id or not razorpay_order_id or not razorpay_signature:
            return JSONResponse(
                {'status': False, 'error': 'booking_id, razorpay_payment_id, razorpay_order_id and razorpay_signature are required!'},
                status_code=400,
            )

        booking = mongo_db['bookings'].find_one({'booking_id': booking_id, 'user_id': user_id}, {'_id': 0})
        if not booking:
            return JSONResponse({'status': False, 'error': 'Booking not found!'}, status_code=404)
        if booking.get('razorpay_order_id') != razorpay_order_id:
            return JSONResponse({'status': False, 'error': 'Order does not match this booking!'}, status_code=400)

        try:
            get_razorpay_client().utility.verify_payment_signature({
                'razorpay_order_id': razorpay_order_id,
                'razorpay_payment_id': razorpay_payment_id,
                'razorpay_signature': razorpay_signature,
            })
        except SignatureVerificationError:
            logging.warning(f"Invalid Razorpay signature for booking {booking_id}")
            return JSONResponse({'status': False, 'error': 'Payment verification failed!'}, status_code=400)

        if not mark_booking_confirmed(mongo_db, {'booking_id': booking_id}, razorpay_payment_id):
            current = mongo_db['bookings'].find_one({'booking_id': booking_id}, {'status': 1, '_id': 0}) or {}
            if current.get('status') != 'confirmed':
                return JSONResponse(
                    {'status': False, 'error': f"Booking cannot be confirmed from status '{current.get('status')}'."},
                    status_code=409,
                )

        data = {'booking_id': booking_id, 'status': 'confirmed', 'razorpay_payment_id': razorpay_payment_id}
        return JSONResponse({'status': True, 'message': 'Payment verified', 'data': data}, status_code=200)
    except Exception:
        logging.exception('Error in verify_payment')
        return JSONResponse(
            {'status': False, 'error': 'Something went wrong while verifying the payment.'}, status_code=500
        )


def booking_details(
    booking_id: str,
    user_id: str = Depends(current_user_id),
    mongo_db=Depends(get_db),
):
    """Get the current status and details of the caller's booking"""
    try:
        booking = mongo_db['bookings'].find_one(
            {'booking_id': booking_id, 'user_id': user_id},
            {'_id': 0, 'booking_id': 1, 'turf_id': 1, 'status': 1, 'start_time': 1, 'end_time': 1, 'amount': 1, 'razorpay_order_id': 1}
        )
        if not booking:
            return JSONResponse({'status': False, 'error': 'Booking not found!'}, status_code=404)

        start_time = booking.pop('start_time')
        end_time = booking.pop('end_time')
        booking['booking_date'] = start_time.strftime("%d-%m-%Y")
        booking['booking_start_time'] = start_time.strftime("%H:%M")
        booking['booking_end_time'] = end_time.strftime("%H:%M")
        return JSONResponse({'status': True, 'data': booking}, status_code=200)
    except Exception:
        logging.exception('Error in booking_details')
        return JSONResponse(
            {'status': False, 'error': 'Something went wrong while fetching the booking.'}, status_code=500
        )
