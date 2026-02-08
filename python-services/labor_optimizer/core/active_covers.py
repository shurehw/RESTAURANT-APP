"""
Active Covers Engine — core algorithms for computing concurrent guest counts.
This is the heart of the system: staff for guests CURRENTLY SEATED.
"""

import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import pandas as pd
import numpy as np


def compute_active_covers(checks_df: pd.DataFrame, check_time: datetime) -> int:
    """
    Count guests CURRENTLY SEATED at check_time.

    A guest is "active" if:
      open_time <= check_time < close_time

    Args:
        checks_df: DataFrame with columns [open_time, close_time, guest_count]
        check_time: The moment to evaluate

    Returns:
        Total active guest count
    """
    if checks_df.empty:
        return 0
    active = checks_df[
        (checks_df["open_time"] <= check_time)
        & (checks_df["close_time"] > check_time)
    ]
    return int(active["guest_count"].sum())


def compute_active_tables(checks_df: pd.DataFrame, check_time: datetime) -> int:
    """Count tables CURRENTLY OCCUPIED at check_time."""
    if checks_df.empty:
        return 0
    active = checks_df[
        (checks_df["open_time"] <= check_time)
        & (checks_df["close_time"] > check_time)
    ]
    return len(active)


def compute_new_covers(checks_df: pd.DataFrame, hour_start: datetime, hour_end: datetime) -> int:
    """Count guests who ARRIVED during [hour_start, hour_end)."""
    if checks_df.empty:
        return 0
    arriving = checks_df[
        (checks_df["open_time"] >= hour_start)
        & (checks_df["open_time"] < hour_end)
    ]
    return int(arriving["guest_count"].sum())


def compute_departing_covers(checks_df: pd.DataFrame, hour_start: datetime, hour_end: datetime) -> int:
    """Count guests who DEPARTED during [hour_start, hour_end)."""
    if checks_df.empty:
        return 0
    departing = checks_df[
        (checks_df["close_time"] >= hour_start)
        & (checks_df["close_time"] < hour_end)
    ]
    return int(departing["guest_count"].sum())


def compute_hourly_active_covers(
    checks_df: pd.DataFrame,
    business_date: str,
    open_hour: int = 15,
    close_hour: int = 23,
) -> List[Dict]:
    """
    Compute active covers for each hour of a business day.

    Evaluates at each hour boundary (e.g. 15:00, 16:00, ..., 23:00)
    counting guests whose check spans that moment.

    Args:
        checks_df: DataFrame with [open_time, close_time, guest_count]
        business_date: YYYY-MM-DD string
        open_hour: First hour to evaluate (default 15 = 3PM)
        close_hour: Last hour to evaluate (default 23 = 11PM)

    Returns:
        List of dicts: [{hour, active_covers, active_tables, new_covers, departing_covers}]
    """
    from datetime import date as _date

    if isinstance(business_date, str):
        bd = datetime.strptime(business_date, "%Y-%m-%d").date()
    else:
        bd = business_date

    results = []
    for hour in range(open_hour, close_hour + 1):
        # Evaluate at the middle of the hour for active counts
        check_time = datetime.combine(bd, datetime.min.time().replace(hour=hour, minute=30))
        hour_start = datetime.combine(bd, datetime.min.time().replace(hour=hour))
        hour_end = hour_start + timedelta(hours=1)

        results.append({
            "hour": hour,
            "active_covers": compute_active_covers(checks_df, check_time),
            "active_tables": compute_active_tables(checks_df, check_time),
            "new_covers": compute_new_covers(checks_df, hour_start, hour_end),
            "departing_covers": compute_departing_covers(checks_df, hour_start, hour_end),
        })

    return results


def classify_intensity(active_covers: int, p75: float, p90: float) -> str:
    """
    Classify hour intensity relative to historical profiles.

    Returns: 'low', 'normal', 'high', or 'extreme'
    """
    if active_covers <= p75 * 0.5:
        return "low"
    elif active_covers <= p75:
        return "normal"
    elif active_covers <= p90:
        return "high"
    else:
        return "extreme"


def estimate_close_time(
    open_time: datetime,
    dwell_minutes: int = 90,
    total_amount: float = None,
    guest_count: int = 1,
) -> datetime:
    """
    Estimate check close_time when missing from POS data.

    Uses average dwell time, adjusted by check value (higher spend = longer dwell).
    Fine dining average is 90 minutes; large parties and high-value checks skew longer.
    """
    base_minutes = dwell_minutes

    # Adjust for party size (larger parties dwell longer)
    if guest_count >= 6:
        base_minutes = int(base_minutes * 1.3)
    elif guest_count >= 4:
        base_minutes = int(base_minutes * 1.15)

    # Adjust for high-value checks (indicator of multi-course dining)
    if total_amount and guest_count > 0:
        per_guest = total_amount / guest_count
        if per_guest > 200:
            base_minutes = int(base_minutes * 1.25)
        elif per_guest > 100:
            base_minutes = int(base_minutes * 1.1)

    return open_time + timedelta(minutes=base_minutes)
