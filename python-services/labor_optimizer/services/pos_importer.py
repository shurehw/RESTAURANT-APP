"""
POS Check Importers — Toast, Square, CSV.
Fetches check-level data (open_time, close_time, guest_count) and upserts to pos_checks.
"""

import csv
import io
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional
import httpx

from ..db import get_db
from ..core.active_covers import estimate_close_time
from .. import config


class BaseCheckImporter(ABC):
    """Base class for POS check importers."""

    def __init__(self, venue_id: str, pos_type: str):
        self.venue_id = venue_id
        self.pos_type = pos_type
        self.db = get_db()

    @abstractmethod
    def fetch_checks(self, business_date: str) -> List[Dict]:
        """
        Fetch raw checks from POS for a business date.

        Must return list of dicts with at minimum:
            external_check_id, open_time, guest_count

        Optional fields:
            close_time, table_name, total_amount, subtotal,
            tip_amount, tax_amount, server_name, server_external_id, raw_data
        """
        ...

    def import_date(self, business_date: str, dwell_minutes: int = 90) -> int:
        """
        Fetch checks and upsert to pos_checks table.

        Returns number of checks imported.
        """
        raw_checks = self.fetch_checks(business_date)
        if not raw_checks:
            print(f"  [{self.pos_type}] No checks for {business_date}")
            return 0

        rows = []
        for check in raw_checks:
            open_time = check["open_time"]
            close_time = check.get("close_time")

            # Estimate close_time if missing
            if not close_time:
                if isinstance(open_time, str):
                    open_time_dt = datetime.fromisoformat(open_time.replace("Z", "+00:00"))
                else:
                    open_time_dt = open_time
                close_time = estimate_close_time(
                    open_time_dt,
                    dwell_minutes=dwell_minutes,
                    total_amount=check.get("total_amount"),
                    guest_count=check.get("guest_count", 1),
                ).isoformat()

            rows.append({
                "venue_id": self.venue_id,
                "pos_type": self.pos_type,
                "external_check_id": str(check["external_check_id"]),
                "business_date": business_date,
                "open_time": open_time if isinstance(open_time, str) else open_time.isoformat(),
                "close_time": close_time if isinstance(close_time, str) else close_time.isoformat(),
                "guest_count": check.get("guest_count", 1),
                "table_name": check.get("table_name"),
                "total_amount": check.get("total_amount"),
                "subtotal": check.get("subtotal"),
                "tip_amount": check.get("tip_amount"),
                "tax_amount": check.get("tax_amount"),
                "server_name": check.get("server_name"),
                "server_external_id": check.get("server_external_id"),
                "raw_data": check.get("raw_data"),
            })

        # Upsert in batches of 200
        imported = 0
        batch_size = 200
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            self.db.upsert(
                "pos_checks",
                batch,
                on_conflict="venue_id,pos_type,external_check_id",
            )
            imported += len(batch)

        print(f"  [{self.pos_type}] Imported {imported} checks for {business_date}")
        return imported

    def import_range(self, start_date: str, end_date: str, dwell_minutes: int = 90) -> int:
        """Import checks for a date range (inclusive)."""
        current = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
        total = 0
        while current <= end:
            total += self.import_date(current.isoformat(), dwell_minutes)
            current += timedelta(days=1)
        return total


class ToastCheckImporter(BaseCheckImporter):
    """
    Import checks from Toast Orders API.

    Toast API: GET /orders/v2/orders?businessDate=YYYYMMDD
    Each order has: openedDate, closedDate, guestCount, server, table, checks
    """

    def __init__(
        self,
        venue_id: str,
        restaurant_guid: str,
        api_key: str = None,
        api_base: str = None,
    ):
        super().__init__(venue_id, "toast")
        self.restaurant_guid = restaurant_guid
        self.api_key = api_key or config.TOAST_API_KEY
        self.api_base = api_base or config.TOAST_API_BASE
        self.client = httpx.Client(timeout=60)

    def fetch_checks(self, business_date: str) -> List[Dict]:
        """Fetch orders from Toast for a business date."""
        # Toast uses YYYYMMDD format
        bdate = business_date.replace("-", "")

        url = f"{self.api_base}/orders/v2/orders"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Toast-Restaurant-External-ID": self.restaurant_guid,
            "Content-Type": "application/json",
        }
        params = {"businessDate": bdate}

        all_checks = []
        page = 1
        while True:
            params["pageToken"] = str(page) if page > 1 else None
            r = self.client.get(url, headers=headers, params={k: v for k, v in params.items() if v})

            if r.status_code == 404:
                return []
            r.raise_for_status()
            orders = r.json()

            if not orders:
                break

            for order in orders:
                # Skip voided orders
                if order.get("voidDate"):
                    continue

                opened = order.get("openedDate")
                closed = order.get("closedDate")
                guests = order.get("guestCount") or order.get("numberOfGuests") or 1

                # Get server info
                server = order.get("server", {})
                server_name = None
                if server:
                    server_name = f"{server.get('firstName', '')} {server.get('lastName', '')}".strip()

                # Get table info
                table = order.get("table", {})
                table_name = table.get("name") if table else None

                # Get check totals
                total = 0.0
                subtotal = 0.0
                tip = 0.0
                tax = 0.0
                for check in order.get("checks", []):
                    total += check.get("totalAmount", 0)
                    subtotal += check.get("amount", 0)
                    tip += check.get("tipAmount", 0)
                    tax += check.get("taxAmount", 0)

                check_id = order.get("guid") or order.get("entityType", "") + str(page)

                all_checks.append({
                    "external_check_id": check_id,
                    "open_time": opened,
                    "close_time": closed,
                    "guest_count": max(1, int(guests)),
                    "table_name": table_name,
                    "total_amount": round(total, 2),
                    "subtotal": round(subtotal, 2),
                    "tip_amount": round(tip, 2),
                    "tax_amount": round(tax, 2),
                    "server_name": server_name,
                    "server_external_id": server.get("guid") if server else None,
                })

            # Toast paginates, check if more
            if len(orders) < 100:
                break
            page += 1

        return all_checks


class SquareCheckImporter(BaseCheckImporter):
    """
    Import checks from Square Orders API.

    Square API: POST /v2/orders/search
    Each order has: created_at, closed_at, line_items, tenders
    Guest count not directly available — inferred from config or default.
    """

    def __init__(
        self,
        venue_id: str,
        location_id: str,
        access_token: str = None,
        default_party_size: int = 2,
    ):
        super().__init__(venue_id, "square")
        self.location_id = location_id
        self.access_token = access_token or config.SQUARE_ACCESS_TOKEN
        self.default_party_size = default_party_size
        self.client = httpx.Client(timeout=60)

    def fetch_checks(self, business_date: str) -> List[Dict]:
        """Fetch orders from Square for a business date."""
        start_at = f"{business_date}T00:00:00Z"
        end_at = f"{business_date}T23:59:59Z"

        url = f"{config.SQUARE_BASE_URL}/v2/orders/search"
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Square-Version": "2024-01-18",
        }
        body = {
            "location_ids": [self.location_id],
            "query": {
                "filter": {
                    "date_time_filter": {
                        "created_at": {
                            "start_at": start_at,
                            "end_at": end_at,
                        }
                    },
                    "state_filter": {"states": ["COMPLETED"]},
                }
            },
            "limit": 500,
        }

        all_checks = []
        cursor = None

        while True:
            if cursor:
                body["cursor"] = cursor
            r = self.client.post(url, headers=headers, json=body)
            r.raise_for_status()
            data = r.json()

            for order in data.get("orders", []):
                order_id = order.get("id")
                created = order.get("created_at")
                closed = order.get("closed_at") or order.get("updated_at")

                # Square doesn't have native guest count
                # Infer from covers metadata or use default
                guest_count = self.default_party_size
                metadata = order.get("metadata", {})
                if metadata.get("guest_count"):
                    guest_count = int(metadata["guest_count"])

                # Total from tenders
                total = 0.0
                tip = 0.0
                for tender in order.get("tenders", []):
                    amount = tender.get("amount_money", {}).get("amount", 0) / 100
                    tip_money = tender.get("tip_money", {}).get("amount", 0) / 100
                    total += amount
                    tip += tip_money

                all_checks.append({
                    "external_check_id": order_id,
                    "open_time": created,
                    "close_time": closed,
                    "guest_count": guest_count,
                    "total_amount": round(total, 2),
                    "tip_amount": round(tip, 2),
                })

            cursor = data.get("cursor")
            if not cursor:
                break

        return all_checks


class CSVCheckImporter(BaseCheckImporter):
    """
    Import checks from CSV file with configurable column mapping.

    Default expected columns:
        check_id, open_time, close_time, guest_count, table_name,
        total_amount, server_name
    """

    def __init__(
        self,
        venue_id: str,
        column_map: Dict[str, str] = None,
    ):
        super().__init__(venue_id, "csv")
        self.column_map = column_map or {
            "external_check_id": "check_id",
            "open_time": "open_time",
            "close_time": "close_time",
            "guest_count": "guest_count",
            "table_name": "table_name",
            "total_amount": "total_amount",
            "server_name": "server_name",
        }
        self._csv_data: List[Dict] = []

    def load_csv(self, file_path: str = None, csv_text: str = None) -> int:
        """Load CSV data from file path or string."""
        if file_path:
            with open(file_path, "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                self._csv_data = list(reader)
        elif csv_text:
            reader = csv.DictReader(io.StringIO(csv_text))
            self._csv_data = list(reader)
        else:
            raise ValueError("Provide either file_path or csv_text")

        print(f"  [csv] Loaded {len(self._csv_data)} rows")
        return len(self._csv_data)

    def fetch_checks(self, business_date: str) -> List[Dict]:
        """Filter loaded CSV data to a specific business date."""
        checks = []
        for row in self._csv_data:
            mapped = {}
            for target_key, csv_col in self.column_map.items():
                mapped[target_key] = row.get(csv_col, "").strip() if row.get(csv_col) else None

            # Parse open_time and check if it matches business_date
            open_str = mapped.get("open_time", "")
            if not open_str:
                continue

            try:
                open_dt = datetime.fromisoformat(open_str.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                # Try other date formats
                for fmt in ["%m/%d/%Y %H:%M", "%m/%d/%Y %I:%M %p", "%Y-%m-%d %H:%M:%S"]:
                    try:
                        open_dt = datetime.strptime(open_str, fmt)
                        break
                    except ValueError:
                        continue
                else:
                    continue

            if open_dt.strftime("%Y-%m-%d") != business_date:
                continue

            guest_count = 1
            if mapped.get("guest_count"):
                try:
                    guest_count = max(1, int(float(mapped["guest_count"])))
                except (ValueError, TypeError):
                    pass

            total_amount = None
            if mapped.get("total_amount"):
                try:
                    total_amount = float(mapped["total_amount"])
                except (ValueError, TypeError):
                    pass

            checks.append({
                "external_check_id": mapped.get("external_check_id") or f"csv-{len(checks)}",
                "open_time": open_dt.isoformat(),
                "close_time": mapped.get("close_time"),
                "guest_count": guest_count,
                "table_name": mapped.get("table_name"),
                "total_amount": total_amount,
                "server_name": mapped.get("server_name"),
            })

        return checks
