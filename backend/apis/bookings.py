from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
from ..config import db
import logging
import traceback

class BookingIn(BaseModel):
    name: str
    phone: str
    date: str
    time_slot: str

class BookingsAPI:
    def __init__(self, db_client):
        self.db = db_client

    async def list_bookings(self, from_date: str | None = None):
        try:
            today = from_date or datetime.utcnow().date().isoformat()
            cursor = self.db.bookings.find({"date": {"$gte": today}}).sort([("date", 1), ("time_slot", 1)])
            results = []
            async for doc in cursor:
                doc['id'] = str(doc['_id'])
                doc.pop('_id', None)
                results.append(doc)
            return results
        except Exception:
            tb = traceback.format_exc()
            logging.exception("Error in list_bookings")
            raise HTTPException(status_code=500, detail={"error": "list_bookings failed", "trace": tb})

    async def create_booking(self, b: BookingIn):
        try:
            existing = await self.db.bookings.find_one({"date": b.date, "time_slot": b.time_slot})
            if existing:
                raise HTTPException(status_code=409, detail="Slot already booked")
            doc = b.dict()
            doc['created_at'] = datetime.utcnow()
            res = await self.db.bookings.insert_one(doc)
            doc['id'] = str(res.inserted_id)
            return doc
        except HTTPException:
            raise
        except Exception:
            tb = traceback.format_exc()
            logging.exception("Error in create_booking")
            raise HTTPException(status_code=500, detail={"error": "create_booking failed", "trace": tb})


bookings_router = APIRouter()
_bookings = BookingsAPI(db)

bookings_router.get('/bookings')(_bookings.list_bookings)
bookings_router.post('/bookings')(_bookings.create_booking)
