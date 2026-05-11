import traceback

from apis.auth import RefreshAccessToken, UserLogin, UserLogout, UserSignup, CurrentUserData
from apis.bookings import CreateBooking, ListBookings
from apis.turfs import TurfList

AUTH_PATH = "auth"
BOOKINGS_PATH = "bookings"
TURFS_PATH = "turfs"

def create_routes(api):
    try:
        api.add_resource(UserSignup, f"{AUTH_PATH}/user-signup")
        api.add_resource(UserLogin, f"{AUTH_PATH}/user-login")
        api.add_resource(RefreshAccessToken, f"{AUTH_PATH}/refresh")
        api.add_resource(UserLogout, f"{AUTH_PATH}/user-logout")
        api.add_resource(CurrentUserData, f"{AUTH_PATH}/current-user-data")
        
        # Bookings routes
        api.add_resource(CreateBooking, f"{BOOKINGS_PATH}/create")
        api.add_resource(ListBookings, f"{BOOKINGS_PATH}/list")

        # Turf routes
        api.add_resource(TurfList, f"{TURFS_PATH}/list")
    except Exception:
        print("Error in routes")
        print(traceback.format_exc())

