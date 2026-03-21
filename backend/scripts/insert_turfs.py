import os
import traceback
from pymongo import MongoClient

try:
    mongo_uri = os.getenv("MONGO_URI", "mongodb://turf-mongo:27017/")
    mongo_client = MongoClient(mongo_uri)
    mongo_db = mongo_client[os.getenv("MONGO_DB", "turfbook")]

    # turf_id = "turf_MKKoQQj2fSSxm9AWSFzcFm"
    # name = "Greenfield Turf"
    # location = "Sector 21, Pune"
    turf_id = "turf_m4EFjsMVkN6yEwZZwZT6Kx"
    name = " Arambh Cricket Club"
    location = "Laxman nagar, Baner"
    thumbnail = "turf_images/turf_m4EFjsMVkN6yEwZZwZT6Kx/turf_102_thumbnail.jpg"

    turf_data = {
        "id" : turf_id,
        "name" : name,
        "location" : location,
        "price_per_hour" : 1000,
        "avg_rating" : 4.5,
        "total_reviews" : 10,
        "amenities" : ["Floodlights", "Changing Rooms", "Parking"],
        "sports" : ["Football", "Cricket", "Pickelball"],
        "owner_contact" : {
            "name" : "John Doe",
            "phone" : "+919876543210"
        },
        "thumbnail_" : thumbnail,
        "images" : [
            "https://example.com/greenfield_1.jpg",
            "https://example.com/greenfield_2.jpg",
            "https://example.com/greenfield_3.jpg"
        ]
    }

    result = mongo_db['turfs'].insert_one(turf_data)
    if result.inserted_id:
        print(f"Turf inserted with id: {result.inserted_id}")
    else:
        print("Failed to insert turf data")
except Exception as e:
    print(f"Error inserting turf data: {e}")
    print(traceback.format_exc())
