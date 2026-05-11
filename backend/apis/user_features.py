from datetime import datetime

from flask import current_app as app
from flask import make_response, request
from flask_jwt_extended import get_jwt_identity
from flask_restful import Resource


class Notifications(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def get(self):
        try:
            user_id = get_jwt_identity()
            docs = list(
                self.mongo_db.notifications.find(
                    {'user_id': user_id},
                    {'_id': 0},
                ).sort([('created_at', -1)])
            )
            for doc in docs:
                created = doc.get('created_at')
                if isinstance(created, datetime):
                    doc['created_at'] = created.isoformat()
            return make_response({'status': 200, 'data': docs}, 200)
        except Exception as e:
            return make_response({'status': 500, 'error': str(e)}, 500)


class Favorites(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def get(self):
        try:
            user_id = get_jwt_identity()
            docs = list(
                self.mongo_db.favorites.find(
                    {'user_id': user_id},
                    {'_id': 0},
                ).sort([('created_at', -1)])
            )
            for doc in docs:
                created = doc.get('created_at')
                if isinstance(created, datetime):
                    doc['created_at'] = created.isoformat()
            return make_response({'status': 200, 'data': docs}, 200)
        except Exception as e:
            return make_response({'status': 500, 'error': str(e)}, 500)

    def post(self):
        try:
            user_id = get_jwt_identity()
            data = request.get_json() or {}
            turf_id = str(data.get('turf_id', '')).strip()
            turf_name = str(data.get('turf_name', '')).strip()

            if not turf_id or not turf_name:
                return make_response({'status': 400, 'error': 'turf_id and turf_name are required'}, 400)

            existing = self.mongo_db.favorites.find_one({'user_id': user_id, 'turf_id': turf_id}, {'_id': 0})
            if existing:
                return make_response({'status': 200, 'message': 'Already in favorites'}, 200)

            self.mongo_db.favorites.insert_one(
                {
                    'user_id': user_id,
                    'turf_id': turf_id,
                    'turf_name': turf_name,
                    'created_at': datetime.utcnow(),
                }
            )
            return make_response({'status': 201, 'message': 'Added to favorites'}, 201)
        except Exception as e:
            return make_response({'status': 500, 'error': str(e)}, 500)


class FavoriteItem(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def delete(self, turf_id):
        try:
            user_id = get_jwt_identity()
            deleted = self.mongo_db.favorites.delete_one({'user_id': user_id, 'turf_id': str(turf_id)})
            if deleted.deleted_count == 0:
                return make_response({'status': 404, 'error': 'Favorite not found'}, 404)
            return make_response({'status': 200, 'message': 'Removed from favorites'}, 200)
        except Exception as e:
            return make_response({'status': 500, 'error': str(e)}, 500)


class WalletSummary(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']

    def get(self):
        try:
            user_id = get_jwt_identity()
            wallet = self.mongo_db.wallets.find_one({'user_id': user_id}, {'_id': 0})
            if not wallet:
                wallet = {
                    'user_id': user_id,
                    'balance': 0,
                    'currency': 'INR',
                    'payment_methods': [],
                    'updated_at': datetime.utcnow().isoformat(),
                }
                self.mongo_db.wallets.insert_one(
                    {
                        'user_id': user_id,
                        'balance': 0,
                        'currency': 'INR',
                        'payment_methods': [],
                        'updated_at': datetime.utcnow(),
                    }
                )
            else:
                updated = wallet.get('updated_at')
                if isinstance(updated, datetime):
                    wallet['updated_at'] = updated.isoformat()

            return make_response({'status': 200, 'data': wallet}, 200)
        except Exception as e:
            return make_response({'status': 500, 'error': str(e)}, 500)
