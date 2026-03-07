import json
import logging
import traceback
from flask import jsonify, make_response, request
from flask_restful import Resource
from datetime import datetime


class CreateBooking(Resource):
    def __init__(self, db):
        self.db = db

    def post(self):
        """Create a new booking - accepts any payload for testing"""
        try:
            payload = request.get_json() or {}
            logging.info(f"CreateBooking.post called with payload: {payload}")
            
            # For testing: accept empty payload and return success
            result = {
                'status': 200,
                'message': 'Booking received',
                'payload': payload,
                'received_at': datetime.utcnow().isoformat()
            }
            
            return make_response(jsonify(result), 200)
        except Exception as e:
            logging.exception('Error in CreateBooking.post')
            return make_response({'status': 500, 'error': str(e)}, 500)


class ListBookings(Resource):
    def __init__(self, db):
        self.db = db

    def get(self):
        """List all bookings or bookings from a specific date"""
        try:
            from_date = request.args.get('from_date')
            logging.info(f"ListBookings.get called with from_date: {from_date}")
            
            # For testing: return mock data
            bookings = [
                {
                    'id': '1',
                    'name': 'Test User',
                    'phone': '1234567890',
                    'date': '2026-02-05',
                    'time_slot': '10:00-11:00',
                    'created_at': datetime.utcnow().isoformat()
                }
            ]
            
            result = {
                'status': 200,
                'bookings': bookings
            }
            
            return make_response(jsonify(result), 200)
        except Exception as e:
            logging.exception('Error in ListBookings.get')
            return make_response({'status': 500, 'error': str(e)}, 500)