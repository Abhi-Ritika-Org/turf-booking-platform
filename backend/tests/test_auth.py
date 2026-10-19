from tests.conftest import SIGNUP_PAYLOAD, body


def test_health_check(client):
    response = client.get('/health-check')
    assert response.status_code == 200
    assert body(response)['data'] == 'Success'


class TestSignup:
    def test_success_lowercases_email_and_hashes_password(self, client, mongo_db):
        response = client.post('/api/auth/user-signup', json=SIGNUP_PAYLOAD)
        assert response.status_code == 200, body(response)

        stored = mongo_db['users'].find_one({'email': 'player@example.com'})
        assert stored is not None
        assert stored['password'] != SIGNUP_PAYLOAD['password']
        assert stored['user_id']

    def test_response_never_contains_password(self, client):
        response = client.post('/api/auth/user-signup', json=SIGNUP_PAYLOAD)
        assert 'password' not in str(body(response))

    def test_missing_fields_are_rejected(self, client):
        for field in ('email', 'mobile', 'full_name', 'password'):
            payload = {k: v for k, v in SIGNUP_PAYLOAD.items() if k != field}
            response = client.post('/api/auth/user-signup', json=payload)
            assert response.status_code == 400, (field, body(response))
            assert body(response)['error']

    def test_invalid_email_is_rejected(self, client):
        response = client.post('/api/auth/user-signup', json={**SIGNUP_PAYLOAD, 'email': 'not-an-email'})
        assert response.status_code == 400

    def test_invalid_mobile_is_rejected(self, client):
        response = client.post('/api/auth/user-signup', json={**SIGNUP_PAYLOAD, 'mobile': '12'})
        assert response.status_code == 400

    def test_short_password_is_rejected(self, client):
        response = client.post('/api/auth/user-signup', json={**SIGNUP_PAYLOAD, 'password': 'short'})
        assert response.status_code == 400

    def test_duplicate_email_conflicts(self, client, signed_up_user):
        response = client.post('/api/auth/user-signup', json=SIGNUP_PAYLOAD)
        assert response.status_code == 409


class TestLogin:
    def test_success_returns_token_and_sets_refresh_cookie(self, client, signed_up_user, redis_client):
        response = client.post(
            '/api/auth/user-login',
            json={'email': SIGNUP_PAYLOAD['email'], 'password': SIGNUP_PAYLOAD['password']},
        )
        assert response.status_code == 200, body(response)
        assert body(response)['access_token']

        cookie_header = str(response.headers)
        assert 'refresh_token' in cookie_header
        assert 'HttpOnly' in cookie_header
        assert redis_client.get(f"login_session:{signed_up_user['user_id']}") == 'active'

    def test_missing_credentials_are_rejected(self, client):
        assert client.post('/api/auth/user-login', json={}).status_code == 400
        assert client.post('/api/auth/user-login', json={'email': 'a@b.com'}).status_code == 400

    def test_unknown_user_is_rejected(self, client):
        response = client.post('/api/auth/user-login', json={'email': 'nobody@example.com', 'password': 'password123'})
        assert response.status_code == 400

    def test_wrong_password_is_rejected(self, client, signed_up_user):
        response = client.post(
            '/api/auth/user-login',
            json={'email': SIGNUP_PAYLOAD['email'], 'password': 'wrongpassword'},
        )
        assert response.status_code == 400

    def test_second_login_while_session_active_conflicts(self, client, access_token):
        response = client.post(
            '/api/auth/user-login',
            json={'email': SIGNUP_PAYLOAD['email'], 'password': SIGNUP_PAYLOAD['password']},
        )
        assert response.status_code == 409


class TestProtectedRoutes:
    def test_missing_token_is_unauthorized(self, client):
        response = client.post('/api/turfs/turf-list', json={})
        assert response.status_code == 401
        assert body(response)['error']

    def test_malformed_token_is_unauthorized(self, client):
        response = client.post('/api/turfs/turf-list', json={}, headers={'Authorization': 'Bearer not.a.token'})
        assert response.status_code == 401

    def test_valid_token_is_accepted(self, client, auth_headers, turf):
        response = client.post('/api/turfs/turf-list', json={}, headers=auth_headers)
        assert response.status_code == 200, body(response)


class TestRefresh:
    def test_without_cookie_is_unauthorized(self, client):
        response = client.post('/api/auth/refresh')
        assert response.status_code == 401

    def test_with_cookie_returns_new_access_token(self, client, access_token):
        response = client.post('/api/auth/refresh')
        assert response.status_code == 200, body(response)
        assert body(response)['access_token']

    def test_refreshed_token_works_on_protected_route(self, client, access_token, turf):
        refreshed = body(client.post('/api/auth/refresh'))['access_token']
        response = client.post(
            '/api/turfs/turf-list', json={}, headers={'Authorization': f'Bearer {refreshed}'}
        )
        assert response.status_code == 200, body(response)


class TestLogout:
    def test_clears_session_and_cookie(self, client, auth_headers, user_id, redis_client):
        response = client.post('/api/auth/user-logout', headers=auth_headers)
        assert response.status_code == 200, body(response)
        assert redis_client.get(f'login_session:{user_id}') is None

    def test_allows_logging_in_again(self, client, auth_headers):
        assert client.post('/api/auth/user-logout', headers=auth_headers).status_code == 200
        response = client.post(
            '/api/auth/user-login',
            json={'email': SIGNUP_PAYLOAD['email'], 'password': SIGNUP_PAYLOAD['password']},
        )
        assert response.status_code == 200, body(response)

    def test_requires_an_access_token(self, client):
        # Logout is not a public path: it needs the bearer token as well as the cookie.
        assert client.post('/api/auth/user-logout').status_code == 401


class TestCurrentUserData:
    def test_returns_profile_without_password(self, client, auth_headers, user_id):
        response = client.get('/api/auth/current-user-data', headers=auth_headers)
        assert response.status_code == 200, body(response)
        data = body(response)
        assert data['user_id'] == user_id
        assert data['email'] == 'player@example.com'
        assert 'password' not in data

    def test_requires_a_token(self, client):
        assert client.get('/api/auth/current-user-data').status_code == 401


class TestErrorShapes:
    def test_schema_violations_return_400_not_422(self, client, auth_headers, turf):
        response = client.post('/api/turfs/turf-list', json={'limit': 'ten'}, headers=auth_headers)
        assert response.status_code == 400, body(response)
        assert body(response)['error']

    def test_unknown_path_returns_json(self, client):
        response = client.get('/api/does-not-exist')
        assert response.status_code == 404
        assert body(response)['error']

    def test_openapi_schema_is_served(self, client):
        response = client.get('/openapi.json')
        assert response.status_code == 200
        paths = body(response)['paths']
        for path in (
            '/api/auth/user-login',
            '/api/turfs/turf-details/{turf_id}',
            '/api/bookings/create-booking',
            '/api/webhook/razorpay',
        ):
            assert path in paths


class TestLogoutWithoutCookie:
    def test_still_clears_the_session(self, client, auth_headers, user_id, redis_client):
        # A lost/expired refresh cookie must not leave the session key behind,
        # or the next login fails with 409 until the key expires.
        client.cookies.clear()
        response = client.post('/api/auth/user-logout', headers=auth_headers)
        assert response.status_code == 200, body(response)
        assert redis_client.get(f'login_session:{user_id}') is None
