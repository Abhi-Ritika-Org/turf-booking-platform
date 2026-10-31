import hashlib
import hmac
import json
import logging
import os
from datetime import datetime

from config import RAZORPAY_WEBHOOK_SECRET

from fastapi import Depends, Request
from fastapi.responses import JSONResponse

from apis.bookings import mark_booking_confirmed
from config import get_db
from middleware import raw_request_body


CONFIRM_EVENTS = {'payment.captured', 'order.paid'}


def record_event(mongo_db, event_id, event, order_id, payment_id, outcome, payload):
    mongo_db['payment_events'].update_one(
        {'event_id': event_id},
        {'$set': {
            'event': event,
            'razorpay_order_id': order_id,
            'razorpay_payment_id': payment_id,
            'outcome': outcome,
            'payload': payload,
            'processed_at': datetime.now(),
        }},
        upsert=True,
    )


def razorpay_webhook(request: Request, raw_body: bytes = Depends(raw_request_body), mongo_db=Depends(get_db)):
    """Server-to-server payment updates from Razorpay. Public path (no JWT); authenticated by signature.

    The signature covers the exact bytes Razorpay sent, so the body is read raw
    rather than parsed into a model.
    """
    try:
        webhook_secret = RAZORPAY_WEBHOOK_SECRET
        if not webhook_secret:
            # Config problem: 500 so Razorpay retries once the secret is set.
            logging.error("RAZORPAY_WEBHOOK_SECRET is not set; cannot verify webhook.")
            return JSONResponse({'status': False, 'error': 'Webhook not configured'}, status_code=500)

        signature = request.headers.get('X-Razorpay-Signature', '')
        expected = hmac.new(webhook_secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            logging.warning("Razorpay webhook rejected: invalid signature")
            return JSONResponse({'status': False, 'error': 'Invalid signature'}, status_code=400)

        body = json.loads(raw_body)
        event = body.get('event')
        event_id = request.headers.get('X-Razorpay-Event-Id') or f"{event}:{body.get('created_at')}"
        payment = (body.get('payload', {}).get('payment') or {}).get('entity') or {}
        order = (body.get('payload', {}).get('order') or {}).get('entity') or {}
        order_id = payment.get('order_id') or order.get('id')
        payment_id = payment.get('id')
        logging.info(f"Razorpay webhook {event} (event {event_id}) for order {order_id}, payment {payment_id}")

        already = mongo_db['payment_events'].find_one({'event_id': event_id}, {'_id': 0, 'outcome': 1})
        if already:
            return JSONResponse({'status': True, 'message': 'Duplicate event ignored'}, status_code=200)

        if event not in CONFIRM_EVENTS and event != 'payment.failed':
            record_event(mongo_db, event_id, event, order_id, payment_id, 'ignored', body)
            return JSONResponse({'status': True, 'message': 'Event ignored'}, status_code=200)

        booking = mongo_db['bookings'].find_one({'razorpay_order_id': order_id}, {'_id': 0}) if order_id else None
        if not booking:
            logging.warning(f"Razorpay webhook {event}: no booking for order {order_id}")
            record_event(mongo_db, event_id, event, order_id, payment_id, 'booking_not_found', body)
            return JSONResponse({'status': True, 'message': 'No matching booking'}, status_code=200)

        if event == 'payment.failed':
            # Booking stays payment_pending: the user may retry payment on the same order until it expires.
            record_event(mongo_db, event_id, event, order_id, payment_id, 'payment_failed', body)
            return JSONResponse({'status': True, 'message': 'Payment failure recorded'}, status_code=200)

        expected_paise = int(round(float(booking.get('amount') or 0) * 100))
        paid_paise = payment.get('amount') if payment else order.get('amount_paid')
        if paid_paise != expected_paise:
            logging.error(
                f"Razorpay webhook amount mismatch for booking {booking.get('booking_id')}: "
                f"paid {paid_paise}, expected {expected_paise}"
            )
            record_event(mongo_db, event_id, event, order_id, payment_id, 'amount_mismatch', body)
            return JSONResponse({'status': True, 'message': 'Amount mismatch recorded'}, status_code=200)

        if mark_booking_confirmed(mongo_db, {'booking_id': booking['booking_id']}, payment_id):
            outcome = 'confirmed'
        elif booking.get('status') == 'confirmed':
            outcome = 'already_confirmed'
        else:
            # Paid but the booking is no longer pending (e.g. expired): needs reconciliation/refund.
            logging.error(
                f"Razorpay payment {payment_id} captured for booking {booking.get('booking_id')} "
                f"in status '{booking.get('status')}'"
            )
            outcome = f"paid_in_status_{booking.get('status')}"

        record_event(mongo_db, event_id, event, order_id, payment_id, outcome, body)
        return JSONResponse({'status': True, 'message': outcome}, status_code=200)
    except Exception:
        # 500 makes Razorpay retry; the confirm step is idempotent so retries are safe.
        logging.exception('Error in razorpay_webhook')
        return JSONResponse({'status': False, 'error': 'Webhook processing failed'}, status_code=500)
