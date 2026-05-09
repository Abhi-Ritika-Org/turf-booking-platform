from datetime import datetime
import logging

def get_parsed_dates(start_date=None, end_date=None):
    if start_date and end_date:
        try:
            start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
            if start_date > end_date:
                raise ValueError("Start date cannot be after end date.")
            return start_date, end_date
        except ValueError as ve:
            raise ValueError(f"Invalid date format: {ve}")
    if start_date and not end_date:
        try:
            start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
            return start_date, None
        except ValueError as ve:
            raise ValueError(f"Invalid start date format: {ve}")
    if end_date and not start_date:
        try:
            end_date = datetime.strptime(end_date, "%Y-%m-%d").date()
            return None, end_date
        except ValueError as ve:
            raise ValueError(f"Invalid end date format: {ve}")

