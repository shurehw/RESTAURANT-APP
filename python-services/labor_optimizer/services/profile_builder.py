"""
Profile Builder — builds DOW x Hour statistical profiles from hourly_snapshots.
Runs weekly or on-demand.
"""

import math
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional
import numpy as np

from ..db import get_db
from ..core.staffing import compute_scenario_staffing
from .. import config


class ProfileBuilder:
    """Builds staffing_profiles from hourly_snapshots for a venue."""

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
                "min_servers": 2,
                "min_bartenders": 1,
            }
        return self._config

    def build_profiles(
        self,
        lookback_weeks: int = None,
        min_samples: int = None,
    ) -> List[Dict]:
        """
        Build DOW x Hour statistical profiles from hourly_snapshots.

        Groups snapshots by (day_of_week, hour_slot), computes percentiles.

        Args:
            lookback_weeks: Number of weeks of history to use (default from config)
            min_samples: Minimum sample count per DOW/hour to include (default 3)

        Returns:
            List of profile dicts
        """
        lookback_weeks = lookback_weeks or config.DEFAULT_LOOKBACK_WEEKS
        min_samples = min_samples or config.MIN_SAMPLE_COUNT

        cfg = self._load_config()
        cps = float(cfg.get("covers_per_server_target", config.DEFAULT_COVERS_PER_SERVER))
        cpb = float(cfg.get("covers_per_bartender_target", config.DEFAULT_COVERS_PER_BARTENDER))
        buffer_pct = float(cfg.get("buffer_pct", config.DEFAULT_BUFFER_PCT))
        min_servers = int(cfg.get("min_servers", 2))
        min_bartenders = int(cfg.get("min_bartenders", 1))

        # Calculate date range
        end_date = date.today()
        start_date = end_date - timedelta(weeks=lookback_weeks)

        # Fetch all snapshots in range
        snapshots = self.db.select(
            "hourly_snapshots",
            "business_date,day_of_week,hour_slot,active_covers,new_covers",
            venue_id=f"eq.{self.venue_id}",
            business_date=f"gte.{start_date.isoformat()}",
        )

        if not snapshots:
            print(f"  [profile] No snapshots found for venue {self.venue_id}")
            return []

        # Group by (day_of_week, hour_slot)
        groups: Dict[tuple, List[Dict]] = {}
        for s in snapshots:
            key = (s["day_of_week"], s["hour_slot"])
            groups.setdefault(key, []).append(s)

        # Get latest profile version
        existing = self.db.select(
            "staffing_profiles",
            "profile_version",
            venue_id=f"eq.{self.venue_id}",
            order="profile_version.desc",
            limit="1",
        )
        next_version = (existing[0]["profile_version"] + 1) if existing else 1

        profiles = []
        for (dow, hour), entries in sorted(groups.items()):
            if len(entries) < min_samples:
                continue

            covers = np.array([e["active_covers"] for e in entries], dtype=float)
            new_covers = np.array([e.get("new_covers", 0) for e in entries], dtype=float)
            dates = sorted(e["business_date"] for e in entries)

            p50 = float(np.percentile(covers, 50))
            p75 = float(np.percentile(covers, 75))
            p90 = float(np.percentile(covers, 90))

            # Compute staffing for each scenario
            scenarios = compute_scenario_staffing(
                p50, p75, p90,
                cps, cpb, buffer_pct,
                min_servers, min_bartenders,
            )

            profiles.append({
                "venue_id": self.venue_id,
                "day_of_week": dow,
                "hour_slot": hour,
                "sample_count": len(entries),
                "date_range_start": dates[0],
                "date_range_end": dates[-1],
                "avg_active_covers": round(float(np.mean(covers)), 2),
                "p50_active_covers": round(p50, 2),
                "p75_active_covers": round(p75, 2),
                "p90_active_covers": round(p90, 2),
                "max_active_covers": int(np.max(covers)),
                "stddev_active_covers": round(float(np.std(covers)), 2),
                "avg_new_covers": round(float(np.mean(new_covers)), 2),
                "p75_new_covers": round(float(np.percentile(new_covers, 75)), 2),
                "servers_lean": scenarios["lean"]["servers"],
                "servers_buffered": scenarios["buffered"]["servers"],
                "servers_safe": scenarios["safe"]["servers"],
                "bartenders_lean": scenarios["lean"]["bartenders"],
                "bartenders_buffered": scenarios["buffered"]["bartenders"],
                "bartenders_safe": scenarios["safe"]["bartenders"],
                "profile_version": next_version,
            })

        # Upsert profiles
        if profiles:
            self.db.upsert(
                "staffing_profiles",
                profiles,
                on_conflict="venue_id,day_of_week,hour_slot,profile_version",
            )
            print(f"  [profile] Built {len(profiles)} profiles (v{next_version}) from {len(snapshots)} snapshots, lookback {lookback_weeks}w")

        return profiles

    def get_latest_profiles(self, day_of_week: int = None) -> List[Dict]:
        """
        Get the latest version of profiles for this venue.

        Args:
            day_of_week: Optional filter for specific DOW (0=Monday)
        """
        # Get latest version number
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

        filters = {
            "venue_id": f"eq.{self.venue_id}",
            "profile_version": f"eq.{latest_version}",
            "order": "hour_slot.asc",
        }
        if day_of_week is not None:
            filters["day_of_week"] = f"eq.{day_of_week}"

        return self.db.select("staffing_profiles", "*", **filters)
