"""
Staffing calculations — convert active covers into server/bartender counts.
"""

import math
from typing import Dict, List, Optional, Tuple


def compute_servers_needed(
    active_covers: float,
    covers_per_server: float = 16.0,
    buffer_pct: float = 0.10,
    min_servers: int = 2,
) -> int:
    """
    Compute servers needed for a given active cover count.

    Formula: ceil(active_covers * (1 + buffer_pct) / covers_per_server)

    Args:
        active_covers: Number of guests currently seated
        covers_per_server: Target covers per server
        buffer_pct: Buffer percentage (e.g., 0.10 for 10%)
        min_servers: Absolute minimum regardless of covers

    Returns:
        Number of servers needed
    """
    if active_covers <= 0:
        return min_servers
    buffered = active_covers * (1 + buffer_pct)
    needed = math.ceil(buffered / covers_per_server)
    return max(needed, min_servers)


def compute_bartenders_needed(
    active_covers: float,
    covers_per_bartender: float = 30.0,
    buffer_pct: float = 0.10,
    min_bartenders: int = 1,
) -> int:
    """Compute bartenders needed, same formula as servers with different ratio."""
    if active_covers <= 0:
        return min_bartenders
    buffered = active_covers * (1 + buffer_pct)
    needed = math.ceil(buffered / covers_per_bartender)
    return max(needed, min_bartenders)


def compute_scenario_staffing(
    p50: float,
    p75: float,
    p90: float,
    covers_per_server: float = 16.0,
    covers_per_bartender: float = 30.0,
    buffer_pct: float = 0.10,
    min_servers: int = 2,
    min_bartenders: int = 1,
) -> Dict[str, Dict[str, int]]:
    """
    Compute staffing for all three scenarios from profile percentiles.

    Returns:
        {
            'lean': {'servers': N, 'bartenders': N},
            'buffered': {'servers': N, 'bartenders': N},
            'safe': {'servers': N, 'bartenders': N},
        }
    """
    return {
        "lean": {
            "servers": compute_servers_needed(p50, covers_per_server, 0.0, min_servers),
            "bartenders": compute_bartenders_needed(p50, covers_per_bartender, 0.0, min_bartenders),
        },
        "buffered": {
            "servers": compute_servers_needed(p75, covers_per_server, buffer_pct, min_servers),
            "bartenders": compute_bartenders_needed(p75, covers_per_bartender, buffer_pct, min_bartenders),
        },
        "safe": {
            "servers": compute_servers_needed(p90, covers_per_server, 0.0, min_servers),
            "bartenders": compute_bartenders_needed(p90, covers_per_bartender, 0.0, min_bartenders),
        },
    }


def compute_stagger_schedule(
    hourly_staffing: List[Dict],
    shift_length_hours: int = 6,
) -> List[Dict]:
    """
    Convert hour-by-hour staffing levels into individual shift start/end times
    using FIFO matching (first arrivals get cut first).

    Reuses the wave-based approach from auto_scheduler.py.

    Args:
        hourly_staffing: [{hour, servers, bartenders}]
        shift_length_hours: Maximum shift length

    Returns:
        List of shifts: [{role, start_hour, end_hour, hours}]
    """
    shifts = []

    for role in ["servers", "bartenders"]:
        # Track currently-working staff by their start hour
        active: List[int] = []  # start hours of active staff

        for entry in hourly_staffing:
            hour = entry["hour"]
            needed = entry.get(role, 0)

            # Remove staff who've hit max shift length (FIFO — earliest first)
            active = [s for s in active if hour - s < shift_length_hours]

            current = len(active)

            if needed > current:
                # Add staff
                for _ in range(needed - current):
                    active.append(hour)
            elif needed < current:
                # Cut staff (FIFO — earliest arrivals leave first)
                to_cut = current - needed
                active = active[to_cut:]

        # Convert active tracking into shift records
        shift_map: Dict[int, int] = {}  # start_hour -> count
        for start in active:
            shift_map[start] = shift_map.get(start, 0) + 1

        # Actually build shifts from the full hourly progression
        # Re-run to track actual end times
        active_detailed: List[Tuple[int, int]] = []  # (start_hour, end_hour)

        for entry in hourly_staffing:
            hour = entry["hour"]
            needed = entry.get(role, 0)

            # Expire shifts at max length
            active_detailed = [(s, e) for s, e in active_detailed if hour - s < shift_length_hours]

            current = len(active_detailed)

            if needed > current:
                for _ in range(needed - current):
                    active_detailed.append((hour, hour))
            elif needed < current:
                to_cut = current - needed
                # Cut earliest (FIFO), record their end time
                for s, _ in active_detailed[:to_cut]:
                    shifts.append({
                        "role": role.rstrip("s"),  # "server" or "bartender"
                        "start_hour": s,
                        "end_hour": hour,
                        "hours": hour - s,
                    })
                active_detailed = active_detailed[to_cut:]

        # Close remaining active shifts at the last hour + 1
        if hourly_staffing:
            last_hour = hourly_staffing[-1]["hour"] + 1
            for s, _ in active_detailed:
                shifts.append({
                    "role": role.rstrip("s"),
                    "start_hour": s,
                    "end_hour": last_hour,
                    "hours": last_hour - s,
                })

    return shifts


def compute_daily_total_cost(
    hourly_staffing: List[Dict],
    avg_hourly_rate: float = 18.0,
) -> float:
    """Estimate total labor cost for a day from hour-by-hour staffing."""
    total_hours = 0.0
    for entry in hourly_staffing:
        total_hours += entry.get("servers", 0) + entry.get("bartenders", 0)
    return total_hours * avg_hourly_rate
