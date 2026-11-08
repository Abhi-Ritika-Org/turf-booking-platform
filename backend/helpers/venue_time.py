from datetime import datetime
from zoneinfo import ZoneInfo

# Only used to know "now" for today's date, past dates/slots and upcoming bookings;
# the venue timezone is still an open product decision.
VENUE_TIMEZONE = ZoneInfo("Asia/Kolkata")


def venue_now():
    """Current local time as a naive datetime (slot times are stored as naive local times)."""
    return datetime.now(VENUE_TIMEZONE).replace(tzinfo=None)
