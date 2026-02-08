"""
Backtest Runner — validates forecast accuracy against historical actuals.
"""

import math
import json
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional

from ..db import get_db
from ..core.metrics import staffing_delta, compute_wasted_labor, overall_backtest_metrics
from ..core.staffing import compute_servers_needed
from .. import config


class BacktestRunner:
    """Backtests staffing profiles against historical hourly_snapshots."""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.db = get_db()
        self._config = None

    def _load_config(self) -> Dict:
        if self._config:
            return self._config
        configs = self.db.select(
            "location_config", "*",
            venue_id=f"eq.{self.venue_id}",
            is_active="eq.true",
        )
        self._config = configs[0] if configs else {
            "covers_per_server_target": config.DEFAULT_COVERS_PER_SERVER,
            "avg_hourly_rate": config.DEFAULT_AVG_HOURLY_RATE,
        }
        return self._config

    def _get_profiles(self, day_of_week: int, version: int = None) -> List[Dict]:
        """Get profiles for a DOW, optionally at a specific version."""
        filters = {
            "venue_id": f"eq.{self.venue_id}",
            "day_of_week": f"eq.{day_of_week}",
            "order": "hour_slot.asc",
        }
        if version:
            filters["profile_version"] = f"eq.{version}"
        else:
            # Get latest
            existing = self.db.select(
                "staffing_profiles",
                "profile_version",
                venue_id=f"eq.{self.venue_id}",
                order="profile_version.desc",
                limit="1",
            )
            if not existing:
                return []
            filters["profile_version"] = f"eq.{existing[0]['profile_version']}"

        return self.db.select("staffing_profiles", "*", **filters)

    def backtest_date(
        self,
        business_date: str,
        scenario: str = "buffered",
        profile_version: int = None,
    ) -> Optional[Dict]:
        """
        Backtest a single date: compare what profiles would have recommended
        vs what actually happened (from hourly_snapshots).

        Returns:
            Backtest result dict, or None if no data
        """
        cfg = self._load_config()
        cps = float(cfg.get("covers_per_server_target", config.DEFAULT_COVERS_PER_SERVER))
        avg_rate = float(cfg.get("avg_hourly_rate", config.DEFAULT_AVG_HOURLY_RATE))

        bd = datetime.strptime(business_date, "%Y-%m-%d").date()
        dow = bd.weekday()

        # Get profiles for this DOW
        profiles = self._get_profiles(dow, profile_version)
        if not profiles:
            return None

        # Get actual snapshots
        actuals = self.db.select(
            "hourly_snapshots",
            "hour_slot,active_covers",
            venue_id=f"eq.{self.venue_id}",
            business_date=f"eq.{business_date}",
            order="hour_slot.asc",
        )
        if not actuals:
            return None

        actual_map = {a["hour_slot"]: a["active_covers"] for a in actuals}

        # Compare hour by hour
        hourly_results = []
        for profile in profiles:
            hour = profile["hour_slot"]
            actual_covers = actual_map.get(hour, 0)

            # What the profile would have recommended
            if scenario == "lean":
                rec_servers = profile.get("servers_lean", 0)
            elif scenario == "buffered":
                rec_servers = profile.get("servers_buffered", 0)
            else:
                rec_servers = profile.get("servers_safe", 0)

            # What was actually needed
            delta_info = staffing_delta(actual_covers, rec_servers, cps)

            hourly_results.append({
                "hour": hour,
                "actual_covers": actual_covers,
                "recommended_servers": rec_servers,
                **delta_info,
            })

        # Aggregate
        metrics = overall_backtest_metrics(hourly_results)
        waste = compute_wasted_labor(hourly_results, avg_rate)

        result = {
            "venue_id": self.venue_id,
            "business_date": business_date,
            "scenario": scenario,
            "hours_analyzed": metrics["hours_analyzed"],
            "hours_adequate": metrics["hours_adequate"],
            "hours_understaffed": metrics["hours_understaffed"],
            "hours_overstaffed": metrics["hours_overstaffed"],
            "coverage_pct": metrics["coverage_pct"],
            "accuracy_pct": metrics["avg_accuracy_pct"],
            "wasted_labor_hours": waste["wasted_labor_hours"],
            "wasted_labor_cost": waste["wasted_labor_cost"],
            "understaffed_labor_hours": waste["understaffed_labor_hours"],
            "hourly_detail": json.dumps(hourly_results),
            "profile_version": profiles[0].get("profile_version"),
            "backtest_type": "standard",
        }

        # Upsert
        self.db.upsert(
            "backtest_results",
            [result],
            on_conflict="venue_id,business_date,scenario,backtest_type",
        )

        return result

    def backtest_range(
        self,
        start_date: str,
        end_date: str,
        scenario: str = "buffered",
    ) -> List[Dict]:
        """Backtest a date range and return aggregate results."""
        current = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()

        results = []
        while current <= end:
            result = self.backtest_date(current.isoformat(), scenario)
            if result:
                results.append(result)
            current += timedelta(days=1)

        if results:
            # Print summary
            total_hours = sum(r["hours_analyzed"] for r in results)
            adequate = sum(r["hours_adequate"] for r in results)
            understaffed = sum(r["hours_understaffed"] for r in results)
            wasted_cost = sum(r["wasted_labor_cost"] for r in results)
            avg_coverage = adequate / total_hours * 100 if total_hours else 0

            print(f"\n  [backtest] {len(results)} days, {total_hours} hours analyzed")
            print(f"  Coverage: {avg_coverage:.1f}% adequate | {understaffed} hours understaffed")
            print(f"  Wasted labor cost: ${wasted_cost:,.0f}")

        return results

    def rolling_backtest(
        self,
        start_date: str,
        end_date: str,
        train_weeks: int = 4,
        scenario: str = "buffered",
    ) -> List[Dict]:
        """
        Walk-forward backtest: for each test week, build profiles on
        the preceding N training weeks, then test.

        This is more realistic than backtesting with future data.
        """
        from .profile_builder import ProfileBuilder

        current = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()

        results = []

        while current <= end:
            # Train on preceding weeks
            train_end = current - timedelta(days=1)
            train_start = train_end - timedelta(weeks=train_weeks)

            # Build temporary profiles (we'll use the latest version)
            builder = ProfileBuilder(self.venue_id)
            builder.build_profiles(lookback_weeks=train_weeks)

            # Test this date
            result = self.backtest_date(current.isoformat(), scenario)
            if result:
                result["backtest_type"] = "rolling"
                results.append(result)

            current += timedelta(days=1)

        return results
