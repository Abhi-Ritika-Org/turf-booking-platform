import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from config import S3_BASE_URL, S3_TURF_ASSETS_BUCKET

from fastapi import Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config import get_db


# TODO: replace with the real bucket URL from config.S3_BASE_URL (roadmap item 1).
S3_BASE_URL = "https://invalid_url_for_testing_purposes.com"

MAX_PAGE_SIZE = 100


class TurfListRequest(BaseModel):
    # Bounded: Mongo reads limit=0 as "no limit" (the whole collection) and
    # rejects a negative skip, so both would escape pagination.
    offset: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=MAX_PAGE_SIZE)


def turf_list(payload: Optional[TurfListRequest] = None, mongo_db=Depends(get_db)):
    """List all turfs"""
    try:
        payload = payload or TurfListRequest()
        skip = payload.offset * payload.limit

        turfs = list(mongo_db['turfs'].find({}, {'_id': 0}).skip(skip).limit(payload.limit))
        total_turfs = mongo_db['turfs'].count_documents({})
        if not turfs:
            return JSONResponse({"status": False, "message": "No turfs found"}, status_code=404)

        for turf in turfs:
            thumbnail_key = turf.get('thumbnail')
            if thumbnail_key:
                turf['thumbnail_url'] = f"{S3_BASE_URL}/{thumbnail_key}/paused"

        return JSONResponse(
            jsonable_encoder({"status": True, "data": turfs, "total": total_turfs}), status_code=200
        )
    except Exception:
        logging.exception("Error in turf_list")
        return JSONResponse({"status": False, "error": "Error fetching turfs"}, status_code=500)


def get_date_range(date_str):
    try:
        start_time = datetime.strptime(date_str, "%d-%m-%Y").replace(tzinfo=timezone.utc)
        end_time = start_time + timedelta(days=1)
        return start_time, end_time
    except ValueError as ve:
        raise ValueError(f"Invalid date format: {ve}")


def get_bookings_for_turf(mongo_db, turf_id, start_time, end_time):
    return list(mongo_db['bookings'].find(
        {
            'turf_id': turf_id,
            'start_time': {'$lt': end_time},
            'end_time': {'$gt': start_time},
            'status': 'confirmed',
        },
        {'_id': 0},
    ))


def get_available_slots(start_time, end_time, bookings):
    slots = []
    current_time = start_time
    while current_time < end_time:
        slot_end = current_time + timedelta(minutes=30)
        slots.append({'start_time': current_time, 'end_time': slot_end, 'available': True})
        current_time = slot_end
    for booking in bookings:
        # make mongo datetimes timezone aware
        booking_start = booking['start_time'].replace(tzinfo=timezone.utc)
        booking_end = booking['end_time'].replace(tzinfo=timezone.utc)
        for slot in slots:
            # Half-open intervals: a booking that ends when a slot starts does not block it.
            if not (booking_end <= slot['start_time'] or booking_start >= slot['end_time']):
                slot['available'] = False
    for slot in slots:
        slot['end_time'] = slot['end_time'].strftime("%H:%M")
        slot['start_time'] = slot['start_time'].strftime("%H:%M")
    return slots


def turf_details(turf_id: str, date: Optional[str] = None, mongo_db=Depends(get_db)):
    """Get details of a specific turf by ID, with that date's 30-minute slot availability"""
    try:
        if not date:
            return JSONResponse({"status": False, "message": "Date is required"}, status_code=400)
        try:
            start_time, end_time = get_date_range(date)
        except ValueError:
            return JSONResponse({"status": False, "message": "Invalid date format, expected DD-MM-YYYY"}, status_code=400)

        turf = mongo_db['turfs'].find_one({'id': turf_id}, {'_id': 0})
        if not turf:
            return JSONResponse({"status": False, "message": "Turf not found"}, status_code=404)

        ### get bookings for the turf on the specified date
        bookings = get_bookings_for_turf(mongo_db, turf_id, start_time, end_time)
        available_slots = get_available_slots(start_time, end_time, bookings)
        return JSONResponse(
            jsonable_encoder({"status": True, "turf": turf, "available_slots": available_slots}), status_code=200
        )
    except Exception:
        logging.exception("Error in turf_details")
        return JSONResponse({"status": False, "error": "Error fetching turf details"}, status_code=500)
