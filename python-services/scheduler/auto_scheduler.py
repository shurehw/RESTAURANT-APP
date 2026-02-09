"""
Auto-Scheduler - Smart Demand-Driven Optimization
Generates optimal weekly schedules using demand forecasts, CPLH targets,
service quality standards, historical patterns, and manager feedback learning.
Position-specific shift times, demand-tier adjustments, and opener/closer staggering.
"""

import os
import sys
import math
from datetime import datetime, timedelta, time
from typing import Dict, List, Optional, Tuple
import json
import uuid as _uuid

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from dotenv import load_dotenv

load_dotenv()  # .env
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env.local'), override=True)

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase environment variables")


class SupabaseREST:
    """Lightweight PostgREST client (avoids supabase-py WebSocket hang on Windows)"""

    def __init__(self, url: str, key: str):
        self.base = f"{url}/rest/v1"
        self.headers = {
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        }
        self.client = httpx.Client(timeout=30)

    def select(self, table: str, columns: str = '*', **filters) -> List[Dict]:
        params = {'select': columns}
        for k, v in filters.items():
            params[k] = v
        r = self.client.get(f"{self.base}/{table}", headers=self.headers, params=params)
        r.raise_for_status()
        return r.json()

    def insert(self, table: str, data) -> List[Dict]:
        r = self.client.post(f"{self.base}/{table}", headers=self.headers, json=data)
        r.raise_for_status()
        return r.json()

    def update(self, table: str, data: Dict, **filters) -> List[Dict]:
        params = {}
        for k, v in filters.items():
            params[k] = v
        r = self.client.patch(f"{self.base}/{table}", headers=self.headers, json=data, params=params)
        r.raise_for_status()
        return r.json()

    def delete(self, table: str, **filters) -> None:
        params = {}
        for k, v in filters.items():
            params[k] = v
        r = self.client.delete(f"{self.base}/{table}", headers=self.headers, params=params)
        r.raise_for_status()


db = SupabaseREST(SUPABASE_URL, SUPABASE_KEY)


# ═══════════════════════════════════════════════════════════════════
# POSITION-SPECIFIC SHIFT CONFIGURATIONS
# Each role has realistic start/end times per shift type
# ═══════════════════════════════════════════════════════════════════

POSITION_SHIFT_CONFIGS = {
    'dinner': {
        # Kitchen — arrive early for prep, leave after last ticket
        'Prep Cook':         {'start': '14:00', 'end': '21:00', 'hours': 7.0},
        'Line Cook':         {'start': '15:00', 'end': '23:00', 'hours': 8.0},
        'Sous Chef':         {'start': '14:00', 'end': '23:00', 'hours': 9.0},
        'Executive Chef':    {'start': '15:00', 'end': '23:00', 'hours': 8.0},
        'Dishwasher':        {'start': '15:00', 'end': '23:30', 'hours': 8.5},
        # Management — oversee full service window
        'General Manager':   {'start': '14:00', 'end': '00:00', 'hours': 10.0},
        'Assistant Manager': {'start': '15:00', 'end': '00:00', 'hours': 9.0},
        'Shift Manager':     {'start': '16:00', 'end': '00:00', 'hours': 8.0},
        'Manager':           {'start': '15:00', 'end': '00:00', 'hours': 9.0},
        # Bar — opens before dining, stays late
        'Bartender':         {'start': '16:00', 'end': '00:30', 'hours': 8.5},
        'Barback':           {'start': '16:00', 'end': '00:30', 'hours': 8.5},
        # FOH — service window
        'Host':              {'start': '16:30', 'end': '22:30', 'hours': 6.0},
        'Hostess':           {'start': '16:30', 'end': '22:30', 'hours': 6.0},
        'Server':            {'start': '16:30', 'end': '23:00', 'hours': 6.5},
        'Busser':            {'start': '16:30', 'end': '23:00', 'hours': 6.5},
        'Food Runner':       {'start': '17:00', 'end': '23:00', 'hours': 6.0},
        'Sommelier':         {'start': '17:00', 'end': '23:00', 'hours': 6.0},
        'Expeditor':         {'start': '17:00', 'end': '23:00', 'hours': 6.0},
    },
    'lunch': {
        'Prep Cook':         {'start': '08:00', 'end': '14:00', 'hours': 6.0},
        'Line Cook':         {'start': '09:00', 'end': '15:30', 'hours': 6.5},
        'Sous Chef':         {'start': '08:00', 'end': '15:30', 'hours': 7.5},
        'Executive Chef':    {'start': '09:00', 'end': '15:30', 'hours': 6.5},
        'Dishwasher':        {'start': '09:00', 'end': '16:00', 'hours': 7.0},
        'Manager':           {'start': '09:00', 'end': '16:00', 'hours': 7.0},
        'General Manager':   {'start': '09:00', 'end': '16:00', 'hours': 7.0},
        'Assistant Manager': {'start': '09:00', 'end': '16:00', 'hours': 7.0},
        'Bartender':         {'start': '10:30', 'end': '15:30', 'hours': 5.0},
        'Host':              {'start': '10:30', 'end': '15:00', 'hours': 4.5},
        'Hostess':           {'start': '10:30', 'end': '15:00', 'hours': 4.5},
        'Server':            {'start': '10:30', 'end': '15:30', 'hours': 5.0},
        'Busser':            {'start': '10:30', 'end': '15:30', 'hours': 5.0},
        'Food Runner':       {'start': '11:00', 'end': '15:30', 'hours': 4.5},
    },
    'breakfast': {
        'Prep Cook':         {'start': '05:00', 'end': '11:00', 'hours': 6.0},
        'Line Cook':         {'start': '06:00', 'end': '13:00', 'hours': 7.0},
        'Server':            {'start': '06:30', 'end': '13:30', 'hours': 7.0},
        'Host':              {'start': '06:30', 'end': '13:00', 'hours': 6.5},
        'Busser':            {'start': '06:30', 'end': '13:00', 'hours': 6.5},
        'Dishwasher':        {'start': '06:00', 'end': '14:00', 'hours': 8.0},
        'Manager':           {'start': '06:00', 'end': '14:00', 'hours': 8.0},
    },
    'late_night': {
        'Bartender':         {'start': '21:00', 'end': '02:00', 'hours': 5.0},
        'Barback':           {'start': '21:00', 'end': '02:00', 'hours': 5.0},
        'Server':            {'start': '21:00', 'end': '01:30', 'hours': 4.5},
        'Busser':            {'start': '21:00', 'end': '01:30', 'hours': 4.5},
        'Dishwasher':        {'start': '22:00', 'end': '02:30', 'hours': 4.5},
        'Manager':           {'start': '21:00', 'end': '02:30', 'hours': 5.5},
    },
}

# Generic fallback (only used if position not in POSITION_SHIFT_CONFIGS)
SHIFT_TIMES = {
    'breakfast': {'start': time(7, 0), 'end': time(14, 0), 'hours': 7},
    'lunch': {'start': time(11, 0), 'end': time(16, 0), 'hours': 5},
    'dinner': {'start': time(17, 0), 'end': time(23, 0), 'hours': 6},
    'late_night': {'start': time(22, 0), 'end': time(2, 0), 'hours': 4},
}


# ═══════════════════════════════════════════════════════════════════
# DEMAND TIERS — slow nights get shorter shifts, busy nights get staggered
# ═══════════════════════════════════════════════════════════════════

DEMAND_TIERS = [
    ('light',    0,   150),
    ('moderate', 150, 300),
    ('busy',     300, 450),
    ('peak',     450, 99999),
]

# On light nights (< 150 covers), FOH positions get cut early
LIGHT_NIGHT_CUTS = {
    'Server':      {'hours_delta': -1.5, 'end_delta_min': -90, 'note': 'Cut at 9:30 PM — slow night'},
    'Busser':      {'hours_delta': -1.5, 'end_delta_min': -90, 'note': 'Cut at 9:30 PM'},
    'Food Runner': {'hours_delta': -1.0, 'end_delta_min': -60, 'note': 'Cut at 10 PM'},
    'Prep Cook':   {'hours_delta': -1.0, 'end_delta_min': -60, 'note': 'Early release — light prep'},
    'Host':        {'hours_delta': -1.0, 'end_delta_min': -60, 'note': 'Cut at 9:30 PM — few walk-ins'},
    'Hostess':     {'hours_delta': -1.0, 'end_delta_min': -60, 'note': 'Cut at 9:30 PM'},
}

# On busy/peak nights (300+ covers), stagger FOH into opener + closer shifts
STAGGER_CONFIG = {
    'Server': {
        'threshold': 6,   # only stagger if 6+ servers needed
        'open':  {'start': '16:00', 'end': '22:00', 'hours': 6.0, 'pct': 0.40, 'note': 'Opener — cut at 10 PM'},
        'close': {'start': '18:00', 'end': '00:00', 'hours': 6.0, 'pct': 0.60, 'note': 'Closer — through last table'},
    },
    'Busser': {
        'threshold': 4,
        'open':  {'start': '16:00', 'end': '22:00', 'hours': 6.0, 'pct': 0.40, 'note': 'Opener — cut at 10 PM'},
        'close': {'start': '18:00', 'end': '23:30', 'hours': 5.5, 'pct': 0.60, 'note': 'Closer — breakdown'},
    },
    'Food Runner': {
        'threshold': 3,
        'open':  {'start': '16:30', 'end': '21:30', 'hours': 5.0, 'pct': 0.35, 'note': 'Opener — cut after rush'},
        'close': {'start': '18:00', 'end': '23:00', 'hours': 5.0, 'pct': 0.65, 'note': 'Closer'},
    },
}


# ═══════════════════════════════════════════════════════════════════
# INDUSTRY BENCHMARKS & DEFAULTS
# ═══════════════════════════════════════════════════════════════════

# ── CPLH Benchmarks (high-volume fine dining / nightclub) ─────────────
# These represent covers-per-labor-hour: covers / (employees * shift_hours).
# For a 700-cover Saturday with 6 servers working ~7h: actual CPLH = 700/(6*7) = 16.7
# These targets reflect real-world staffing for h.wood Group venues.
INDUSTRY_BENCHMARKS = {
    'Server': {
        'breakfast': {'target': 14.0}, 'lunch': {'target': 14.0},
        'dinner': {'target': 18.0}, 'late_night': {'target': 16.0},
    },
    'Busser': {
        'breakfast': {'target': 30.0}, 'lunch': {'target': 28.0},
        'dinner': {'target': 35.0}, 'late_night': {'target': 30.0},
    },
    'Food Runner': {
        'breakfast': {'target': 28.0}, 'lunch': {'target': 26.0},
        'dinner': {'target': 30.0}, 'late_night': {'target': 25.0},
    },
    'Line Cook': {
        'breakfast': {'target': 18.0}, 'lunch': {'target': 18.0},
        'dinner': {'target': 22.0}, 'late_night': {'target': 18.0},
    },
    'Prep Cook': {
        'breakfast': {'target': 35.0}, 'lunch': {'target': 35.0},
        'dinner': {'target': 50.0}, 'late_night': {'target': 40.0},
    },
}

DEFAULT_POSITION_CPLH = {
    'Host': 50.0, 'Hostess': 50.0, 'Dishwasher': 50.0,
    'Bartender': 30.0, 'Barback': 40.0, 'Sommelier': 50.0, 'Expeditor': 60.0,
    'Manager': 0, 'General Manager': 0, 'Assistant Manager': 0, 'Shift Manager': 0,
}

DEFAULT_SERVICE_QUALITY = {
    'max_covers_per_server': 20,
    'busser_to_server_ratio': 0.5,
    'runner_to_server_ratio': 0.33,
}

DEFAULT_OPTIMIZATION = {
    'cost_weight': 0.4,
    'quality_weight': 0.4,
    'efficiency_weight': 0.2,
    'target_labor_pct': 27.5,
}

FIXED_STAFF_POSITIONS = {'Manager', 'General Manager', 'Assistant Manager', 'Shift Manager', 'Expeditor', 'Executive Chef', 'Sous Chef'}
COVERS_RATIO_POSITIONS = {'Dishwasher': 200, 'Host': 250, 'Hostess': 250}


# ═══════════════════════════════════════════════════════════════════
# HOURLY WAVE SCHEDULING
# Converts hour-by-hour on-floor counts into staggered shift waves
# ═══════════════════════════════════════════════════════════════════

def _compute_shift_waves(hourly_counts: Dict[int, int],
                         setup_min: int = 30,
                         teardown_min: int = 45) -> List[Dict]:
    """Convert hourly staffing levels to staggered shift waves.

    Args:
        hourly_counts: {hour: on_floor_count} e.g. {15: 5, 16: 7, ...}
        setup_min:  minutes before the hour staff should arrive (setup)
        teardown_min: minutes after cut hour staff stays (side work)

    Returns list of waves:
        [{'count': N, 'start': 'HH:MM', 'end': 'HH:MM', 'hours': float}, ...]
    """
    hours = sorted(hourly_counts.keys())
    if not hours:
        return []

    # Build arrival/departure events from delta changes
    arrivals = []      # [(hour, count)]
    departures = []    # [(hour, count)]
    prev = 0
    for h in hours:
        cur = hourly_counts[h]
        if cur > prev:
            arrivals.append((h, cur - prev))
        elif cur < prev:
            departures.append((h, prev - cur))
        prev = cur
    # Anyone still on floor at the end departs 1 hour after last data point
    if prev > 0:
        departures.append((hours[-1] + 1, prev))

    # FIFO match: first arrivals get cut first (worked longest → go home first)
    waves = []
    queue = [[h, n] for h, n in arrivals]

    for dep_h, dep_n in departures:
        remaining = dep_n
        while remaining > 0 and queue:
            arr_h, avail = queue[0]
            take = min(remaining, avail)

            # Actual start = arrival hour minus setup time
            s_total = arr_h * 60 - setup_min
            # Actual end = departure hour plus teardown time
            e_total = dep_h * 60 + teardown_min

            s_h = (s_total // 60) % 24
            s_m = s_total % 60
            e_h = (e_total // 60) % 24
            e_m = e_total % 60
            shift_hours = round((e_total - s_total) / 60, 2)

            waves.append({
                'count': take,
                'start': f"{s_h:02d}:{s_m:02d}",
                'end': f"{e_h:02d}:{e_m:02d}",
                'hours': shift_hours,
            })

            remaining -= take
            queue[0][1] -= take
            if queue[0][1] <= 0:
                queue.pop(0)

    return waves


# ═══════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════

def _match_config_key(position_name: str, config: dict) -> Optional[str]:
    """Find best matching key in a config dict for a position name (case-insensitive)"""
    name_lower = position_name.lower()
    # Exact match
    for key in config:
        if key.lower() == name_lower:
            return key
    # Substring match (prefer longer matches)
    matches = [(key, len(key)) for key in config if key.lower() in name_lower]
    if matches:
        return max(matches, key=lambda x: x[1])[0]
    return None


def _get_demand_tier(covers: float) -> str:
    for tier_name, low, high in DEMAND_TIERS:
        if low <= covers < high:
            return tier_name
    return 'moderate'


def _parse_time(time_str: str) -> Tuple[int, int]:
    """Parse 'HH:MM' to (hour, minute)"""
    parts = time_str.split(':')
    return int(parts[0]), int(parts[1])


def _build_datetime(date_str: str, time_str: str) -> datetime:
    """Build datetime from date string and HH:MM time string, handling past-midnight"""
    date = datetime.fromisoformat(date_str)
    h, m = _parse_time(time_str)
    result = date.replace(hour=h, minute=m, second=0, microsecond=0)
    return result


def _build_shift_datetimes(date_str: str, start_str: str, end_str: str) -> Tuple[datetime, datetime]:
    """Build start/end datetimes, adding a day if end is before start (past midnight)"""
    start_dt = _build_datetime(date_str, start_str)
    end_dt = _build_datetime(date_str, end_str)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return start_dt, end_dt


class AutoScheduler:
    """Generates optimal weekly schedules using demand-driven smart assignment"""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.employees = []
        self.requirements = []
        self.positions = {}

        # Smart scheduling data
        self.demand_forecasts = {}
        self.cplh_targets = {}
        self.service_quality = {}
        self.optimization_settings = {}
        self.manager_adjustments = {}
        self.staffing_patterns = []
        self.optimization_mode = 'fallback'
        self.hourly_forecast = {}   # {date_str: {hourly_servers: {...}, hourly_bartenders: {...}, covers, revenue}}
        self.closed_weekdays = set()  # {0} = Monday closed

    # ── Data Loading ────────────────────────────────────────────────

    def load_data(self, week_start_date: str):
        week_start = datetime.fromisoformat(week_start_date).date()
        week_end = week_start + timedelta(days=6)

        print(f"[DATA] Loading data for week {week_start} to {week_end}...", flush=True)

        self.employees = db.select(
            'employees',
            '*, position:positions(id, name, base_hourly_rate, category)',
            venue_id=f'eq.{self.venue_id}',
            employment_status='eq.active',
        )
        print(f"[DATA] Loaded {len(self.employees)} active employees", flush=True)

        positions_data = db.select(
            'positions', '*',
            venue_id=f'eq.{self.venue_id}',
            is_active='eq.true',
        )
        self.positions = {p['id']: p for p in positions_data}

        self.requirements = db.select(
            'labor_requirements',
            '*, position:positions(*)',
            venue_id=f'eq.{self.venue_id}',
            business_date=f'gte.{week_start.isoformat()}',
        )
        self.requirements = [
            r for r in self.requirements
            if r['business_date'] <= week_end.isoformat()
        ]
        print(f"[DATA] Loaded {len(self.requirements)} labor requirements", flush=True)

    # ── Smart Data Fetching ─────────────────────────────────────────

    def _fetch_demand_forecasts(self, week_start: str, week_end: str):
        print(f"[SMART] Fetching demand forecasts...", flush=True)
        try:
            rows = db.select(
                'demand_forecasts',
                'id,business_date,shift_type,covers_predicted,revenue_predicted,confidence_level',
                venue_id=f'eq.{self.venue_id}',
                business_date=f'gte.{week_start}',
            )
            rows = [r for r in rows if r['business_date'] <= week_end]
            for r in rows:
                date = r['business_date']
                shift = r.get('shift_type', 'dinner')
                self.demand_forecasts.setdefault(date, {})[shift] = {
                    'covers': float(r.get('covers_predicted') or 0),
                    'revenue': float(r.get('revenue_predicted') or 0),
                    'confidence': float(r.get('confidence_level') or 0.5),
                    'forecast_id': r['id'],
                }
            print(f"[SMART] Found {len(rows)} forecast rows for {len(self.demand_forecasts)} days", flush=True)
        except Exception as e:
            print(f"[SMART] Could not fetch demand_forecasts: {e}", flush=True)

        if not self.demand_forecasts:
            self._fetch_demand_history_fallback(week_start)

    def _fetch_demand_history_fallback(self, week_start: str):
        print(f"[SMART] No forecasts found, computing from demand_history...", flush=True)
        try:
            cutoff = (datetime.fromisoformat(week_start).date() - timedelta(weeks=8)).isoformat()
            rows = db.select(
                'demand_history',
                'business_date,shift_type,actual_covers,actual_revenue',
                venue_id=f'eq.{self.venue_id}',
                business_date=f'gte.{cutoff}',
            )
            rows = [r for r in rows if r['business_date'] < week_start]
            if not rows:
                print(f"[SMART] No demand_history found either", flush=True)
                return

            from collections import defaultdict
            grouped = defaultdict(list)
            ref_date = datetime.fromisoformat(week_start).date()
            for r in rows:
                d = datetime.fromisoformat(r['business_date']).date()
                dow = d.weekday()
                shift = r.get('shift_type', 'dinner')
                weeks_ago = max(1, (ref_date - d).days // 7)
                weight = 1.0 / weeks_ago
                covers = float(r.get('actual_covers') or 0)
                revenue = float(r.get('actual_revenue') or 0)
                grouped[(dow, shift)].append((covers, revenue, weight))

            ws = datetime.fromisoformat(week_start).date()
            for day_offset in range(7):
                date = ws + timedelta(days=day_offset)
                dow = date.weekday()
                date_str = date.isoformat()
                for shift in ['breakfast', 'lunch', 'dinner', 'late_night']:
                    entries = grouped.get((dow, shift), [])
                    if not entries:
                        continue
                    total_w = sum(w for _, _, w in entries)
                    avg_covers = sum(c * w for c, _, w in entries) / total_w
                    avg_revenue = sum(rv * w for _, rv, w in entries) / total_w
                    if avg_covers < 1:
                        continue
                    self.demand_forecasts.setdefault(date_str, {})[shift] = {
                        'covers': round(avg_covers, 1),
                        'revenue': round(avg_revenue, 2),
                        'confidence': min(0.7, len(entries) / 8.0),
                        'forecast_id': None,
                    }
            print(f"[SMART] Built historical forecasts for {len(self.demand_forecasts)} days", flush=True)
        except Exception as e:
            print(f"[SMART] Could not fetch demand_history: {e}", flush=True)

    def _fetch_cplh_targets(self):
        print(f"[SMART] Fetching CPLH targets...", flush=True)
        try:
            rows = db.select(
                'covers_per_labor_hour_targets',
                'position_id,shift_type,target_cplh,p50_cplh',
                venue_id=f'eq.{self.venue_id}',
                is_active='eq.true',
            )
            for r in rows:
                cplh = float(r.get('target_cplh') or r.get('p50_cplh') or 0)
                if cplh > 0:
                    self.cplh_targets[(r['position_id'], r.get('shift_type', 'dinner'))] = cplh
            print(f"[SMART] Loaded {len(self.cplh_targets)} CPLH targets", flush=True)
        except Exception as e:
            print(f"[SMART] Could not fetch CPLH targets (using benchmarks): {e}", flush=True)

    def _fetch_service_quality_standards(self):
        print(f"[SMART] Fetching service quality standards...", flush=True)
        try:
            rows = db.select(
                'service_quality_standards', 'metric_name,target_value',
                venue_id=f'eq.{self.venue_id}', is_active='eq.true',
            )
            for r in rows:
                name = r.get('metric_name', '').lower()
                val = float(r.get('target_value') or 0)
                if 'covers_per_server' in name and val > 0:
                    self.service_quality['max_covers_per_server'] = val
                elif 'busser' in name and 'ratio' in name and val > 0:
                    self.service_quality['busser_to_server_ratio'] = val
                elif 'runner' in name and 'ratio' in name and val > 0:
                    self.service_quality['runner_to_server_ratio'] = val
            if not self.service_quality:
                self.service_quality = dict(DEFAULT_SERVICE_QUALITY)
            else:
                for k, v in DEFAULT_SERVICE_QUALITY.items():
                    self.service_quality.setdefault(k, v)
        except Exception as e:
            self.service_quality = dict(DEFAULT_SERVICE_QUALITY)
            print(f"[SMART] Using default quality standards: {e}", flush=True)

    def _fetch_optimization_settings(self):
        print(f"[SMART] Fetching optimization settings...", flush=True)
        try:
            rows = db.select(
                'labor_optimization_settings', 'setting_name,setting_value',
                venue_id=f'eq.{self.venue_id}', is_active='eq.true',
            )
            for r in rows:
                try:
                    self.optimization_settings[r['setting_name']] = float(r['setting_value'])
                except (ValueError, TypeError, KeyError):
                    pass
            if not self.optimization_settings:
                self.optimization_settings = dict(DEFAULT_OPTIMIZATION)
            else:
                for k, v in DEFAULT_OPTIMIZATION.items():
                    self.optimization_settings.setdefault(k, v)
        except Exception as e:
            self.optimization_settings = dict(DEFAULT_OPTIMIZATION)
            print(f"[SMART] Using default optimization settings: {e}", flush=True)

    def _fetch_manager_feedback(self):
        print(f"[SMART] Analyzing manager feedback...", flush=True)
        try:
            cutoff = (datetime.now().date() - timedelta(days=90)).isoformat()
            rows = db.select(
                'manager_feedback',
                'business_date,original_recommendation,manager_decision,reason',
                venue_id=f'eq.{self.venue_id}',
                feedback_type='eq.override',
                business_date=f'gte.{cutoff}',
            )
            if not rows:
                print(f"[SMART] No manager feedback found", flush=True)
                return

            from collections import defaultdict
            override_counts = defaultdict(lambda: {'added': 0, 'removed': 0})
            for r in rows:
                try:
                    decision = json.loads(r.get('manager_decision') or '{}')
                    original = json.loads(r.get('original_recommendation') or '{}')
                except (json.JSONDecodeError, TypeError):
                    continue
                date_str = r.get('business_date')
                if not date_str:
                    continue
                dow = datetime.fromisoformat(date_str).weekday()
                pos_name = original.get('position_name', '')
                shift_type = decision.get('shift_type', original.get('shift_type', 'dinner'))
                action = decision.get('action', '')
                if not pos_name and not action:
                    continue
                key = (pos_name, shift_type, dow)
                if action == 'added_shift':
                    override_counts[key]['added'] += 1
                elif action == 'shift_removed':
                    override_counts[key]['removed'] += 1

            for key, counts in override_counts.items():
                if counts['added'] >= 3 and counts['added'] > counts['removed']:
                    self.manager_adjustments[key] = +1
                elif counts['removed'] >= 3 and counts['removed'] > counts['added']:
                    self.manager_adjustments[key] = -1

            print(f"[SMART] Learned {len(self.manager_adjustments)} adjustments from {len(rows)} overrides", flush=True)
        except Exception as e:
            print(f"[SMART] Could not analyze manager feedback: {e}", flush=True)

    def _fetch_staffing_patterns(self):
        try:
            self.staffing_patterns = db.select(
                'staffing_patterns',
                'position_id,shift_type,covers_range_start,covers_range_end,employees_recommended',
                venue_id=f'eq.{self.venue_id}', is_active='eq.true',
            )
        except Exception:
            pass

    def _load_hourly_forecast(self, forecast_path: Optional[str] = None):
        """Load hourly staffing forecast from JSON file.

        Overrides demand_forecasts with more accurate per-day covers/revenue
        and provides hour-by-hour server/bartender counts for wave scheduling.
        """
        if not forecast_path:
            # Auto-detect: look for hourly_forecast.json next to this script
            forecast_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hourly_forecast.json')

        if not os.path.exists(forecast_path):
            return

        try:
            with open(forecast_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            self.closed_weekdays = set(data.get('closed_weekdays', []))
            days = data.get('days', {})

            for date_str, day_data in days.items():
                self.hourly_forecast[date_str] = day_data

                # Override demand_forecasts with accurate covers/revenue from forecast file
                covers = day_data.get('covers', 0)
                revenue = day_data.get('revenue', 0)
                if covers > 0:
                    self.demand_forecasts[date_str] = {
                        'dinner': {
                            'covers': float(covers),
                            'revenue': float(revenue),
                            'confidence': 0.9,
                            'forecast_id': None,
                        }
                    }

            print(f"[FORECAST] Loaded hourly forecast for {len(days)} days "
                  f"(closed weekdays: {self.closed_weekdays or 'none'})", flush=True)
        except Exception as e:
            print(f"[FORECAST] Could not load hourly forecast: {e}", flush=True)

    def _load_active_covers_forecast(self, week_start_str: str, scenario: str = 'buffered'):
        """Load hourly staffing forecast from daily_staffing_forecasts table (active covers engine).

        Replaces file-based hourly_forecast.json with database-driven data from the
        labor_optimizer pipeline. Falls back silently if no forecasts exist.
        """
        try:
            week_start = datetime.strptime(week_start_str, '%Y-%m-%d').date()
            week_end = week_start + timedelta(days=6)

            # Query daily_staffing_forecasts for this week and scenario
            forecasts = db.select(
                'daily_staffing_forecasts',
                'forecast_date,day_of_week,hourly_detail,estimated_covers,estimated_revenue,seasonal_note',
                venue_id=f'eq.{self.venue_id}',
                scenario=f'eq.{scenario}',
                forecast_date=f'gte.{week_start.isoformat()}',
            )

            # Filter to just this week (PostgREST doesn't support lte + gte on same column easily)
            forecasts = [f for f in forecasts if f['forecast_date'] <= week_end.isoformat()]

            if not forecasts:
                print(f"[ACTIVE-COVERS] No forecasts found for week {week_start_str} ({scenario})", flush=True)
                return

            # Also load location_config for closed_weekdays
            configs = db.select(
                'location_config',
                'closed_weekdays',
                venue_id=f'eq.{self.venue_id}',
                is_active='eq.true',
            )
            if configs and configs[0].get('closed_weekdays'):
                self.closed_weekdays = set(configs[0]['closed_weekdays'])

            loaded = 0
            for forecast in forecasts:
                date_str = forecast['forecast_date']
                hourly_detail = forecast['hourly_detail']
                if isinstance(hourly_detail, str):
                    hourly_detail = json.loads(hourly_detail)

                # Convert hourly_detail array into the format expected by _calculate_smart_requirements:
                # {hourly_servers: {hour: count}, hourly_bartenders: {hour: count}, covers, revenue}
                hourly_servers = {}
                hourly_bartenders = {}
                for entry in hourly_detail:
                    h = str(entry['hour'])
                    hourly_servers[h] = entry.get('servers', 0)
                    hourly_bartenders[h] = entry.get('bartenders', 0)

                day_data = {
                    'covers': forecast.get('estimated_covers', 0),
                    'revenue': forecast.get('estimated_revenue', 0),
                    'hourly_servers': hourly_servers,
                    'hourly_bartenders': hourly_bartenders,
                }

                self.hourly_forecast[date_str] = day_data
                loaded += 1

                # Override demand_forecasts too
                covers = day_data['covers']
                revenue = day_data['revenue']
                if covers > 0:
                    self.demand_forecasts[date_str] = {
                        'dinner': {
                            'covers': float(covers),
                            'revenue': float(revenue),
                            'confidence': 0.9,
                            'forecast_id': None,
                        }
                    }

            seasonal_notes = [f['seasonal_note'] for f in forecasts if f.get('seasonal_note')]
            notes_str = f" (events: {', '.join(set(seasonal_notes))})" if seasonal_notes else ""
            print(f"[ACTIVE-COVERS] Loaded DB forecasts for {loaded} days, scenario={scenario}{notes_str}", flush=True)

        except Exception as e:
            print(f"[ACTIVE-COVERS] Could not load DB forecasts: {e}", flush=True)

    # ── Position Shift Config Lookup ────────────────────────────────

    def _get_position_shift_config(self, position_name: str, shift_type: str) -> Optional[Dict]:
        """Get position-specific shift config (start, end, hours) for a given shift type"""
        shift_configs = POSITION_SHIFT_CONFIGS.get(shift_type, {})
        key = _match_config_key(position_name, shift_configs)
        if key:
            return dict(shift_configs[key])  # return copy
        return None

    def _get_cplh_for_position(self, position_id: str, position_name: str, shift_type: str) -> float:
        cplh = self.cplh_targets.get((position_id, shift_type))
        if cplh and cplh > 0:
            return cplh
        for bench_name, shifts in INDUSTRY_BENCHMARKS.items():
            if bench_name.lower() in position_name.lower():
                return shifts.get(shift_type, shifts.get('dinner', {})).get('target', 8.0)
        for default_name, default_cplh in DEFAULT_POSITION_CPLH.items():
            if default_name.lower() in position_name.lower():
                return default_cplh
        return 10.0

    # ── Smart Requirements ──────────────────────────────────────────

    def _calculate_smart_requirements(self, week_start_date: str) -> List[Dict]:
        """Calculate staffing from demand forecasts with position-specific hours and staggering.
        Uses hourly wave data for servers/bartenders when available."""
        print(f"\n[SMART] Calculating demand-driven requirements...", flush=True)

        ws = datetime.fromisoformat(week_start_date).date()
        requirements = []

        # Find primary server/bartender positions for wave scheduling
        server_pos = None   # (id, position_dict)
        bartender_pos = None
        for pid, p in self.positions.items():
            pl = p['name'].lower()
            if 'server' in pl and 'food' not in pl and not server_pos:
                server_pos = (pid, p)
            if 'bartender' in pl and not bartender_pos:
                bartender_pos = (pid, p)

        hourly_processed = set()  # track (date, 'server'/'bartender') to avoid duplicates

        for day_offset in range(7):
            date = ws + timedelta(days=day_offset)
            date_str = date.isoformat()

            # Skip closed days
            if date.weekday() in self.closed_weekdays:
                print(f"  {date.strftime('%a')} {date_str}: CLOSED", flush=True)
                continue

            day_forecasts = self.demand_forecasts.get(date_str, {})
            hourly_day = self.hourly_forecast.get(date_str, {})

            if not day_forecasts:
                continue

            for shift_type, forecast in day_forecasts.items():
                covers = forecast['covers']
                if covers < 1:
                    continue

                tier = _get_demand_tier(covers)
                day_name = date.strftime('%a')

                for pos_id, pos in self.positions.items():
                    pos_name = pos['name']
                    pos_lower = pos_name.lower()

                    # ── Hourly wave scheduling for servers ──────────────
                    is_server = 'server' in pos_lower and 'food' not in pos_lower
                    if is_server and 'hourly_servers' in hourly_day and server_pos:
                        wave_key = (date_str, 'server')
                        if wave_key not in hourly_processed:
                            hourly_processed.add(wave_key)
                            counts = {int(h): c for h, c in hourly_day['hourly_servers'].items() if int(c) > 0}
                            waves = _compute_shift_waves(counts)
                            sp_id, sp = server_pos
                            for i, wave in enumerate(waves):
                                label = 'Open' if i == 0 else ('Close' if i == len(waves) - 1 else f'Mid {i}')
                                requirements.append({
                                    'id': str(_uuid.uuid4()),
                                    'venue_id': self.venue_id,
                                    'business_date': date_str,
                                    'shift_type': shift_type,
                                    'position_id': sp_id,
                                    'position': sp,
                                    'employees_needed': wave['count'],
                                    'hours_per_employee': wave['hours'],
                                    'total_hours': wave['count'] * wave['hours'],
                                    'total_cost': wave['count'] * wave['hours'] * float(sp['base_hourly_rate']),
                                    'predicted_covers': covers,
                                    'predicted_revenue': forecast.get('revenue', 0),
                                    'shift_start': wave['start'],
                                    'shift_end': wave['end'],
                                    'shift_note': f"Server {label}",
                                    'shift_label': f"Server ({label})",
                                    'from_hourly': True,
                                })
                            total_s = sum(w['count'] for w in waves)
                            print(f"  {day_name} {date_str} {shift_type}: Server = {total_s} "
                                  f"across {len(waves)} staggered waves "
                                  f"[{covers:.0f} covers, hourly forecast]", flush=True)
                            for w in waves:
                                print(f"      {w['count']}x  {w['start']} - {w['end']}  ({w['hours']}h)", flush=True)
                        continue

                    # ── Hourly wave scheduling for bartenders ──────────
                    is_bartender = 'bartender' in pos_lower
                    if is_bartender and 'hourly_bartenders' in hourly_day and bartender_pos:
                        wave_key = (date_str, 'bartender')
                        if wave_key not in hourly_processed:
                            hourly_processed.add(wave_key)
                            counts = {int(h): c for h, c in hourly_day['hourly_bartenders'].items() if int(c) > 0}
                            waves = _compute_shift_waves(counts)
                            bp_id, bp = bartender_pos
                            for i, wave in enumerate(waves):
                                label = 'Open' if i == 0 else ('Close' if i == len(waves) - 1 else f'Mid {i}')
                                requirements.append({
                                    'id': str(_uuid.uuid4()),
                                    'venue_id': self.venue_id,
                                    'business_date': date_str,
                                    'shift_type': shift_type,
                                    'position_id': bp_id,
                                    'position': bp,
                                    'employees_needed': wave['count'],
                                    'hours_per_employee': wave['hours'],
                                    'total_hours': wave['count'] * wave['hours'],
                                    'total_cost': wave['count'] * wave['hours'] * float(bp['base_hourly_rate']),
                                    'predicted_covers': covers,
                                    'predicted_revenue': forecast.get('revenue', 0),
                                    'shift_start': wave['start'],
                                    'shift_end': wave['end'],
                                    'shift_note': f"Bartender {label}",
                                    'shift_label': f"Bartender ({label})",
                                    'from_hourly': True,
                                })
                            total_bt = sum(w['count'] for w in waves)
                            print(f"  {day_name} {date_str} {shift_type}: Bartender = {total_bt} "
                                  f"across {len(waves)} staggered waves "
                                  f"[{covers:.0f} covers, hourly forecast]", flush=True)
                        continue

                    # ── Standard CPLH-based scheduling for all other positions ──
                    # Get position-specific shift config
                    shift_cfg = self._get_position_shift_config(pos_name, shift_type)
                    if not shift_cfg:
                        # Position doesn't work this shift type (e.g., no Sommelier at breakfast)
                        continue

                    shift_hours = shift_cfg['hours']
                    shift_start = shift_cfg['start']
                    shift_end = shift_cfg['end']
                    shift_note = ''

                    # Calculate employees needed
                    is_fixed = any(f.lower() in pos_name.lower() for f in FIXED_STAFF_POSITIONS)
                    ratio_key = _match_config_key(pos_name, COVERS_RATIO_POSITIONS)

                    if is_fixed:
                        needed = 1
                    elif ratio_key:
                        ratio = COVERS_RATIO_POSITIONS[ratio_key]
                        needed = max(1, math.ceil(covers / ratio))
                    else:
                        target_cplh = self._get_cplh_for_position(pos_id, pos_name, shift_type)
                        if target_cplh <= 0:
                            needed = 1
                        else:
                            needed = max(1, math.ceil(covers / (target_cplh * shift_hours)))

                    # ── Stagger check: busy/peak nights with many FOH staff ──
                    stagger_key = _match_config_key(pos_name, STAGGER_CONFIG)
                    if (stagger_key and tier in ('busy', 'peak') and
                            needed >= STAGGER_CONFIG[stagger_key]['threshold']):

                        stagger = STAGGER_CONFIG[stagger_key]
                        open_count = max(1, round(needed * stagger['open']['pct']))
                        close_count = max(1, needed - open_count)

                        # Opener shift
                        requirements.append({
                            'id': str(_uuid.uuid4()),
                            'venue_id': self.venue_id,
                            'business_date': date_str,
                            'shift_type': shift_type,
                            'position_id': pos_id,
                            'position': pos,
                            'employees_needed': open_count,
                            'hours_per_employee': stagger['open']['hours'],
                            'total_hours': open_count * stagger['open']['hours'],
                            'total_cost': open_count * stagger['open']['hours'] * float(pos['base_hourly_rate']),
                            'predicted_covers': covers,
                            'predicted_revenue': forecast.get('revenue', 0),
                            'shift_start': stagger['open']['start'],
                            'shift_end': stagger['open']['end'],
                            'shift_note': stagger['open']['note'],
                            'shift_label': f'{pos_name} (Open)',
                        })
                        # Closer shift
                        requirements.append({
                            'id': str(_uuid.uuid4()),
                            'venue_id': self.venue_id,
                            'business_date': date_str,
                            'shift_type': shift_type,
                            'position_id': pos_id,
                            'position': pos,
                            'employees_needed': close_count,
                            'hours_per_employee': stagger['close']['hours'],
                            'total_hours': close_count * stagger['close']['hours'],
                            'total_cost': close_count * stagger['close']['hours'] * float(pos['base_hourly_rate']),
                            'predicted_covers': covers,
                            'predicted_revenue': forecast.get('revenue', 0),
                            'shift_start': stagger['close']['start'],
                            'shift_end': stagger['close']['end'],
                            'shift_note': stagger['close']['note'],
                            'shift_label': f'{pos_name} (Close)',
                        })

                        print(f"  {day_name} {date_str} {shift_type}: {pos_name} = "
                              f"{open_count} openers ({stagger['open']['start']}-{stagger['open']['end']}) + "
                              f"{close_count} closers ({stagger['close']['start']}-{stagger['close']['end']}) "
                              f"[{tier}, {covers:.0f} covers]", flush=True)
                        continue

                    # ── Light night adjustments: cut FOH early ──
                    if tier == 'light' and not is_fixed:
                        cut_key = _match_config_key(pos_name, LIGHT_NIGHT_CUTS)
                        if cut_key:
                            cut = LIGHT_NIGHT_CUTS[cut_key]
                            shift_hours = max(3.0, shift_hours + cut['hours_delta'])
                            # Adjust end time
                            end_h, end_m = _parse_time(shift_end)
                            end_dt = datetime(2000, 1, 1, end_h, end_m) + timedelta(minutes=cut['end_delta_min'])
                            shift_end = f"{end_dt.hour:02d}:{end_dt.minute:02d}"
                            shift_note = cut['note']

                    requirements.append({
                        'id': str(_uuid.uuid4()),
                        'venue_id': self.venue_id,
                        'business_date': date_str,
                        'shift_type': shift_type,
                        'position_id': pos_id,
                        'position': pos,
                        'employees_needed': needed,
                        'hours_per_employee': shift_hours,
                        'total_hours': needed * shift_hours,
                        'total_cost': needed * shift_hours * float(pos['base_hourly_rate']),
                        'predicted_covers': covers,
                        'predicted_revenue': forecast.get('revenue', 0),
                        'shift_start': shift_start,
                        'shift_end': shift_end,
                        'shift_note': shift_note,
                        'shift_label': pos_name,
                    })

                    print(f"  {day_name} {date_str} {shift_type}: {pos_name} = {needed} "
                          f"({shift_start}-{shift_end}, {shift_hours}h) [{tier}, {covers:.0f} covers]"
                          f"{' — ' + shift_note if shift_note else ''}", flush=True)

        print(f"[SMART] Generated {len(requirements)} requirements", flush=True)
        return requirements

    def _apply_service_quality_constraints(self, requirements: List[Dict]) -> List[Dict]:
        print(f"\n[QUALITY] Applying service quality constraints...", flush=True)

        max_cps = self.service_quality.get('max_covers_per_server', 12)
        busser_ratio = self.service_quality.get('busser_to_server_ratio', 0.5)
        runner_ratio = self.service_quality.get('runner_to_server_ratio', 0.33)

        from collections import defaultdict
        groups = defaultdict(list)
        for req in requirements:
            groups[(req['business_date'], req['shift_type'])].append(req)

        adjustments = 0
        for (date, shift), reqs in groups.items():
            covers = max((r.get('predicted_covers', 0) for r in reqs), default=0)
            if covers < 1:
                continue

            # Sum server/busser/runner counts across all sub-shifts (open+close)
            server_reqs = [r for r in reqs if 'server' in r.get('shift_label', r['position']['name']).lower()
                           and 'food' not in r.get('shift_label', '').lower()]
            busser_reqs = [r for r in reqs if 'busser' in r.get('shift_label', r['position']['name']).lower()
                           or 'bus' in r.get('shift_label', r['position']['name']).lower()]
            runner_reqs = [r for r in reqs if 'runner' in r.get('shift_label', r['position']['name']).lower()
                           or 'food runner' in r.get('shift_label', r['position']['name']).lower()]

            total_servers = sum(r['employees_needed'] for r in server_reqs)
            total_bussers = sum(r['employees_needed'] for r in busser_reqs)
            total_runners = sum(r['employees_needed'] for r in runner_reqs)

            # Check max covers per server — only when hourly data provides peak concurrent counts.
            # Without hourly data, "covers" is total daily (e.g. 500), not simultaneous (~200).
            # Using ceil(500/12) = 42 servers is wildly inflated. CPLH already handles throughput.
            has_hourly_servers = any(r.get('from_hourly') for r in server_reqs)
            if has_hourly_servers:
                # Hourly data already sized for peak concurrent — just validate
                pass
            # For non-hourly days, trust the CPLH calculation (no inflation)

            # Check busser ratio
            min_bussers = math.ceil(total_servers * busser_ratio)
            if total_bussers < min_bussers and busser_reqs:
                deficit = min_bussers - total_bussers
                biggest = max(busser_reqs, key=lambda r: r['employees_needed'])
                biggest['employees_needed'] += deficit
                biggest['total_hours'] = biggest['employees_needed'] * biggest['hours_per_employee']
                biggest['total_cost'] = biggest['total_hours'] * float(biggest['position']['base_hourly_rate'])
                print(f"  [QUALITY] {date} {shift}: +{deficit} bussers (ratio {busser_ratio} of {total_servers} servers)", flush=True)
                adjustments += 1

            # Check runner ratio
            min_runners = math.ceil(total_servers * runner_ratio)
            if total_runners < min_runners and runner_reqs:
                deficit = min_runners - total_runners
                biggest = max(runner_reqs, key=lambda r: r['employees_needed'])
                biggest['employees_needed'] += deficit
                biggest['total_hours'] = biggest['employees_needed'] * biggest['hours_per_employee']
                biggest['total_cost'] = biggest['total_hours'] * float(biggest['position']['base_hourly_rate'])
                print(f"  [QUALITY] {date} {shift}: +{deficit} runners (ratio {runner_ratio} of {total_servers} servers)", flush=True)
                adjustments += 1

        print(f"[QUALITY] Made {adjustments} quality adjustments", flush=True)
        return requirements

    def _apply_manager_feedback_adjustments(self, requirements: List[Dict]) -> List[Dict]:
        if not self.manager_adjustments:
            return requirements
        print(f"\n[FEEDBACK] Applying manager feedback adjustments...", flush=True)
        adjustments = 0
        for req in requirements:
            date = datetime.fromisoformat(req['business_date']).date()
            dow = date.weekday()
            pos_name = req['position']['name']
            shift_type = req['shift_type']
            key = (pos_name, shift_type, dow)
            delta = self.manager_adjustments.get(key, 0)
            if delta != 0:
                old = req['employees_needed']
                req['employees_needed'] = max(1, req['employees_needed'] + delta)
                req['total_hours'] = req['employees_needed'] * req['hours_per_employee']
                req['total_cost'] = req['total_hours'] * float(req['position']['base_hourly_rate'])
                print(f"  [FEEDBACK] {req['business_date']} {shift_type}: {pos_name} "
                      f"{old} -> {req['employees_needed']}", flush=True)
                adjustments += 1
        print(f"[FEEDBACK] Applied {adjustments} adjustments", flush=True)
        return requirements

    def _validate_against_staffing_patterns(self, requirements: List[Dict]):
        if not self.staffing_patterns:
            return
        warnings = 0
        for req in requirements:
            covers = req.get('predicted_covers', 0)
            for pattern in self.staffing_patterns:
                if (pattern['position_id'] == req['position_id'] and
                    pattern.get('shift_type') == req['shift_type'] and
                    float(pattern.get('covers_range_start', 0)) <= covers <=
                    float(pattern.get('covers_range_end', 9999))):
                    historical = float(pattern.get('employees_recommended', 0))
                    if historical > 0 and abs(req['employees_needed'] - historical) / historical > 0.3:
                        print(f"  [WARN] {req['business_date']}: {req['position']['name']} "
                              f"calc={req['employees_needed']} vs hist={historical:.0f}", flush=True)
                        warnings += 1
                    break

    # ── Enhanced Scoring ────────────────────────────────────────────

    def _score_employee(self, emp: Dict, weekly_hours: float, days_worked: int) -> float:
        """Multi-objective scoring: lower is better. Penalizes overwork and consecutive days."""
        rate = float(emp['position']['base_hourly_rate'])
        max_hours = float(emp.get('max_hours_per_week') or 40)
        hours_pct = weekly_hours / max_hours if max_hours > 0 else 1.0

        w = self.optimization_settings
        cost_w = float(w.get('cost_weight', 0.4))
        quality_w = float(w.get('quality_weight', 0.4))

        cost_score = rate / 35.0
        balance_score = hours_pct

        score = cost_w * cost_score + quality_w * balance_score

        # Penalize 6th+ working day to encourage days off
        if days_worked >= 5:
            score += 0.3
        if days_worked >= 6:
            score += 0.5

        return score

    # ── Schedule Metrics ────────────────────────────────────────────

    def _compute_schedule_metrics(self, assignments: List[Dict], requirements: List[Dict]) -> Dict:
        total_hours = sum(a['scheduled_hours'] for a in assignments)
        total_cost = sum(a['labor_cost'] for a in assignments)

        total_covers = 0.0
        total_revenue = 0.0
        seen_day_shifts = set()
        for req in requirements:
            key = (req['business_date'], req['shift_type'])
            if key not in seen_day_shifts:
                seen_day_shifts.add(key)
                total_covers += req.get('predicted_covers', 0)
                total_revenue += req.get('predicted_revenue', 0)

        overall_cplh = total_covers / total_hours if total_hours > 0 else 0
        labor_pct = (total_cost / total_revenue * 100) if total_revenue > 0 else 0

        violations = 0
        max_cps = self.service_quality.get('max_covers_per_server', 12)
        from collections import defaultdict
        day_shift_assignments = defaultdict(lambda: defaultdict(int))
        for a in assignments:
            key = (a['business_date'], a['shift_type'])
            day_shift_assignments[key][a['position_name'].lower()] += 1
        for (date, shift), pos_counts in day_shift_assignments.items():
            forecast = self.demand_forecasts.get(date, {}).get(shift, {})
            covers = forecast.get('covers', 0)
            servers = sum(v for k, v in pos_counts.items() if 'server' in k and 'food' not in k)
            if servers > 0 and covers / servers > max_cps:
                violations += 1

        quality_score = max(0, 1.0 - (violations * 0.1))

        metrics = {
            'overall_cplh': round(overall_cplh, 2),
            'labor_percentage': round(labor_pct, 2),
            'service_quality_score': round(quality_score, 2),
            'total_predicted_covers': round(total_covers, 0),
            'total_projected_revenue': round(total_revenue, 2),
            'quality_violations': violations,
        }

        print(f"\n[METRICS] Schedule Metrics:", flush=True)
        print(f"  Overall CPLH:         {metrics['overall_cplh']}", flush=True)
        print(f"  Labor %:              {metrics['labor_percentage']}%", flush=True)
        print(f"  Quality Score:        {metrics['service_quality_score']}", flush=True)
        print(f"  Predicted Covers:     {metrics['total_predicted_covers']}", flush=True)
        print(f"  Projected Revenue:    ${metrics['total_projected_revenue']:,.2f}", flush=True)

        return metrics

    # ── Default Fallback ────────────────────────────────────────────

    def _generate_default_requirements(self, week_start_date: str) -> List[Dict]:
        """Fallback: generate from positions & employees when no data exists.
        Uses position-specific dinner hours instead of flat 6h for everyone."""
        week_start = datetime.fromisoformat(week_start_date).date()

        emps_by_pos: Dict[str, list] = {}
        for emp in self.employees:
            pid = emp['primary_position_id']
            emps_by_pos.setdefault(pid, []).append(emp)

        if not emps_by_pos:
            return []

        requirements = []
        for day_offset in range(7):
            date = (week_start + timedelta(days=day_offset)).isoformat()
            for pos_id, emps in emps_by_pos.items():
                pos = self.positions.get(pos_id)
                if not pos:
                    continue

                # Use position-specific dinner shift config
                shift_cfg = self._get_position_shift_config(pos['name'], 'dinner')
                if shift_cfg:
                    hours = shift_cfg['hours']
                    start = shift_cfg['start']
                    end = shift_cfg['end']
                else:
                    hours = 6.0
                    start = '17:00'
                    end = '23:00'

                needed = min(len(emps), 2) if len(emps) >= 2 else 1
                requirements.append({
                    'id': str(_uuid.uuid4()),
                    'venue_id': self.venue_id,
                    'business_date': date,
                    'shift_type': 'dinner',
                    'position_id': pos_id,
                    'position': pos,
                    'employees_needed': needed,
                    'hours_per_employee': hours,
                    'total_hours': needed * hours,
                    'total_cost': needed * hours * float(pos['base_hourly_rate']),
                    'shift_start': start,
                    'shift_end': end,
                    'shift_note': '',
                    'shift_label': pos['name'],
                })

        print(f"[FALLBACK] Generated {len(requirements)} default requirements", flush=True)
        return requirements

    # ── Main Scheduling Flow ────────────────────────────────────────

    def generate_schedule(self, week_start_date: str) -> Dict:
        week_start = datetime.fromisoformat(week_start_date).date()
        week_end = week_start + timedelta(days=6)

        print(f"\n{'='*60}", flush=True)
        print(f"[SCHEDULE] Smart schedule generation for {week_start} to {week_end}", flush=True)
        print(f"{'='*60}\n", flush=True)

        self.load_data(week_start_date)

        self._fetch_demand_forecasts(week_start.isoformat(), week_end.isoformat())
        self._fetch_cplh_targets()
        self._fetch_service_quality_standards()
        self._fetch_optimization_settings()
        self._fetch_manager_feedback()
        self._fetch_staffing_patterns()
        # Load hourly forecasts: prefer active covers DB, fall back to JSON file
        if getattr(self, '_use_active_covers', False):
            self._load_active_covers_forecast(week_start_date, getattr(self, '_active_covers_scenario', 'buffered'))
        self._load_hourly_forecast(getattr(self, '_forecast_path', None))

        if not self.requirements:
            if self.demand_forecasts:
                self.optimization_mode = 'smart'
                self.requirements = self._calculate_smart_requirements(week_start_date)
                self.requirements = self._apply_service_quality_constraints(self.requirements)
                self.requirements = self._apply_manager_feedback_adjustments(self.requirements)
                self._validate_against_staffing_patterns(self.requirements)
            else:
                self.optimization_mode = 'fallback'
                print(f"\n[FALLBACK] No forecasts or requirements -- using defaults...", flush=True)
                self.requirements = self._generate_default_requirements(week_start_date)

            if not self.requirements:
                if not self.employees:
                    print("MISSING_EMPLOYEES: No active employees found.")
                elif not self.positions:
                    print("MISSING_POSITIONS: No active positions found.")
                else:
                    print("MISSING_DATA: Could not generate schedule.")
                return None

        # ── Greedy Assignment ───────────────────────────────────────
        print(f"\n[ASSIGN] Running greedy assignment ({self.optimization_mode} mode)...", flush=True)

        emp_weekly_hours: Dict[str, float] = {e['id']: 0.0 for e in self.employees}
        emp_daily_shifts: Dict[str, Dict[str, int]] = {e['id']: {} for e in self.employees}

        emps_by_position: Dict[str, List[Dict]] = {}
        for emp in self.employees:
            pid = emp['primary_position_id']
            emps_by_position.setdefault(pid, []).append(emp)

        def req_priority(req):
            pos_name = req['position']['name']
            is_fixed = any(f.lower() in pos_name.lower() for f in FIXED_STAFF_POSITIONS)
            eligible_count = len(emps_by_position.get(req['position_id'], []))
            # Fixed staff first (0), then others (1). Within group: by date, then fewest-eligible
            return (0 if is_fixed else 1, req['business_date'], eligible_count)

        sorted_reqs = sorted(self.requirements, key=req_priority)

        schedule_assignments = []
        total_cost = 0.0
        total_hours = 0.0
        unfilled = 0

        for req in sorted_reqs:
            position_id = req['position_id']
            employees_needed = req['employees_needed']
            shift_hours = req['hours_per_employee']
            date = req['business_date']

            # Build shift start/end from requirement (position-specific)
            req_start = req.get('shift_start', '17:00')
            req_end = req.get('shift_end', '23:00')
            shift_start_dt, shift_end_dt = _build_shift_datetimes(date, req_start, req_end)

            eligible = emps_by_position.get(position_id, [])
            if not eligible:
                unfilled += employees_needed
                continue

            # Sort by multi-objective score
            def emp_sort_key(e):
                days = len([d for d, c in emp_daily_shifts[e['id']].items() if c > 0])
                return self._score_employee(e, emp_weekly_hours.get(e['id'], 0), days)

            eligible_sorted = sorted(eligible, key=emp_sort_key)

            # Check if this is a fixed-staff position (management, exec chef, etc.)
            pos_name = req['position']['name']
            is_fixed_req = any(f.lower() in pos_name.lower() for f in FIXED_STAFF_POSITIONS)

            assigned_count = 0
            for emp in eligible_sorted:
                if assigned_count >= employees_needed:
                    break

                emp_id = emp['id']
                raw_max = emp.get('max_hours_per_week')
                max_hours = float(raw_max) if raw_max is not None else 40.0
                # Fixed staff (salaried management): no weekly hour cap
                if not is_fixed_req and emp_weekly_hours[emp_id] + shift_hours > max_hours:
                    continue

                daily = emp_daily_shifts[emp_id].get(date, 0)
                if daily >= 1:
                    continue

                hourly_rate = float(emp['position']['base_hourly_rate'])
                shift_cost = shift_hours * hourly_rate

                emp_weekly_hours[emp_id] += shift_hours
                emp_daily_shifts[emp_id][date] = daily + 1

                total_cost += shift_cost
                total_hours += shift_hours

                schedule_assignments.append({
                    'employee_id': emp_id,
                    'employee_name': f"{emp['first_name']} {emp['last_name']}",
                    'position_id': position_id,
                    'position_name': req.get('shift_label', req['position']['name']),
                    'business_date': date,
                    'shift_type': req['shift_type'],
                    'scheduled_start': shift_start_dt.isoformat(),
                    'scheduled_end': shift_end_dt.isoformat(),
                    'scheduled_hours': shift_hours,
                    'hourly_rate': hourly_rate,
                    'labor_cost': shift_cost,
                    'shift_note': req.get('shift_note', ''),
                })
                assigned_count += 1

            unfilled += (employees_needed - assigned_count)

        if not schedule_assignments:
            print("Could not generate schedule -- no assignments made.")
            return None

        metrics = self._compute_schedule_metrics(schedule_assignments, self.requirements)

        print(f"\n[OK] Schedule generated ({self.optimization_mode} mode)", flush=True)
        print(f"   {len(schedule_assignments)} shifts assigned", flush=True)
        print(f"   {total_hours:.1f} total hours", flush=True)
        print(f"   ${total_cost:.2f} total labor cost", flush=True)
        if unfilled > 0:
            print(f"   {unfilled} slots could not be filled", flush=True)

        return {
            'week_start_date': week_start_date,
            'assignments': schedule_assignments,
            'total_hours': total_hours,
            'total_cost': total_cost,
            'status': 'Optimal',
            'unfilled_slots': unfilled,
            'optimization_mode': self.optimization_mode,
            'metrics': metrics,
        }

    def _get_shift_times(self, business_date: str, shift_type: str) -> Tuple[datetime, datetime]:
        """Fallback shift time builder (used when requirement doesn't have shift_start/shift_end)"""
        date = datetime.fromisoformat(business_date)
        shift_config = SHIFT_TIMES.get(shift_type, SHIFT_TIMES['dinner'])
        start = datetime.combine(date, shift_config['start'])
        end = datetime.combine(date, shift_config['end'])
        if shift_config['end'] < shift_config['start']:
            end += timedelta(days=1)
        return start, end

    def save_schedule(self, schedule_data: Dict) -> str:
        if not schedule_data:
            return None

        week_start = datetime.fromisoformat(schedule_data['week_start_date']).date()
        week_end = week_start + timedelta(days=6)

        existing = db.select(
            'weekly_schedules', 'id',
            venue_id=f'eq.{self.venue_id}',
            week_start_date=f'eq.{week_start.isoformat()}',
        )
        for old in existing:
            print(f"[SAVE] Removing old schedule {old['id']}...", flush=True)
            db.delete('shift_assignments', schedule_id=f"eq.{old['id']}")
            db.delete('weekly_schedules', id=f"eq.{old['id']}")

        metrics = schedule_data.get('metrics', {})

        schedule_record = {
            'venue_id': self.venue_id,
            'week_start_date': week_start.isoformat(),
            'week_end_date': week_end.isoformat(),
            'status': 'draft',
            'total_labor_hours': schedule_data['total_hours'],
            'total_labor_cost': schedule_data['total_cost'],
            'generated_at': datetime.now().isoformat(),
            'auto_generated': True,
            'requires_approval': True,
            'optimization_mode': schedule_data.get('optimization_mode', 'fallback'),
        }

        if metrics:
            schedule_record['overall_cplh'] = metrics.get('overall_cplh')
            schedule_record['service_quality_score'] = metrics.get('service_quality_score')
            schedule_record['projected_revenue'] = metrics.get('total_projected_revenue')

        try:
            result = db.insert('weekly_schedules', schedule_record)
        except httpx.HTTPStatusError:
            for key in ['overall_cplh', 'service_quality_score', 'projected_revenue',
                         'auto_generated', 'requires_approval', 'optimization_mode']:
                schedule_record.pop(key, None)
            result = db.insert('weekly_schedules', schedule_record)

        schedule_id = result[0]['id']
        print(f"\n[SAVE] Saving schedule {schedule_id}...", flush=True)

        shift_records = []
        for a in schedule_data['assignments']:
            record = {
                'schedule_id': schedule_id,
                'venue_id': self.venue_id,
                'employee_id': a['employee_id'],
                'position_id': a['position_id'],
                'business_date': a['business_date'],
                'shift_type': a['shift_type'],
                'scheduled_start': a['scheduled_start'],
                'scheduled_end': a['scheduled_end'],
                'scheduled_hours': a['scheduled_hours'],
                'hourly_rate': a.get('hourly_rate', 0),
                'scheduled_cost': a.get('labor_cost', 0),
                'status': 'scheduled',
            }
            # Store shift note in modification_reason for UI display
            note = a.get('shift_note', '')
            if note:
                record['modification_reason'] = note
            shift_records.append(record)

        try:
            db.insert('shift_assignments', shift_records)
        except httpx.HTTPStatusError:
            for rec in shift_records:
                rec.pop('hourly_rate', None)
                rec.pop('scheduled_cost', None)
                rec.pop('modification_reason', None)
            db.insert('shift_assignments', shift_records)

        print(f"[OK] Schedule saved with {len(shift_records)} shifts", flush=True)
        return schedule_id


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Generate optimal weekly schedule')
    parser.add_argument('--venue-id', required=True, help='Venue ID')
    parser.add_argument('--week-start', required=True, help='Week start date (YYYY-MM-DD)')
    parser.add_argument('--save', action='store_true', help='Save schedule to database')
    parser.add_argument('--forecast', default=None, help='Path to hourly forecast JSON file')
    parser.add_argument('--use-active-covers', action='store_true', help='Load forecasts from active covers DB (labor_optimizer)')
    parser.add_argument('--ac-scenario', default='buffered', choices=['lean', 'buffered', 'safe'], help='Active covers scenario')

    args = parser.parse_args()

    scheduler = AutoScheduler(args.venue_id)
    scheduler._forecast_path = args.forecast  # Pass forecast path to generate_schedule
    scheduler._use_active_covers = args.use_active_covers
    scheduler._active_covers_scenario = args.ac_scenario
    schedule = scheduler.generate_schedule(args.week_start)

    if schedule and args.save:
        schedule_id = scheduler.save_schedule(schedule)
        print(f"\nSchedule {schedule_id} ready for review!")
    elif schedule:
        print("---JSON_START---")
        print(json.dumps(schedule, default=str))
        print("---JSON_END---")


if __name__ == '__main__':
    main()
