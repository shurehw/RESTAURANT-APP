"""
Snapshot Builder — computes hourly_snapshots from pos_checks.
Runs nightly or on-demand after POS import.
"""

from datetime import datetime, date, timedelta
from typing import Dict, List, Optional
import pandas as pd

from ..db import get_db
from ..core.active_covers import compute_hourly_active_covers
from ..core.staffing import compute_servers_needed, compute_bartenders_needed
from .. import config


class SnapshotBuilder:
    """Builds hourly_snapshots from pos_checks for a venue."""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.db = get_db()
        self._config = None

    def _load_config(self) -> Dict:
        """Load venue config from location_config table."""
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
            # Use defaults
            self._config = {
                "open_hour": 15,
                "close_hour": 23,
                "covers_per_server_target": config.DEFAULT_COVERS_PER_SERVER,
                "covers_per_bartender_target": config.DEFAULT_COVERS_PER_BARTENDER,
                "buffer_pct": config.DEFAULT_BUFFER_PCT,
                "min_servers": 2,
                "min_bartenders": 1,
            }
        return self._config

    def build_snapshots(self, business_date: str) -> List[Dict]:
        """
        Build hourly snapshots for a single date.

        1. Load pos_checks for the date
        2. Compute active covers per hour
        3. Compute staffing recommendations
        4. Upsert to hourly_snapshots

        Returns: list of snapshot dicts
        """
        cfg = self._load_config()
        open_hour = int(cfg.get("open_hour", 15))
        close_hour = int(cfg.get("close_hour", 23))
        cps = float(cfg.get("covers_per_server_target", config.DEFAULT_COVERS_PER_SERVER))
        cpb = float(cfg.get("covers_per_bartender_target", config.DEFAULT_COVERS_PER_BARTENDER))
        buffer_pct = float(cfg.get("buffer_pct", config.DEFAULT_BUFFER_PCT))
        min_servers = int(cfg.get("min_servers", 2))
        min_bartenders = int(cfg.get("min_bartenders", 1))

        # Load checks for this date
        checks = self.db.select(
            "pos_checks",
            "open_time,close_time,guest_count",
            venue_id=f"eq.{self.venue_id}",
            business_date=f"eq.{business_date}",
        )

        if not checks:
            print(f"  [snapshot] No checks for {business_date}, skipping")
            return []

        # Convert to DataFrame with proper datetime parsing
        df = pd.DataFrame(checks)
        df["open_time"] = pd.to_datetime(df["open_time"])
        df["close_time"] = pd.to_datetime(df["close_time"])
        df["guest_count"] = pd.to_numeric(df["guest_count"], errors="coerce").fillna(1).astype(int)

        # Compute hourly active covers
        hourly = compute_hourly_active_covers(df, business_date, open_hour, close_hour)

        # Parse date to get ISO day of week (0=Monday)
        bd = datetime.strptime(business_date, "%Y-%m-%d").date()
        dow = bd.weekday()  # 0=Monday

        snapshots = []
        for h in hourly:
            servers_rec = compute_servers_needed(h["active_covers"], cps, buffer_pct, min_servers)
            bartenders_rec = compute_bartenders_needed(h["active_covers"], cpb, buffer_pct, min_bartenders)

            snapshots.append({
                "venue_id": self.venue_id,
                "business_date": business_date,
                "hour_slot": h["hour"],
                "day_of_week": dow,
                "active_covers": h["active_covers"],
                "active_tables": h["active_tables"],
                "new_covers": h["new_covers"],
                "departing_covers": h["departing_covers"],
                "servers_recommended": servers_rec,
                "bartenders_recommended": bartenders_rec,
            })

        # Upsert
        if snapshots:
            self.db.upsert(
                "hourly_snapshots",
                snapshots,
                on_conflict="venue_id,business_date,hour_slot",
            )
            print(f"  [snapshot] Built {len(snapshots)} hourly snapshots for {business_date} (peak: {max(s['active_covers'] for s in snapshots)} active covers)")

        return snapshots

    def backfill_all(self, start_date: str = None, end_date: str = None) -> int:
        """
        Build snapshots for all dates with pos_checks data.

        Args:
            start_date: Optional start date (YYYY-MM-DD)
            end_date: Optional end date (YYYY-MM-DD)
        """
        # Get distinct dates with checks
        filters = {"venue_id": f"eq.{self.venue_id}"}
        if start_date:
            filters["business_date"] = f"gte.{start_date}"
        if end_date:
            if "business_date" in filters:
                # PostgREST doesn't support compound filters on same column easily
                # Fetch all and filter in Python
                pass
            else:
                filters["business_date"] = f"lte.{end_date}"

        checks = self.db.select(
            "pos_checks",
            "business_date",
            **filters,
        )

        dates = sorted(set(c["business_date"] for c in checks))
        if end_date:
            dates = [d for d in dates if d <= end_date]

        print(f"  [snapshot] Backfilling {len(dates)} dates for venue {self.venue_id}")

        total_snapshots = 0
        for d in dates:
            snapshots = self.build_snapshots(d)
            total_snapshots += len(snapshots)

        print(f"  [snapshot] Backfill complete: {total_snapshots} total snapshots across {len(dates)} dates")
        return total_snapshots
