import logging
from flask import current_app as app
from flask import jsonify, make_response, request
from flask_restful import Resource
from datetime import datetime
# from backend.helpers.parse_dates import get_parsed_dates
from helpers.S3_service import S3Service
from helpers.paginate_data import paginate_data

class CreateTurf(Resource):
    def __init__(self, db):
        self.db = db

    def post(self):
        """Create a new turf --->##to be modified"""
        try:
            payload = request.get_json() or {}
            logging.info(f"CreateTurf.post called with payload: {payload}")
            
            # For testing: accept empty payload and return success
            result = {
                'status': 200,
                'message': 'Turf created successfully',
                'payload': payload,
                'received_at': datetime.utcnow().isoformat()
            }
            
            return make_response(jsonify(result), 200)
        except Exception as e:
            logging.exception('Error in CreateTurf.post', exc_info=True)
            return make_response({'status': 500, 'error': str(e)}, 500)


class TurfList(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']
        self.bucket_name = app.config['S3_TURF_ASSETS_BUCKET']
        # self.s3_base_url = app.config.get('S3_BASE_URL', '')
        self.s3_base_url = "https://invalid_url_for_testing_purposes.com"

    def post(self):
        """List all turfs"""
        try:
            data = request.get_json() or {}
            offset = data.get('offset', 0)
            limit = data.get('limit', 10)
            skip = offset * limit
            # start_date, end_date = get_parsed_dates(start_date, end_date)
            
            turfs = list(self.mongo_db['turfs'].find({}, {'_id': 0}).skip(skip).limit(limit))
            # turfs = paginate_data(turfs, offset, limit)
            total_turfs = self.mongo_db['turfs'].count_documents({})
            if turfs:
                for turf in turfs:
                    thumbnail_key = turf.get('thumbnail')
                    if thumbnail_key:
                        turf['thumbnail_url'] = f"{self.s3_base_url}/{thumbnail_key}/paused"
            
                return make_response(jsonify({ "status": True, "data" : turfs, "total": total_turfs}), 200)
            else:
                return make_response({"status": False, "message": "No turfs found"}, 404)
        except Exception as e:
            logging.exception("Error in TurfList.get", exc_info=True)
            return make_response({"status": False, "error": str(e)}, 500)
        