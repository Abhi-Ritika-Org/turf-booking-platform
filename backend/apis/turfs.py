import logging
from flask import current_app as app
from flask import jsonify, make_response, request
from flask_restful import Resource
from datetime import datetime, timedelta, timezone
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
        

class TurfDetails(Resource):
    def __init__(self):
        self.mongo_db = app.config['MONGO_DB']
        self.bucket_name = app.config['S3_TURF_ASSETS_BUCKET']
        self.s3_base_url = "https://invalid_url_for_testing_purposes.com"

    def get(self, turf_id):
        """Get details of a specific turf by ID"""
        try:
            date = request.args.get('date')
            if not date:
                return make_response({"status": False, "message": "Date is required"}, 400)
            start_time, end_time = self.get_date_range(date)
            turf = self.mongo_db['turfs'].find_one({'id': turf_id}, {'_id': 0})
            if not turf:
                return make_response({"status": False, "message": "Turf not found"}, 404)
            ###get bookings for the turf on the specified date
            bookings = self.get_bookings_for_turf(turf_id, start_time, end_time)
            available_slots = self.get_available_slots(start_time, end_time, bookings)
            return make_response({"status": True, "turf": turf, "available_slots": available_slots}, 200)
        except Exception as e:
            logging.exception("Error in TurfDetails.get", exc_info=True)
            return make_response({"status": False, "error": "Error fetching turf details"}, 500)
        
    def get_date_range(self, date_str):
        try:
            start_time = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            
            end_time = start_time + timedelta(days=1)
            print(f"Start time: {start_time}, End time: {end_time}")
            return start_time, end_time

        except ValueError as ve:
            raise ValueError(f"Invalid date format: {ve}")
        
        except Exception as e:
            logging.exception("Error in get_date_range", exc_info=True)
            raise ValueError(f"Error parsing date: {e}")
        
    def get_bookings_for_turf(self, turf_id, start_time, end_time):
        try:
            bookings = list(self.mongo_db['bookings'].find({'turf_id': turf_id,'start_time': {'$lt': end_time}, 'end_time': {'$gte': start_time}, 'status': 'confirmed'}, {'_id': 0}))
            print(f"Bookings for turf_id {turf_id} between {start_time} and {end_time}: {bookings}")
            return bookings
        except Exception as e:
            logging.exception("Error in get_bookings_for_turf", exc_info=True)
            raise ValueError(f"Error fetching bookings: {e}")
        
    def get_available_slots(self, start_time, end_time, bookings):
        try:
            slots = []
            current_time = start_time
            while current_time < end_time:
                slot_end = current_time + timedelta(minutes=30)
                slots.append({'start_time': current_time, 'end_time': slot_end, 'available': True})
                current_time = slot_end
            for booking in bookings:
                # make mongo datetimes timezone aware
                booking['start_time'] = booking['start_time'].replace(tzinfo=timezone.utc)
                booking['end_time'] = booking['end_time'].replace(tzinfo=timezone.utc)
                for slot in slots:
                    if not (booking['end_time'] <= slot['start_time'] or booking['start_time'] >= slot['end_time']):
                        slot['available'] = False
            for slot in slots:
                slot['end_time'] = slot['end_time'].strftime("%H:%M")
                slot['start_time'] = slot['start_time'].strftime("%H:%M")
            print(f"Available slots for the time range {start_time} to {end_time}: {slots}")
            return slots
        except Exception as e:
            logging.exception("Error in get_available_slots", exc_info=True)
            raise ValueError(f"Error fetching slots: {e}")