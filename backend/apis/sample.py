from fastapi import APIRouter, HTTPException
from datetime import datetime
from ..config import db
import logging
import traceback

class SampleAPI:
    def __init__(self, db_client):
        self.db = db_client

    async def write_sample_example(self):
        try:
            doc = {
                "name": "Sample Document",
                "purpose": "write-sample-example test",
                "created_at": datetime.utcnow(),
            }
            res = await self.db.example.insert_one(doc)
            inserted_id = str(res.inserted_id) if getattr(res, 'inserted_id', None) else None
            return {
                "id": inserted_id,
                "name": doc["name"],
                "purpose": doc["purpose"],
                "created_at": doc["created_at"],
            }
        except Exception:
            tb = traceback.format_exc()
            logging.exception("Error in write_sample_example")
            raise HTTPException(status_code=500, detail={"error": "write_sample_example failed", "trace": tb})

sample_router = APIRouter()
_sample = SampleAPI(db)

# Accept both POST and GET for easy testing in browser
sample_router.post('/sample/write-sample-example')(_sample.write_sample_example)
sample_router.get('/sample/write-sample-example')(_sample.write_sample_example)
