import traceback

from apis.auth import RefreshAccessToken, UserLogin, UserMe, UserSignup

AUTH_PATH = "auth"


def create_routes(api):
    try:
        api.add_resource(UserSignup, f"{AUTH_PATH}/user-signup")
        api.add_resource(UserLogin, f"{AUTH_PATH}/user-login")
        api.add_resource(RefreshAccessToken, f"{AUTH_PATH}/refresh")
        api.add_resource(UserMe, "me")
    except Exception:
        print("Error in routes")
        print(traceback.format_exc())

