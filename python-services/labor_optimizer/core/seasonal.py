"""
Seasonal factors — look up multipliers from the seasonal_calendar table.
"""

from datetime import date, datetime
from typing import Dict, Optional
from ..db import get_db


def get_seasonal_factor(
    venue_id: str,
    target_date: date,
) -> Dict:
    """
    Look up seasonal multiplier for a venue on a given date.

    Checks both venue-specific and global (venue_id IS NULL) events.

    Returns:
        {
            'multiplier': float (1.0 = normal),
            'event_name': str or None,
            'notes': str or None,
            'hourly_multipliers': dict or None,
        }
    """
    db = get_db()

    if isinstance(target_date, datetime):
        target_date = target_date.date()

    date_str = target_date.isoformat()

    # Query venue-specific events first
    events = db.select(
        "seasonal_calendar",
        "event_name,covers_multiplier,hourly_multipliers,notes",
        event_date=f"eq.{date_str}",
        venue_id=f"eq.{venue_id}",
    )

    # Fall back to global events
    if not events:
        events = db.select(
            "seasonal_calendar",
            "event_name,covers_multiplier,hourly_multipliers,notes",
            event_date=f"eq.{date_str}",
            venue_id="is.null",
        )

    if events:
        ev = events[0]
        return {
            "multiplier": float(ev.get("covers_multiplier", 1.0)),
            "event_name": ev.get("event_name"),
            "notes": ev.get("notes"),
            "hourly_multipliers": ev.get("hourly_multipliers"),
        }

    return {
        "multiplier": 1.0,
        "event_name": None,
        "notes": None,
        "hourly_multipliers": None,
    }
