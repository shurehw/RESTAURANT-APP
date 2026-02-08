"""
Alert Monitor — post-close anomaly detection.
Compares actual snapshots vs profiles, generates staffing alerts.
"""

import json
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional

from ..db import get_db
from .. import config


class AlertMonitor:
    """Generates staffing alerts by comparing actuals to profiles."""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.db = get_db()

    def _get_latest_profiles(self, day_of_week: int) -> List[Dict]:
        existing = self.db.select(
            "staffing_profiles",
            "profile_version",
            venue_id=f"eq.{self.venue_id}",
            order="profile_version.desc",
            limit="1",
        )
        if not existing:
            return []
        return self.db.select(
            "staffing_profiles", "*",
            venue_id=f"eq.{self.venue_id}",
            profile_version=f"eq.{existing[0]['profile_version']}",
            day_of_week=f"eq.{day_of_week}",
            order="hour_slot.asc",
        )

    def check_date(self, business_date: str) -> List[Dict]:
        """
        Run post-close analysis for a date.
        Compare actual snapshots against profiles and generate alerts.
        """
        bd = datetime.strptime(business_date, "%Y-%m-%d").date()
        dow = bd.weekday()

        profiles = self._get_latest_profiles(dow)
        if not profiles:
            # No profiles — alert on no data
            alert = {
                "venue_id": self.venue_id,
                "alert_date": business_date,
                "hour_slot": None,
                "alert_type": "no_data",
                "severity": "info",
                "message": f"No staffing profiles available for {bd.strftime('%A')}s",
            }
            self.db.upsert("staffing_alerts", [alert], on_conflict="venue_id,alert_date,hour_slot,alert_type")
            return [alert]

        # Get actual snapshots
        actuals = self.db.select(
            "hourly_snapshots",
            "hour_slot,active_covers,servers_recommended",
            venue_id=f"eq.{self.venue_id}",
            business_date=f"eq.{business_date}",
            order="hour_slot.asc",
        )

        if not actuals:
            alert = {
                "venue_id": self.venue_id,
                "alert_date": business_date,
                "hour_slot": None,
                "alert_type": "no_data",
                "severity": "warning",
                "message": f"No hourly snapshots found for {business_date}. POS import may have failed.",
            }
            self.db.upsert("staffing_alerts", [alert], on_conflict="venue_id,alert_date,hour_slot,alert_type")
            return [alert]

        actual_map = {a["hour_slot"]: a for a in actuals}
        profile_map = {p["hour_slot"]: p for p in profiles}

        alerts = []

        for hour, profile in profile_map.items():
            actual = actual_map.get(hour)
            if not actual:
                continue

            actual_covers = actual["active_covers"]
            p75 = float(profile.get("p75_active_covers", 0))
            p90 = float(profile.get("p90_active_covers", 0))
            rec_servers = profile.get("servers_buffered", 0)

            # Demand spike: actual significantly exceeds P90
            if p90 > 0 and actual_covers > p90 * 1.2:
                severity = "critical" if actual_covers > p90 * 1.5 else "warning"
                alerts.append({
                    "venue_id": self.venue_id,
                    "alert_date": business_date,
                    "hour_slot": hour,
                    "alert_type": "demand_spike",
                    "severity": severity,
                    "message": f"{hour}:00 — {actual_covers} covers exceeded P90 ({p90:.0f}) by {((actual_covers/p90)-1)*100:.0f}%",
                    "actual_covers": actual_covers,
                    "recommended_servers": rec_servers,
                })

            # Demand drop: actual significantly below P50
            p50 = float(profile.get("p50_active_covers", 0))
            if p50 > 10 and actual_covers < p50 * 0.5:
                alerts.append({
                    "venue_id": self.venue_id,
                    "alert_date": business_date,
                    "hour_slot": hour,
                    "alert_type": "demand_drop",
                    "severity": "info",
                    "message": f"{hour}:00 — {actual_covers} covers well below P50 ({p50:.0f}), potential overstaffing",
                    "actual_covers": actual_covers,
                    "recommended_servers": rec_servers,
                })

            # Forecast miss: buffered recommendation was way off
            import math
            needed = math.ceil(actual_covers / float(config.DEFAULT_COVERS_PER_SERVER)) if actual_covers > 0 else 0
            if rec_servers > 0 and needed > 0:
                delta = rec_servers - needed
                if delta < -2:
                    alerts.append({
                        "venue_id": self.venue_id,
                        "alert_date": business_date,
                        "hour_slot": hour,
                        "alert_type": "understaffed",
                        "severity": "critical" if delta < -4 else "warning",
                        "message": f"{hour}:00 — needed {needed} servers, profile recommended {rec_servers} (short by {abs(delta)})",
                        "actual_covers": actual_covers,
                        "recommended_servers": rec_servers,
                        "actual_servers": needed,
                        "delta": delta,
                    })
                elif delta > 3:
                    alerts.append({
                        "venue_id": self.venue_id,
                        "alert_date": business_date,
                        "hour_slot": hour,
                        "alert_type": "overstaffed",
                        "severity": "info",
                        "message": f"{hour}:00 — needed {needed} servers, profile recommended {rec_servers} (excess {delta})",
                        "actual_covers": actual_covers,
                        "recommended_servers": rec_servers,
                        "actual_servers": needed,
                        "delta": delta,
                    })

        # Upsert alerts
        if alerts:
            self.db.upsert(
                "staffing_alerts",
                alerts,
                on_conflict="venue_id,alert_date,hour_slot,alert_type",
            )
            critical = sum(1 for a in alerts if a["severity"] == "critical")
            warning = sum(1 for a in alerts if a["severity"] == "warning")
            print(f"  [alerts] {business_date}: {len(alerts)} alerts ({critical} critical, {warning} warning)")
        else:
            print(f"  [alerts] {business_date}: No anomalies detected")

        return alerts
