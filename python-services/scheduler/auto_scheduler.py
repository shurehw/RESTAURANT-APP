"""
Auto-Scheduler - Smart Demand-Driven Optimization
Generates optimal weekly schedules using demand forecasts, CPLH targets,
service quality standards, historical patterns, and manager feedback learning.
Falls back to greedy defaults when data is unavailable.
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


# Shift time configurations
SHIFT_TIMES = {
    'breakfast': {'start': time(7, 0), 'end': time(14, 0), 'hours': 7},
    'lunch': {'start': time(11, 0), 'end': time(16, 0), 'hours': 5},
    'dinner': {'start': time(17, 0), 'end': time(23, 0), 'hours': 6},
    'late_night': {'start': time(22, 0), 'end': time(2, 0), 'hours': 4},
}

# Industry benchmarks for fine dining (covers per labor hour by position/shift)
# Source: cplh_analyzer.py — fine dining standards
INDUSTRY_BENCHMARKS = {
    'Server': {
        'breakfast': {'min': 8.0, 'target': 10.0, 'optimal': 12.0, 'max': 14.0},
        'lunch': {'min': 8.0, 'target': 10.0, 'optimal': 11.5, 'max': 13.0},
        'dinner': {'min': 7.0, 'target': 9.0, 'optimal': 10.5, 'max': 12.0},
        'late_night': {'min': 6.0, 'target': 8.0, 'optimal': 9.5, 'max': 11.0},
    },
    'Busser': {
        'breakfast': {'min': 12.0, 'target': 14.0, 'optimal': 16.0, 'max': 18.0},
        'lunch': {'min': 10.0, 'target': 12.0, 'optimal': 14.0, 'max': 16.0},
        'dinner': {'min': 8.0, 'target': 10.0, 'optimal': 12.0, 'max': 14.0},
        'late_night': {'min': 8.0, 'target': 10.0, 'optimal': 11.0, 'max': 13.0},
    },
    'Food Runner': {
        'breakfast': {'min': 10.0, 'target': 12.0, 'optimal': 14.0, 'max': 16.0},
        'lunch': {'min': 10.0, 'target': 12.0, 'optimal': 13.0, 'max': 15.0},
        'dinner': {'min': 8.0, 'target': 10.0, 'optimal': 11.0, 'max': 13.0},
        'late_night': {'min': 7.0, 'target': 9.0, 'optimal': 10.0, 'max': 12.0},
    },
    'Line Cook': {
        'breakfast': {'min': 6.0, 'target': 8.0, 'optimal': 9.0, 'max': 10.0},
        'lunch': {'min': 6.0, 'target': 8.0, 'optimal': 9.0, 'max': 10.0},
        'dinner': {'min': 5.0, 'target': 7.0, 'optimal': 8.0, 'max': 9.0},
        'late_night': {'min': 5.0, 'target': 6.0, 'optimal': 7.0, 'max': 8.0},
    },
    'Prep Cook': {
        'breakfast': {'min': 4.0, 'target': 6.0, 'optimal': 7.0, 'max': 8.0},
        'lunch': {'min': 4.0, 'target': 6.0, 'optimal': 7.0, 'max': 8.0},
        'dinner': {'min': 4.0, 'target': 5.0, 'optimal': 6.0, 'max': 7.0},
        'late_night': {'min': 3.0, 'target': 5.0, 'optimal': 6.0, 'max': 7.0},
    },
}

# Fallback CPLH for positions not in industry benchmarks
DEFAULT_POSITION_CPLH = {
    'Host': 15.0,        # 1 host per ~15 covers
    'Hostess': 15.0,
    'Dishwasher': 20.0,  # 1 dishwasher per ~20 covers
    'Manager': 0,        # Fixed: always 1 per shift
    'Bartender': 10.0,
    'Barback': 15.0,
    'Sommelier': 20.0,
    'Expeditor': 25.0,
}

# Default service quality standards (fine dining)
DEFAULT_SERVICE_QUALITY = {
    'max_covers_per_server': 12,
    'busser_to_server_ratio': 0.5,
    'runner_to_server_ratio': 0.33,
}

# Default optimization weights
DEFAULT_OPTIMIZATION = {
    'cost_weight': 0.4,
    'quality_weight': 0.4,
    'efficiency_weight': 0.2,
    'target_labor_pct': 27.5,
}

# Positions that always need exactly 1 per shift (no CPLH scaling)
FIXED_STAFF_POSITIONS = {'Manager', 'Expeditor'}

# Positions that scale by covers but use simple ratio (not CPLH)
COVERS_RATIO_POSITIONS = {
    'Dishwasher': 60,   # 1 per 60 covers
    'Host': 80,         # 1 per 80 covers
    'Hostess': 80,
}


class AutoScheduler:
    """Generates optimal weekly schedules using demand-driven smart assignment"""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.employees = []
        self.requirements = []
        self.positions = {}

        # Smart scheduling data
        self.demand_forecasts = {}       # {date_str: {shift_type: {covers, revenue, confidence, forecast_id}}}
        self.cplh_targets = {}           # {(position_id, shift_type): target_cplh}
        self.service_quality = {}        # quality standards from DB or defaults
        self.optimization_settings = {}  # weights and targets
        self.manager_adjustments = {}    # {(position_name, shift_type, dow): delta}
        self.staffing_patterns = []      # historical patterns for validation
        self.optimization_mode = 'fallback'  # tracks which mode was used

    # ── Data Loading ────────────────────────────────────────────────

    def load_data(self, week_start_date: str):
        """Load all necessary data for scheduling"""
        week_start = datetime.fromisoformat(week_start_date).date()
        week_end = week_start + timedelta(days=6)

        print(f"[DATA] Loading data for week {week_start} to {week_end}...", flush=True)

        # Load employees with their position info
        self.employees = db.select(
            'employees',
            '*, position:positions(id, name, base_hourly_rate, category)',
            venue_id=f'eq.{self.venue_id}',
            employment_status='eq.active',
        )
        print(f"[DATA] Loaded {len(self.employees)} active employees", flush=True)

        # Load positions
        positions_data = db.select(
            'positions', '*',
            venue_id=f'eq.{self.venue_id}',
            is_active='eq.true',
        )
        self.positions = {p['id']: p for p in positions_data}

        # Load labor requirements for the week
        self.requirements = db.select(
            'labor_requirements',
            '*, position:positions(*)',
            venue_id=f'eq.{self.venue_id}',
            business_date=f'gte.{week_start.isoformat()}',
        )
        # Filter to the week range (PostgREST single-column filter limitation)
        self.requirements = [
            r for r in self.requirements
            if r['business_date'] <= week_end.isoformat()
        ]
        print(f"[DATA] Loaded {len(self.requirements)} labor requirements", flush=True)

    # ── Smart Data Fetching ─────────────────────────────────────────

    def _fetch_demand_forecasts(self, week_start: str, week_end: str):
        """Fetch predicted covers/revenue from demand_forecasts table"""
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

        # Fallback: use demand_history if no forecasts
        if not self.demand_forecasts:
            self._fetch_demand_history_fallback(week_start)

    def _fetch_demand_history_fallback(self, week_start: str):
        """Compute weighted day-of-week averages from historical demand_history"""
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

            # Group by (day_of_week, shift_type) with recency weighting
            from collections import defaultdict
            grouped = defaultdict(list)  # (dow, shift) -> [(covers, revenue, weight)]

            ref_date = datetime.fromisoformat(week_start).date()
            for r in rows:
                d = datetime.fromisoformat(r['business_date']).date()
                dow = d.weekday()  # 0=Mon
                shift = r.get('shift_type', 'dinner')
                weeks_ago = max(1, (ref_date - d).days // 7)
                weight = 1.0 / weeks_ago  # more recent = higher weight
                covers = float(r.get('actual_covers') or 0)
                revenue = float(r.get('actual_revenue') or 0)
                grouped[(dow, shift)].append((covers, revenue, weight))

            # Build synthetic forecasts for the target week
            ws = datetime.fromisoformat(week_start).date()
            for day_offset in range(7):
                date = (ws + timedelta(days=day_offset))
                dow = date.weekday()
                date_str = date.isoformat()

                for shift in ['breakfast', 'lunch', 'dinner', 'late_night']:
                    entries = grouped.get((dow, shift), [])
                    if not entries:
                        continue
                    total_w = sum(w for _, _, w in entries)
                    avg_covers = sum(c * w for c, _, w in entries) / total_w
                    avg_revenue = sum(r * w for _, r, w in entries) / total_w

                    if avg_covers < 1:
                        continue

                    self.demand_forecasts.setdefault(date_str, {})[shift] = {
                        'covers': round(avg_covers, 1),
                        'revenue': round(avg_revenue, 2),
                        'confidence': min(0.7, len(entries) / 8.0),  # capped at 0.7 for historical
                        'forecast_id': None,
                    }

            print(f"[SMART] Built historical forecasts for {len(self.demand_forecasts)} days from {len(rows)} history rows", flush=True)
        except Exception as e:
            print(f"[SMART] Could not fetch demand_history: {e}", flush=True)

    def _fetch_cplh_targets(self):
        """Fetch venue-specific CPLH targets from covers_per_labor_hour_targets"""
        print(f"[SMART] Fetching CPLH targets...", flush=True)
        try:
            rows = db.select(
                'covers_per_labor_hour_targets',
                'position_id,shift_type,target_cplh,p50_cplh',
                venue_id=f'eq.{self.venue_id}',
                is_active='eq.true',
            )
            for r in rows:
                # Use target_cplh if set, otherwise use p50 (median historical)
                cplh = float(r.get('target_cplh') or r.get('p50_cplh') or 0)
                if cplh > 0:
                    self.cplh_targets[(r['position_id'], r.get('shift_type', 'dinner'))] = cplh

            print(f"[SMART] Loaded {len(self.cplh_targets)} CPLH targets", flush=True)
        except Exception as e:
            print(f"[SMART] Could not fetch CPLH targets (using benchmarks): {e}", flush=True)

    def _fetch_service_quality_standards(self):
        """Fetch service quality standards from DB"""
        print(f"[SMART] Fetching service quality standards...", flush=True)
        try:
            rows = db.select(
                'service_quality_standards',
                'metric_name,target_value',
                venue_id=f'eq.{self.venue_id}',
                is_active='eq.true',
            )
            for r in rows:
                name = r.get('metric_name', '')
                val = float(r.get('target_value') or 0)
                if 'covers_per_server' in name.lower() and val > 0:
                    self.service_quality['max_covers_per_server'] = val
                elif 'busser' in name.lower() and 'ratio' in name.lower() and val > 0:
                    self.service_quality['busser_to_server_ratio'] = val
                elif 'runner' in name.lower() and 'ratio' in name.lower() and val > 0:
                    self.service_quality['runner_to_server_ratio'] = val

            if not self.service_quality:
                self.service_quality = dict(DEFAULT_SERVICE_QUALITY)
                print(f"[SMART] Using default service quality standards", flush=True)
            else:
                # Fill in any missing keys from defaults
                for k, v in DEFAULT_SERVICE_QUALITY.items():
                    self.service_quality.setdefault(k, v)
                print(f"[SMART] Loaded {len(rows)} quality standards", flush=True)
        except Exception as e:
            self.service_quality = dict(DEFAULT_SERVICE_QUALITY)
            print(f"[SMART] Could not fetch quality standards (using defaults): {e}", flush=True)

    def _fetch_optimization_settings(self):
        """Fetch optimization weights from labor_optimization_settings"""
        print(f"[SMART] Fetching optimization settings...", flush=True)
        try:
            rows = db.select(
                'labor_optimization_settings',
                'setting_name,setting_value',
                venue_id=f'eq.{self.venue_id}',
                is_active='eq.true',
            )
            for r in rows:
                name = r.get('setting_name', '')
                val = r.get('setting_value')
                if val is not None:
                    try:
                        self.optimization_settings[name] = float(val)
                    except (ValueError, TypeError):
                        self.optimization_settings[name] = val

            if not self.optimization_settings:
                self.optimization_settings = dict(DEFAULT_OPTIMIZATION)
                print(f"[SMART] Using default optimization settings", flush=True)
            else:
                for k, v in DEFAULT_OPTIMIZATION.items():
                    self.optimization_settings.setdefault(k, v)
                print(f"[SMART] Loaded {len(rows)} optimization settings", flush=True)
        except Exception as e:
            self.optimization_settings = dict(DEFAULT_OPTIMIZATION)
            print(f"[SMART] Could not fetch optimization settings (using defaults): {e}", flush=True)

    def _fetch_manager_feedback(self):
        """Analyze manager overrides to learn staffing adjustments"""
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

            # Count override directions per (position, shift_type, day_of_week)
            from collections import defaultdict
            override_counts = defaultdict(lambda: {'added': 0, 'removed': 0, 'total': 0})

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

                # Determine position and shift from original/decision
                pos_name = original.get('position_name', '')
                shift_type = decision.get('shift_type', original.get('shift_type', 'dinner'))
                action = decision.get('action', '')

                if not pos_name and not action:
                    continue

                key = (pos_name, shift_type, dow)
                override_counts[key]['total'] += 1

                if action == 'added_shift':
                    override_counts[key]['added'] += 1
                elif action == 'shift_removed':
                    override_counts[key]['removed'] += 1

            # Only apply adjustments with 3+ overrides in same direction
            for key, counts in override_counts.items():
                if counts['added'] >= 3 and counts['added'] > counts['removed']:
                    self.manager_adjustments[key] = +1
                elif counts['removed'] >= 3 and counts['removed'] > counts['added']:
                    self.manager_adjustments[key] = -1

            print(f"[SMART] Learned {len(self.manager_adjustments)} adjustments from {len(rows)} overrides", flush=True)
        except Exception as e:
            print(f"[SMART] Could not analyze manager feedback: {e}", flush=True)

    def _fetch_staffing_patterns(self):
        """Fetch ML-learned staffing patterns for validation"""
        print(f"[SMART] Fetching staffing patterns...", flush=True)
        try:
            self.staffing_patterns = db.select(
                'staffing_patterns',
                'position_id,shift_type,covers_range_start,covers_range_end,employees_recommended',
                venue_id=f'eq.{self.venue_id}',
                is_active='eq.true',
            )
            print(f"[SMART] Loaded {len(self.staffing_patterns)} staffing patterns", flush=True)
        except Exception as e:
            print(f"[SMART] Could not fetch staffing patterns: {e}", flush=True)

    # ── Smart Requirements ──────────────────────────────────────────

    def _get_cplh_for_position(self, position_id: str, position_name: str, shift_type: str) -> float:
        """Get CPLH target for a position: DB targets -> industry benchmark -> default"""
        # 1. Check DB targets
        cplh = self.cplh_targets.get((position_id, shift_type))
        if cplh and cplh > 0:
            return cplh

        # 2. Check industry benchmarks by position name
        for bench_name, shifts in INDUSTRY_BENCHMARKS.items():
            if bench_name.lower() in position_name.lower():
                shift_data = shifts.get(shift_type, shifts.get('dinner', {}))
                return shift_data.get('target', 8.0)

        # 3. Check default position CPLH
        for default_name, default_cplh in DEFAULT_POSITION_CPLH.items():
            if default_name.lower() in position_name.lower():
                return default_cplh

        # 4. Generic fallback
        return 10.0

    def _calculate_smart_requirements(self, week_start_date: str) -> List[Dict]:
        """Calculate staffing requirements from demand forecasts using CPLH targets"""
        print(f"\n[SMART] Calculating demand-driven requirements...", flush=True)

        ws = datetime.fromisoformat(week_start_date).date()
        requirements = []

        for day_offset in range(7):
            date = ws + timedelta(days=day_offset)
            date_str = date.isoformat()
            day_forecasts = self.demand_forecasts.get(date_str, {})

            if not day_forecasts:
                continue

            for shift_type, forecast in day_forecasts.items():
                covers = forecast['covers']
                if covers < 1:
                    continue

                shift_hours = SHIFT_TIMES.get(shift_type, SHIFT_TIMES['dinner'])['hours']

                for pos_id, pos in self.positions.items():
                    pos_name = pos['name']

                    # Fixed staff positions: always 1
                    if any(fixed.lower() in pos_name.lower() for fixed in FIXED_STAFF_POSITIONS):
                        needed = 1
                    # Covers-ratio positions: simple division
                    elif any(ratio_name.lower() in pos_name.lower() for ratio_name in COVERS_RATIO_POSITIONS):
                        ratio = next(
                            (r for n, r in COVERS_RATIO_POSITIONS.items() if n.lower() in pos_name.lower()),
                            60
                        )
                        needed = max(1, math.ceil(covers / ratio))
                    else:
                        # CPLH-driven calculation
                        target_cplh = self._get_cplh_for_position(pos_id, pos_name, shift_type)
                        if target_cplh <= 0:
                            needed = 1
                        else:
                            needed = max(1, math.ceil(covers / (target_cplh * shift_hours)))

                    requirements.append({
                        'id': str(_uuid.uuid4()),
                        'venue_id': self.venue_id,
                        'business_date': date_str,
                        'shift_type': shift_type,
                        'position_id': pos_id,
                        'position': pos,
                        'employees_needed': needed,
                        'hours_per_employee': float(shift_hours),
                        'total_hours': needed * float(shift_hours),
                        'total_cost': needed * float(shift_hours) * float(pos['base_hourly_rate']),
                        'predicted_covers': covers,
                        'predicted_revenue': forecast.get('revenue', 0),
                    })

                    print(f"  {date_str} {shift_type}: {pos_name} = {needed} employees "
                          f"({covers:.0f} covers)", flush=True)

        print(f"[SMART] Generated {len(requirements)} smart requirements", flush=True)
        return requirements

    def _apply_service_quality_constraints(self, requirements: List[Dict]) -> List[Dict]:
        """Enforce service quality ratios (max covers/server, busser/runner ratios)"""
        print(f"\n[QUALITY] Applying service quality constraints...", flush=True)

        max_cps = self.service_quality.get('max_covers_per_server', 12)
        busser_ratio = self.service_quality.get('busser_to_server_ratio', 0.5)
        runner_ratio = self.service_quality.get('runner_to_server_ratio', 0.33)

        # Group by (date, shift_type) to check ratios
        from collections import defaultdict
        groups = defaultdict(list)
        for req in requirements:
            groups[(req['business_date'], req['shift_type'])].append(req)

        adjustments = 0
        for (date, shift), reqs in groups.items():
            covers = max((r.get('predicted_covers', 0) for r in reqs), default=0)
            if covers < 1:
                continue

            # Find server, busser, runner requirements
            server_req = None
            busser_req = None
            runner_req = None
            for req in reqs:
                name = req['position']['name'].lower()
                if 'server' in name and 'food' not in name:
                    server_req = req
                elif 'busser' in name or 'bus' in name:
                    busser_req = req
                elif 'runner' in name or 'food runner' in name:
                    runner_req = req

            # Enforce max covers per server
            if server_req:
                min_servers = math.ceil(covers / max_cps)
                if server_req['employees_needed'] < min_servers:
                    old = server_req['employees_needed']
                    server_req['employees_needed'] = min_servers
                    server_req['total_hours'] = min_servers * server_req['hours_per_employee']
                    server_req['total_cost'] = server_req['total_hours'] * float(server_req['position']['base_hourly_rate'])
                    print(f"  [QUALITY] {date} {shift}: Servers {old} -> {min_servers} "
                          f"(max {max_cps} covers/server, {covers:.0f} covers)", flush=True)
                    adjustments += 1

                # Enforce busser ratio
                if busser_req:
                    min_bussers = math.ceil(server_req['employees_needed'] * busser_ratio)
                    if busser_req['employees_needed'] < min_bussers:
                        old = busser_req['employees_needed']
                        busser_req['employees_needed'] = min_bussers
                        busser_req['total_hours'] = min_bussers * busser_req['hours_per_employee']
                        busser_req['total_cost'] = busser_req['total_hours'] * float(busser_req['position']['base_hourly_rate'])
                        print(f"  [QUALITY] {date} {shift}: Bussers {old} -> {min_bussers} "
                              f"(ratio {busser_ratio} of {server_req['employees_needed']} servers)", flush=True)
                        adjustments += 1

                # Enforce runner ratio
                if runner_req:
                    min_runners = math.ceil(server_req['employees_needed'] * runner_ratio)
                    if runner_req['employees_needed'] < min_runners:
                        old = runner_req['employees_needed']
                        runner_req['employees_needed'] = min_runners
                        runner_req['total_hours'] = min_runners * runner_req['hours_per_employee']
                        runner_req['total_cost'] = runner_req['total_hours'] * float(runner_req['position']['base_hourly_rate'])
                        print(f"  [QUALITY] {date} {shift}: Runners {old} -> {min_runners} "
                              f"(ratio {runner_ratio} of {server_req['employees_needed']} servers)", flush=True)
                        adjustments += 1

        print(f"[QUALITY] Made {adjustments} quality adjustments", flush=True)
        return requirements

    def _apply_manager_feedback_adjustments(self, requirements: List[Dict]) -> List[Dict]:
        """Apply learned adjustments from manager override patterns"""
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
                direction = '+1' if delta > 0 else '-1'
                print(f"  [FEEDBACK] {req['business_date']} {shift_type}: {pos_name} "
                      f"{old} -> {req['employees_needed']} ({direction} from override learning)", flush=True)
                adjustments += 1

        print(f"[FEEDBACK] Applied {adjustments} feedback adjustments", flush=True)
        return requirements

    def _validate_against_staffing_patterns(self, requirements: List[Dict]):
        """Warning-only validation against ML-learned historical patterns"""
        if not self.staffing_patterns:
            return

        print(f"\n[VALIDATE] Checking against historical staffing patterns...", flush=True)
        warnings = 0

        for req in requirements:
            covers = req.get('predicted_covers', 0)
            pos_id = req['position_id']
            shift_type = req['shift_type']

            for pattern in self.staffing_patterns:
                if (pattern['position_id'] == pos_id and
                    pattern.get('shift_type') == shift_type and
                    float(pattern.get('covers_range_start', 0)) <= covers <=
                    float(pattern.get('covers_range_end', 9999))):

                    historical = float(pattern.get('employees_recommended', 0))
                    calculated = req['employees_needed']
                    if historical > 0 and abs(calculated - historical) / historical > 0.3:
                        print(f"  [WARN] {req['business_date']} {shift_type}: "
                              f"{req['position']['name']} calculated={calculated} vs "
                              f"historical={historical:.0f} ({covers:.0f} covers)", flush=True)
                        warnings += 1
                    break

        if warnings:
            print(f"[VALIDATE] {warnings} warnings (review recommended)", flush=True)
        else:
            print(f"[VALIDATE] All requirements consistent with historical patterns", flush=True)

    # ── Enhanced Assignment ─────────────────────────────────────────

    def _score_employee(self, emp: Dict, weekly_hours: float) -> float:
        """Multi-objective employee scoring: lower is better"""
        rate = float(emp['position']['base_hourly_rate'])
        max_hours = float(emp.get('max_hours_per_week') or 40)
        hours_pct = weekly_hours / max_hours if max_hours > 0 else 1.0

        w = self.optimization_settings
        cost_w = float(w.get('cost_weight', 0.4))
        quality_w = float(w.get('quality_weight', 0.4))

        # Cost score: normalized hourly rate (lower is cheaper)
        cost_score = rate / 35.0

        # Balance score: how utilized the employee already is (lower = more available)
        balance_score = hours_pct

        return cost_w * cost_score + quality_w * balance_score

    # ── Schedule Metrics ────────────────────────────────────────────

    def _compute_schedule_metrics(self, assignments: List[Dict], requirements: List[Dict]) -> Dict:
        """Compute quality metrics for the generated schedule"""
        total_hours = sum(a['scheduled_hours'] for a in assignments)
        total_cost = sum(a['labor_cost'] for a in assignments)

        # Total predicted covers and revenue
        total_covers = 0.0
        total_revenue = 0.0
        seen_day_shifts = set()
        for req in requirements:
            key = (req['business_date'], req['shift_type'])
            if key not in seen_day_shifts:
                seen_day_shifts.add(key)
                total_covers += req.get('predicted_covers', 0)
                total_revenue += req.get('predicted_revenue', 0)

        # Overall CPLH
        overall_cplh = total_covers / total_hours if total_hours > 0 else 0

        # Labor percentage
        labor_pct = (total_cost / total_revenue * 100) if total_revenue > 0 else 0

        # Service quality score (check violations)
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

    # ── Default Requirements (unchanged fallback) ───────────────────

    def _generate_default_requirements(self, week_start_date: str) -> List[Dict]:
        """Generate default requirements from positions & employees when no data exists"""
        week_start = datetime.fromisoformat(week_start_date).date()

        # Group employees by position
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
                needed = min(len(emps), 2) if len(emps) >= 2 else 1
                requirements.append({
                    'id': str(_uuid.uuid4()),
                    'venue_id': self.venue_id,
                    'business_date': date,
                    'shift_type': 'dinner',
                    'position_id': pos_id,
                    'position': pos,
                    'employees_needed': needed,
                    'hours_per_employee': 6.0,
                    'total_hours': needed * 6.0,
                    'total_cost': needed * 6.0 * float(pos['base_hourly_rate']),
                })

        print(f"[FALLBACK] Generated {len(requirements)} default requirements for {len(emps_by_pos)} positions x 7 days", flush=True)
        return requirements

    # ── Main Scheduling Flow ────────────────────────────────────────

    def generate_schedule(self, week_start_date: str) -> Dict:
        """
        Smart scheduling flow:
        1. Load base data (employees, positions, existing requirements)
        2. Fetch demand forecasts, CPLH targets, quality standards, optimization settings, feedback
        3. If no requirements in DB: generate smart requirements from forecasts (or fallback)
        4. Greedy-assign with multi-objective scoring
        5. Compute schedule metrics
        """
        week_start = datetime.fromisoformat(week_start_date).date()
        week_end = week_start + timedelta(days=6)

        print(f"\n{'='*60}", flush=True)
        print(f"[SCHEDULE] Smart schedule generation for {week_start} to {week_end}", flush=True)
        print(f"{'='*60}\n", flush=True)

        # Step 1: Load base data
        self.load_data(week_start_date)

        # Step 2: Fetch smart scheduling data (tolerant of missing tables)
        self._fetch_demand_forecasts(week_start.isoformat(), week_end.isoformat())
        self._fetch_cplh_targets()
        self._fetch_service_quality_standards()
        self._fetch_optimization_settings()
        self._fetch_manager_feedback()
        self._fetch_staffing_patterns()

        # Step 3: Build requirements
        if not self.requirements:
            if self.demand_forecasts:
                self.optimization_mode = 'smart'
                print(f"\n[SMART] Using demand-driven requirements...", flush=True)
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
                    print("MISSING_EMPLOYEES: No active employees found for this venue. Add employees first.")
                elif not self.positions:
                    print("MISSING_POSITIONS: No active positions found for this venue. Add positions first.")
                else:
                    print("MISSING_DATA: Could not generate schedule -- check employees and positions.")
                return None

        # Step 4: Greedy assignment with enhanced scoring
        print(f"\n[ASSIGN] Running greedy assignment ({self.optimization_mode} mode)...", flush=True)

        # Track employee weekly hours and daily shifts
        emp_weekly_hours: Dict[str, float] = {e['id']: 0.0 for e in self.employees}
        emp_daily_shifts: Dict[str, Dict[str, int]] = {e['id']: {} for e in self.employees}

        # Index employees by position for fast lookup
        emps_by_position: Dict[str, List[Dict]] = {}
        for emp in self.employees:
            pid = emp['primary_position_id']
            emps_by_position.setdefault(pid, []).append(emp)

        # Sort requirements: scarce positions first (fewer eligible employees = higher priority)
        def req_priority(req):
            eligible_count = len(emps_by_position.get(req['position_id'], []))
            return (req['business_date'], eligible_count)

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

            eligible = emps_by_position.get(position_id, [])
            if not eligible:
                unfilled += employees_needed
                continue

            # Sort by multi-objective score (lower = better)
            eligible_sorted = sorted(eligible, key=lambda e: self._score_employee(
                e, emp_weekly_hours.get(e['id'], 0)
            ))

            assigned_count = 0
            for emp in eligible_sorted:
                if assigned_count >= employees_needed:
                    break

                emp_id = emp['id']
                raw_max = emp.get('max_hours_per_week')
                max_hours = float(raw_max) if raw_max is not None else 40.0

                # Check weekly hours cap
                if emp_weekly_hours[emp_id] + shift_hours > max_hours:
                    continue

                # Check daily shift limit (max 1 per day)
                daily = emp_daily_shifts[emp_id].get(date, 0)
                if daily >= 1:
                    continue

                # Assign this employee
                hourly_rate = float(emp['position']['base_hourly_rate'])
                shift_cost = shift_hours * hourly_rate

                emp_weekly_hours[emp_id] += shift_hours
                emp_daily_shifts[emp_id][date] = daily + 1

                total_cost += shift_cost
                total_hours += shift_hours

                shift_start, shift_end = self._get_shift_times(date, req['shift_type'])

                schedule_assignments.append({
                    'employee_id': emp_id,
                    'employee_name': f"{emp['first_name']} {emp['last_name']}",
                    'position_id': position_id,
                    'position_name': req['position']['name'],
                    'business_date': date,
                    'shift_type': req['shift_type'],
                    'scheduled_start': shift_start.isoformat(),
                    'scheduled_end': shift_end.isoformat(),
                    'scheduled_hours': shift_hours,
                    'hourly_rate': hourly_rate,
                    'labor_cost': shift_cost,
                })
                assigned_count += 1

            unfilled += (employees_needed - assigned_count)

        if not schedule_assignments:
            print("Could not find optimal schedule -- no assignments made.")
            print("   Check that employees exist and positions match.")
            return None

        # Step 5: Compute metrics
        metrics = self._compute_schedule_metrics(schedule_assignments, self.requirements)

        print(f"\n[OK] Schedule generated successfully! ({self.optimization_mode} mode)", flush=True)
        print(f"   {len(schedule_assignments)} shifts assigned", flush=True)
        print(f"   {total_hours:.1f} total hours", flush=True)
        print(f"   ${total_cost:.2f} total labor cost", flush=True)
        if unfilled > 0:
            print(f"   {unfilled} slots could not be filled (not enough staff)", flush=True)

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
        """Calculate shift start and end times"""
        date = datetime.fromisoformat(business_date)
        shift_config = SHIFT_TIMES.get(shift_type, SHIFT_TIMES['dinner'])

        start = datetime.combine(date, shift_config['start'])
        end = datetime.combine(date, shift_config['end'])

        if shift_config['end'] < shift_config['start']:
            end += timedelta(days=1)

        return start, end

    def save_schedule(self, schedule_data: Dict) -> str:
        """Save generated schedule to database with metrics"""
        if not schedule_data:
            return None

        week_start = datetime.fromisoformat(schedule_data['week_start_date']).date()
        week_end = week_start + timedelta(days=6)

        # Delete existing schedule for this venue/week (allows regeneration)
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

        # Add metrics if available (these columns may not exist in older schemas)
        if metrics:
            schedule_record['overall_cplh'] = metrics.get('overall_cplh')
            schedule_record['service_quality_score'] = metrics.get('service_quality_score')
            schedule_record['projected_revenue'] = metrics.get('total_projected_revenue')

        try:
            result = db.insert('weekly_schedules', schedule_record)
        except httpx.HTTPStatusError:
            # If extra columns fail, retry without them
            for key in ['overall_cplh', 'service_quality_score', 'projected_revenue',
                         'auto_generated', 'requires_approval', 'optimization_mode']:
                schedule_record.pop(key, None)
            result = db.insert('weekly_schedules', schedule_record)

        schedule_id = result[0]['id']
        print(f"\n[SAVE] Saving schedule {schedule_id}...", flush=True)

        shift_records = []
        for assignment in schedule_data['assignments']:
            record = {
                'schedule_id': schedule_id,
                'venue_id': self.venue_id,
                'employee_id': assignment['employee_id'],
                'position_id': assignment['position_id'],
                'business_date': assignment['business_date'],
                'shift_type': assignment['shift_type'],
                'scheduled_start': assignment['scheduled_start'],
                'scheduled_end': assignment['scheduled_end'],
                'scheduled_hours': assignment['scheduled_hours'],
                'hourly_rate': assignment.get('hourly_rate', 0),
                'scheduled_cost': assignment.get('labor_cost', 0),
                'status': 'scheduled',
            }
            shift_records.append(record)

        try:
            db.insert('shift_assignments', shift_records)
        except httpx.HTTPStatusError:
            # If hourly_rate/scheduled_cost columns don't exist, retry without
            for rec in shift_records:
                rec.pop('hourly_rate', None)
                rec.pop('scheduled_cost', None)
            db.insert('shift_assignments', shift_records)

        print(f"[OK] Schedule saved with {len(shift_records)} shifts", flush=True)

        return schedule_id


def main():
    """CLI entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Generate optimal weekly schedule')
    parser.add_argument('--venue-id', required=True, help='Venue ID')
    parser.add_argument('--week-start', required=True, help='Week start date (YYYY-MM-DD)')
    parser.add_argument('--save', action='store_true', help='Save schedule to database')

    args = parser.parse_args()

    scheduler = AutoScheduler(args.venue_id)
    schedule = scheduler.generate_schedule(args.week_start)

    if schedule and args.save:
        schedule_id = scheduler.save_schedule(schedule)
        print(f"\nSchedule {schedule_id} ready for review!")
    elif schedule:
        # Output schedule as JSON so the API can parse it
        print("---JSON_START---")
        print(json.dumps(schedule, default=str))
        print("---JSON_END---")


if __name__ == '__main__':
    main()
