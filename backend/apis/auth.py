from flask import g, jsonify, make_response, request
from flask import current_app as app
from flask_restful import Resource
from flask_jwt_extended import create_access_token, create_refresh_token, verify_jwt_in_request, get_jwt_identity, set_refresh_cookies
from datetime import datetime 
import logging
import shortuuid
import re
import phonenumbers
from phonenumbers.phonenumberutil import NumberParseException

class UserSignup(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']
        self.pwd_ctx = app.config['PWD_CONTEXT']

    def is_email_valid(self, email: str) -> bool:
        if not email:
            return False
        email_regex = r"^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z]{2,})+$"
        return bool(re.fullmatch(email_regex, email))

    def is_mobile_valid(self, mobile: str) -> bool:
        try:
            if not mobile:
                return False
            m_raw = str(mobile).strip()
            # If already E.164, parse directly
            if m_raw.startswith('+'):
                parsed = phonenumbers.parse(m_raw, None)
                return phonenumbers.is_valid_number(parsed)

            # Remove non-digit characters and treat as international by prepending '+'
            digits = ''.join(ch for ch in m_raw if ch.isdigit())
            # Basic length sanity check for international numbers
            if len(digits) < 7 or len(digits) > 15:
                return False
            try:
                parsed = phonenumbers.parse('+' + digits, None)
                return phonenumbers.is_valid_number(parsed)
            except NumberParseException:
                return False
        except Exception:
            logging.exception("Error validating mobile number")
            return False

    def post(self):
        try:
            data = request.get_json() or {}
            fields = list(data.keys())
            if "email" not in fields:
                return make_response({'status': 400,'error': "Email is required"}, 400)
            elif "mobile" not in fields:
                return make_response({'status': 400,'error': "Mobile Number is required"}, 400)
            elif "full_name" not in fields:
                return make_response({'status': 400,'error': "Name is required"}, 400)
            elif "password" not in fields:
               return make_response({'status': 400,'error': "Password is required"}, 400) 
            
            mobile = str(data.get('mobile')).strip()
            email = str(data.get('email')).strip().lower()
            full_name = str(data.get('full_name')).strip()
            password = data.get('password')

            # Basic validations
            if not  self.is_email_valid(email):
                return make_response({"status": 400, "error": "Enter valid email"}, 400)

            # Validate mobile number format
            if not self.is_mobile_valid(mobile):
                return make_response({'status': 400, 'error': 'Enter a valid mobile number (include country code or provide local number)'}, 400)

            if len(password) < 8:
                return make_response({'status': 400, 'error': 'Password must be at least 8 characters'}, 400)

            # Check for existing user by email, mobile or username
            existing = self.mongo_db.users.find_one({'email': email}, {"_id":0})
            if existing:
                return make_response({'status': 409, 'error': 'Email already exists'}, 409)

            # Hash the password (bcrypt via passlib). This is irreversible by design and is the secure best practice.
            hashed = self.pwd_ctx.hash(password)
            uid = shortuuid.ShortUUID().random(length=6)

            user_doc = {
                "user_id": uid,
                'email': email,
                'mobile': mobile,
                'full_name': full_name,
                'password': hashed,
                'created_at': datetime.now()
            }

            res = self.mongo_db.users.insert_one(user_doc)
            if res.inserted_id:
                return make_response({'status': 200, 'message': 'User signed up successfully'}, 200)
            else:
                return make_response({'status': 500, 'error': 'Error in user signup'}, 500)
        except Exception:
            logging.exception('Error in UserSignup.post')
            return make_response({'status' : 500, 'error': 'Error in user signup'}, 500)

class UserLogin(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']
        self.pwd_ctx = app.config['PWD_CONTEXT']
        self.jwt_refresh_token_expires = app.config['JWT_REFRESH_TOKEN_EXPIRES']

    def post(self):
        try:
            data = request.get_json() or {}
            email = str(data.get('email', '')).strip().lower()
            password = data.get('password')

            if not email or not password:
                return make_response({'status': 400, 'error': 'Email and password are required'}, 400)
            
            user = self.mongo_db.users.find_one({'email': email}, {'_id': 0})

            if not user:
                return make_response({'status': 400, 'error': 'User does not exists'}, 400)
            
            if not self.pwd_ctx.verify(password, user.get('password', '')):
                return make_response({'status': 400, 'error': 'Email and password does not match'}, 400)

            access_token = create_access_token(identity=user['user_id'])
            refresh_token = create_refresh_token(identity=user['user_id'])

            resp = make_response(jsonify({
                'status': 200,
                'access_token': access_token
            }), 200)

            refresh_expires = self.jwt_refresh_token_expires
            set_refresh_cookies(
                resp,
                refresh_token,
                max_age=int(refresh_expires.total_seconds())
            )
            return resp
        except Exception:
            logging.exception('Error in UserLogin.post')
            return make_response({'status': 500, 'error': 'Login failed'}, 500)

class RefreshAccessToken(Resource):
    def post(self):
        try:
            verify_jwt_in_request(refresh=True, locations=['cookies'])
            user_id = get_jwt_identity()
            new_access = create_access_token(identity=user_id)
            return make_response({'status': 200, 'access_token': new_access}, 200)
        except Exception:
            logging.debug('Refresh token invalid or expired', exc_info=True)
            return make_response({'status': 401, 'error': 'Refresh token expired or invalid'}, 401)


class UserMe(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def get(self):
        # Identity is injected by middleware for protected routes
        user_id = getattr(g, 'current_user_id', None)
        if not user_id:
            return make_response({'status': 401, 'error': 'Unauthorized'}, 401)
        user = self.mongo_db.users.find_one({'user_id': user_id}, {'_id': 0, 'password': 0})
        if not user:
            return make_response({'status': 404, 'error': 'User not found'}, 404)
        return make_response({'status': 200, 'user': user}, 200)
