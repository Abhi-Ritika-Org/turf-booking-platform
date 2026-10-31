"""The single place where routes are registered.

Adding an endpoint = write the function in `apis/` and `add_api_route` it here.
Routes that need a logged-in user carry the `current_user_id` dependency (set on
the whole router where every route needs it); a route is public simply by not
having it.
"""
from fastapi import APIRouter, Depends

from apis import auth, bookings, turfs, webhooks
from middleware import current_user_id

AUTH_PATH = "auth"
BOOKINGS_PATH = "bookings"
TURFS_PATH = "turfs"
WEBHOOK_PATH = "webhook"


def create_api_router() -> APIRouter:
    api_router = APIRouter()

    # Auth routes. user-signup / user-login / refresh are public; user-logout and
    # current-user-data validate the access token themselves via Depends in apis/auth.py.
    auth_router = APIRouter()
    auth_router.add_api_route("/user-signup", auth.user_signup, methods=["POST"])
    auth_router.add_api_route("/user-login", auth.user_login, methods=["POST"])
    auth_router.add_api_route("/refresh", auth.refresh_access_token, methods=["POST"])
    auth_router.add_api_route("/user-logout", auth.user_logout, methods=["POST"])
    auth_router.add_api_route("/current-user-data", auth.current_user_data, methods=["GET"])
    api_router.include_router(auth_router, prefix=f"/{AUTH_PATH}", tags=["auth"])

    # Bookings routes (all require a valid access token)
    bookings_router = APIRouter()
    bookings_router.add_api_route("/create-booking", bookings.create_booking, methods=["POST"])
    bookings_router.add_api_route("/verify-payment", bookings.verify_payment, methods=["POST"])
    bookings_router.add_api_route("/booking-details/{booking_id}", bookings.booking_details, methods=["GET"])
    # bookings_router.add_api_route("/list", bookings.list_bookings, methods=["GET"])
    api_router.include_router(
        bookings_router,
        prefix=f"/{BOOKINGS_PATH}",
        tags=["bookings"],
        dependencies=[Depends(current_user_id)],
    )

    # Turf routes (all require a valid access token)
    turfs_router = APIRouter()
    turfs_router.add_api_route("/turf-list", turfs.turf_list, methods=["POST"])
    turfs_router.add_api_route("/turf-details/{turf_id}", turfs.turf_details, methods=["GET"])
    api_router.include_router(
        turfs_router,
        prefix=f"/{TURFS_PATH}",
        tags=["turfs"],
        dependencies=[Depends(current_user_id)],
    )

    # Webhook routes (called by external services, not the frontend; no JWT)
    webhook_router = APIRouter()
    webhook_router.add_api_route("/razorpay", webhooks.razorpay_webhook, methods=["POST"])
    api_router.include_router(webhook_router, prefix=f"/{WEBHOOK_PATH}", tags=["webhooks"])

    return api_router
