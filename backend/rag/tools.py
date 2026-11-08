"""Tools the chatbot agent can call.

Each tool is a JSON schema (what the LLM sees) plus a Python function (what
runs). The functions reuse the same helpers as the API endpoints.

User data rule: no tool takes a user id, email or phone. The user always comes
from ToolContext.user_id, which /api/chat fills from the current_user_id
dependency, so the LLM cannot read anyone else's data however it is asked.
All tools are read-only.
"""
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime

from apis.bookings import (
    calculate_amount,
    get_user_booking,
    is_valid_price,
    list_user_bookings,
    parse_booking_window,
)
from apis.turfs import get_turf_availability
from helpers.chroma_client import get_kb_collection
from helpers.venue_time import venue_now
from rag.chat import retrieve

MAX_BOOKINGS = 10
MAX_TURFS = 20

OTHER_USER_MESSAGE = (
    "Sorry, I can only show your own bookings and account details. "
    "Sharing another user's data is against TurfBook's privacy policy."
)

# Arguments that would mean "look up someone else". They are in no schema; if
# the LLM sends one anyway, the call is refused with the policy message rather
# than the generic invalid-arguments error.
IDENTITY_ARGS = {"user_id", "userid", "user", "email", "mobile", "phone", "username", "full_name", "name_of_user"}


@dataclass
class ToolContext:
    user_id: str  # from the access token, never from the LLM
    db: object


def search_knowledge_base(ctx, query):
    try:
        chunks = retrieve(get_kb_collection(), query)
    except Exception:
        logging.exception("Knowledge base search failed")
        return {"error": "Help articles are unavailable right now."}
    if not chunks:
        return {"results": [], "note": "No relevant help articles found."}
    return {"results": [{"id": c["id"], "text": c["text"]} for c in chunks]}


def list_turfs(ctx, name=None, sport=None):
    query = {}
    if name and name.strip():
        query["name"] = {"$regex": re.escape(name.strip()), "$options": "i"}
    if sport and sport.strip():
        query["sports"] = {"$regex": f"^{re.escape(sport.strip())}$", "$options": "i"}
    turfs = ctx.db["turfs"].find(
        query,
        {"_id": 0, "id": 1, "name": 1, "location": 1, "price_per_hour": 1, "sports": 1,
         "amenities": 1, "avg_rating": 1, "owner_contact": 1},
    ).limit(MAX_TURFS)
    results = []
    for turf in turfs:
        turf["turf_id"] = turf.pop("id", None)
        turf["name"] = (turf.get("name") or "").strip()
        results.append(turf)
    return {"turfs": results} if results else {"turfs": [], "note": "No turfs match."}


def merge_free_slots(slots):
    """[{start_time, end_time, available}, ...] -> ["06:00-09:30", ...]. The end
    of the day is written as 24:00: slot data ends the last slot at "00:00", so a
    fully free day would otherwise read "00:00-00:00", which models take as no time."""
    ranges = []
    for slot in slots:
        if not slot["available"]:
            continue
        if ranges and ranges[-1][1] == slot["start_time"]:
            ranges[-1][1] = slot["end_time"]
        else:
            ranges.append([slot["start_time"], slot["end_time"]])
    return [f"{start}-{'24:00' if end == '00:00' else end}" for start, end in ranges]


def get_availability(ctx, turf_id, date):
    try:
        turf, slots = get_turf_availability(ctx.db, turf_id, date)
    except ValueError as e:
        return {"error": str(e)}
    if not turf:
        return {"error": "Turf not found. Use list_turfs to find the turf_id."}
    now = venue_now()
    if datetime.strptime(date, "%d-%m-%Y").date() == now.date():
        slots = [s for s in slots if s["start_time"] >= now.strftime("%H:%M")]  # drop past slots
    return {
        "turf_name": (turf.get("name") or "").strip(),
        "date": date,
        "free_time_ranges": merge_free_slots(slots),
        "note": "Slots are 30 minutes. 24:00 means midnight at the end of this date; "
                "00:00-24:00 means the whole day is free. "
                "A free slot can still be taken by someone paying right now; booking re-checks it.",
    }


def quote_price(ctx, turf_id, date, start_time, end_time):
    try:
        start, end = parse_booking_window(date, start_time, end_time)
    except ValueError as e:
        return {"error": f"{e} Use date DD-MM-YYYY and times HH:MM."}
    turf = ctx.db["turfs"].find_one({"id": turf_id}, {"_id": 0, "name": 1, "price_per_hour": 1})
    if not turf:
        return {"error": "Turf not found. Use list_turfs to find the turf_id."}
    if not is_valid_price(turf.get("price_per_hour")):
        return {"error": "Pricing is not available for this turf."}
    turf_charges, platform_fee = calculate_amount(start, end, turf["price_per_hour"])
    return {
        "turf_name": (turf.get("name") or "").strip(),
        "price_per_hour": turf["price_per_hour"],
        "hours": (end - start).total_seconds() / 3600,
        "turf_charges": turf_charges,
        "platform_fee": platform_fee,
        "total": turf_charges + platform_fee,
        "currency": "INR",
    }


def _for_llm(booking):
    booking.pop("razorpay_order_id", None)  # payment internals are not needed in answers
    return booking


def _add_turf_names(db, bookings):
    ids = list({b["turf_id"] for b in bookings if b.get("turf_id")})
    names = {t["id"]: (t.get("name") or "").strip()
             for t in db["turfs"].find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1})}
    for b in bookings:
        b["turf_name"] = names.get(b.get("turf_id"), "")
    return bookings


def get_booking(ctx, booking_id):
    booking = get_user_booking(ctx.db, ctx.user_id, booking_id)
    if not booking:
        # Same answer whether it doesn't exist or belongs to someone else.
        return {"error": "No booking with that id in your account."}
    return _add_turf_names(ctx.db, [_for_llm(booking)])[0]


def list_my_bookings(ctx, limit=3, status=None, upcoming=False):
    limit = max(1, min(limit or 3, MAX_BOOKINGS))  # models sometimes send null for optional args
    starting_from = venue_now() if upcoming else None
    bookings = [_for_llm(b) for b in list_user_bookings(ctx.db, ctx.user_id, limit, status, starting_from)]
    if not bookings:
        kind = "upcoming bookings" if upcoming else "bookings"
        return {"bookings": [], "note": f"You have no {kind}" + (f" with status {status}." if status else ".")}
    return {"bookings": _add_turf_names(ctx.db, bookings)}


def _schema(name, description, properties=None, required=None):
    return {"type": "function", "function": {
        "name": name,
        "description": description,
        "parameters": {"type": "object", "properties": properties or {}, "required": required or []},
    }}


DATE = {"type": "string", "description": "DD-MM-YYYY, e.g. 01-11-2026. Work out 'today'/'tomorrow' from today's date."}
TIME = {"type": "string", "description": "HH:MM, 24-hour, on a 30-minute boundary, e.g. 18:00. Use 00:00 for midnight at the end of the day."}
TURF_ID = {"type": "string", "description": "The turf_id from list_turfs, e.g. turf_abc123."}

TOOL_SCHEMAS = [
    _schema(
        "search_knowledge_base",
        "Search TurfBook's help articles: how booking works, slot rules, payments, platform fee, "
        "cancellations, refunds, support contact, FAQ. Use for any policy or how-to question.",
        {"query": {"type": "string", "description": "What to look up, in a few words."}},
        ["query"],
    ),
    _schema(
        "list_turfs",
        "List turfs with turf_id, name, location, price per hour, sports, amenities, rating and owner contact. "
        "Use to find a turf_id from a turf name, or to answer which turfs offer a sport.",
        {"name": {"type": "string", "description": "Optional part of the turf name."},
         "sport": {"type": "string", "description": "Optional sport, e.g. Cricket."}},
    ),
    _schema(
        "get_availability",
        "Free time ranges of one turf on one date, from live booking data. "
        "Use for any question about free slots, open times or whether a time is available.",
        {"turf_id": TURF_ID, "date": DATE},
        ["turf_id", "date"],
    ),
    _schema(
        "quote_price",
        "Exact price for booking a turf for a time range: turf charges, platform fee and total in rupees. "
        "Does not check availability and does not book.",
        {"turf_id": TURF_ID, "date": DATE, "start_time": TIME, "end_time": TIME},
        ["turf_id", "date", "start_time", "end_time"],
    ),
    _schema(
        "get_booking",
        "Status, date, time, amount and turf of one of the current user's own bookings, by booking id.",
        {"booking_id": {"type": "string"}},
        ["booking_id"],
    ),
    _schema(
        "list_my_bookings",
        "The current user's own bookings. By default the latest-dated first ('my bookings', 'my last N bookings'); "
        "with upcoming=true, the next ones from now on, soonest first ('my upcoming/next booking'). "
        "Only ever returns the logged-in user's bookings.",
        {"limit": {"type": "integer", "description": f"How many, 1-{MAX_BOOKINGS}. Default 3."},
         "status": {"type": "string", "enum": ["confirmed", "payment_pending"],
                    "description": "Optional filter."},
         "upcoming": {"type": "boolean", "description": "Only bookings from now on, soonest first."}},
    ),
]

SCHEMAS_BY_NAME = {schema["function"]["name"]: schema["function"]["parameters"] for schema in TOOL_SCHEMAS}

TOOLS = {
    "search_knowledge_base": search_knowledge_base,
    "list_turfs": list_turfs,
    "get_availability": get_availability,
    "quote_price": quote_price,
    "get_booking": get_booking,
    "list_my_bookings": list_my_bookings,
}


JSON_TYPES = {"string": str, "integer": int, "boolean": bool}


def validate_args(parameters, args):
    """Check args against the tool's schema: only known keys, required ones
    present, right types and enum values. Strings only (never dicts) also keeps
    Mongo operators like {"$ne": ...} out of queries. Returns a problem or None."""
    properties = parameters["properties"]
    for key in args:
        if key not in properties:
            return f"unexpected argument '{key}'"
    for key in parameters["required"]:
        if args.get(key) is None:
            return f"'{key}' is required"
    for key, value in args.items():
        if value is None:
            continue
        spec = properties[key]
        expected = JSON_TYPES[spec["type"]]
        # bool is a subclass of int in Python, so reject it explicitly for integers.
        if not isinstance(value, expected) or (expected is int and isinstance(value, bool)):
            return f"'{key}' must be a {spec['type']}"
        if "enum" in spec and value not in spec["enum"]:
            return f"'{key}' must be one of {spec['enum']}"
    return None


def run_tool(ctx, name, arguments_json):
    """Run the tool the LLM asked for. Always returns a dict; problems become
    {"error": ...} so the LLM can explain them or retry."""
    function = TOOLS.get(name)
    if function is None:
        return {"error": f"Unknown tool {name}."}
    try:
        args = json.loads(arguments_json or "{}")
    except json.JSONDecodeError:
        return {"error": "Arguments must be valid JSON."}
    if not isinstance(args, dict):
        return {"error": "Arguments must be a JSON object."}
    if IDENTITY_ARGS & {key.lower() for key in args}:
        return {"error": OTHER_USER_MESSAGE}
    problem = validate_args(SCHEMAS_BY_NAME[name], args)
    if problem:
        return {"error": f"Invalid arguments for {name}: {problem}."}
    try:
        return function(ctx, **args)
    except Exception:
        logging.exception("Tool %s failed", name)
        return {"error": "Something went wrong while fetching that. Please try again."}
