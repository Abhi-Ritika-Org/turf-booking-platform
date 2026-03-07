import traceback

from apis.auth import RefreshAccessToken, UserLogin, UserLogout, UserSignup
from apis.bookings import CreateBooking, ListBookings

AUTH_PATH = "auth"
BOOKINGS_PATH = "bookings"


def create_routes(api):
    try:
        api.add_resource(UserSignup, f"{AUTH_PATH}/user-signup")
        api.add_resource(UserLogin, f"{AUTH_PATH}/user-login")
        api.add_resource(RefreshAccessToken, f"{AUTH_PATH}/refresh")
        api.add_resource(UserLogout, f"{AUTH_PATH}/user-logout")
        
        # Bookings routes
        api.add_resource(CreateBooking, f"{BOOKINGS_PATH}/create")
        api.add_resource(ListBookings, f"{BOOKINGS_PATH}/list")
    except Exception:
        print("Error in routes")
        print(traceback.format_exc())

