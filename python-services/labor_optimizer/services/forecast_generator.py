"""
Forecast Generator — generates daily_staffing_forecasts from profiles + seasonal factors.
"""

import math
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional
import json

from ..db import get_db
from ..core.seasonal import get_seasonal_factor
from ..core.staffing import compute_servers_needed, compute_bartenders_needed, compute_daily_total_cost
from .. import config


class ForecastGenerator:
    """Generates staffing forecasts from profiles with seasonal adjustments."""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.db = get_db()
        self._config = None

    def _load_config(self) -> Dict:
        if self._config:
            return self._config
        configs = self.db.select(
            "location_config",
            "*",
            venue_id=f"eq.{self.venue_id}",
            is_active="eq.true",
        )
        if configs:
            self._config = configs[0]
        else:
            self._config = {
                "covers_per_server_target": config.DEFAULT_COVERS_PER_SERVER,
                "covers_per_bartender_target": config.DEFAULT_COVERS_PER_BARTENDER,
                "buffer_pct": config.DEFAULT_BUFFER_PCT,
                "peak_buffer_pct": config.DEFAULT_PEAK_BUFFER_PCT,
                "peak_days": [4, 5],
                "min_servers": 2,
                "min_bartenders": 1,
                "avg_revenue_per_cover": 150.0,
                "avg_hourly_rate": config.DEFAULT_AVG_HOURLY_RATE,
                "closed_weekdays": [0],
            }
        return self._config

    def _get_latest_profiles(self, day_of_week: int) -> List[Dict]:
        """Get latest profiles for a specific DOW."""
        existing = self.db.select(
            "staffing_profiles",
            "profile_version",
            venue_id=f"eq.{self.venue_id}",
            order="profile_version.desc",
            limit="1",
        )
        if not existing:
            return []

        latest_version = existing[0]["profile_version"]
        return self.db.select(
            "staffing_profiles",
            "*",
            venue_id=f"eq.{self.venue_id}",
            profile_version=f"eq.{latest_version}",
            day_of_week=f"eq.{day_of_week}",
            order="hour_slot.asc",
        )

    def generate_forecast(
        self,
        target_date: str,
        scenarios: List[str] = None,
    ) -> List[Dict]:
        """
        Generate staffing forecasts for a single date.

        Args:
            target_date: YYYY-MM-DD
            scenarios: List of scenarios to generate (default: all three)

        Returns:
            List of forecast dicts (one per scenario)
        """
        scenarios = scenarios or ["lean", "buffered", "safe"]
        cfg = self._load_config()

        td = datetime.strptime(target_date, "%Y-%m-%d").date()
        dow = td.weekday()  # 0=Monday

        # Check if closed
        closed_days = cfg.get("closed_weekdays", [0])
        if dow in closed_days:
            print(f"  [forecast] {target_date} ({td.strftime('%A')}) is a closed day, skipping")
            return []

        # Load profiles for this DOW
        profiles = self._get_latest_profiles(dow)
        if not profiles:
            print(f"  [forecast] No profiles for DOW {dow} ({td.strftime('%A')}), skipping {target_date}")
            return []

        # Get seasonal factor
        seasonal = get_seasonal_factor(self.venue_id, td)
        multiplier = seasonal["multiplier"]
        hourly_multipliers = seasonal.get("hourly_multipliers") or {}

        cps = float(cfg.get("covers_per_server_target", config.DEFAULT_COVERS_PER_SERVER))
        cpb = float(cfg.get("covers_per_bartender_target", config.DEFAULT_COVERS_PER_BARTENDER))
        base_buffer = float(cfg.get("buffer_pct", config.DEFAULT_BUFFER_PCT))
        peak_buffer = float(cfg.get("peak_buffer_pct", config.DEFAULT_PEAK_BUFFER_PCT))
        peak_days = cfg.get("peak_days", [4, 5])
        min_servers = int(cfg.get("min_servers", 2))
        min_bartenders = int(cfg.get("min_bartenders", 1))
        avg_rpc = float(cfg.get("avg_revenue_per_cover", 150.0))
        avg_rate = float(cfg.get("avg_hourly_rate", config.DEFAULT_AVG_HOURLY_RATE))

        buffer_pct = peak_buffer if dow in peak_days else base_buffer

        profile_version = profiles[0].get("profile_version")

        forecasts = []
        for scenario in scenarios:
            hourly_detail = []
            total_servers = 0
            total_bartenders = 0
            total_covers = 0

            for profile in profiles:
                hour = profile["hour_slot"]

                # Pick the right percentile for the scenario
                if scenario == "lean":
                    base_covers = float(profile.get("p50_active_covers", 0))
                    scenario_buffer = 0.0
                elif scenario == "buffered":
                    base_covers = float(profile.get("p75_active_covers", 0))
                    scenario_buffer = buffer_pct
                else:  # safe
                    base_covers = float(profile.get("p90_active_covers", 0))
                    scenario_buffer = 0.0

                # Apply seasonal multiplier
                hour_mult = float(hourly_multipliers.get(str(hour), multiplier))
                adjusted_covers = base_covers * hour_mult

                servers = compute_servers_needed(adjusted_covers, cps, scenario_buffer, min_servers)
                bartenders = compute_bartenders_needed(adjusted_covers, cpb, scenario_buffer, min_bartenders)

                hourly_detail.append({
                    "hour": hour,
                    "active_covers": round(adjusted_covers, 1),
                    "servers": servers,
                    "bartenders": bartenders,
                    "seasonal_factor": round(hour_mult, 2),
                })

                total_servers = max(total_servers, servers)
                total_bartenders = max(total_bartenders, bartenders)
                total_covers += round(adjusted_covers)

            total_labor_hours = sum(
                h["servers"] + h["bartenders"] for h in hourly_detail
            )
            estimated_cost = total_labor_hours * avg_rate
            estimated_revenue = total_covers * avg_rpc

            forecasts.append({
                "venue_id": self.venue_id,
                "forecast_date": target_date,
                "day_of_week": dow,
                "scenario": scenario,
                "total_servers": total_servers,
                "total_bartenders": total_bartenders,
                "total_labor_hours": round(total_labor_hours, 2),
                "estimated_labor_cost": round(estimated_cost, 2),
                "estimated_covers": total_covers,
                "estimated_revenue": round(estimated_revenue, 2),
                "hourly_detail": json.dumps(hourly_detail),
                "seasonal_factor": round(multiplier, 2),
                "seasonal_note": seasonal.get("event_name"),
                "profile_version": profile_version,
            })

        # Upsert forecasts
        if forecasts:
            self.db.upsert(
                "daily_staffing_forecasts",
                forecasts,
                on_conflict="venue_id,forecast_date,scenario",
            )
            peak_covers = max(
                (h["active_covers"] for h in json.loads(forecasts[1]["hourly_detail"])),
                default=0,
            ) if len(forecasts) > 1 else 0
            seasonal_str = f" [{seasonal['event_name']} x{multiplier}]" if seasonal["event_name"] else ""
            print(f"  [forecast] {target_date} ({td.strftime('%a')}): peak {peak_covers:.0f} active covers, {len(scenarios)} scenarios{seasonal_str}")

        return forecasts

    def generate_week(
        self,
        week_start: str,
        scenarios: List[str] = None,
    ) -> List[Dict]:
        """Generate forecasts for an entire week starting from week_start (Monday)."""
        start = datetime.strptime(week_start, "%Y-%m-%d").date()
        all_forecasts = []
        for i in range(7):
            d = start + timedelta(days=i)
            forecasts = self.generate_forecast(d.isoformat(), scenarios)
            all_forecasts.extend(forecasts)
        return all_forecasts

    def generate_range(
        self,
        start_date: str,
        end_date: str,
        scenarios: List[str] = None,
    ) -> List[Dict]:
        """Generate forecasts for a date range (inclusive)."""
        current = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
        all_forecasts = []
        while current <= end:
            forecasts = self.generate_forecast(current.isoformat(), scenarios)
            all_forecasts.extend(forecasts)
            current += timedelta(days=1)
        return all_forecasts
