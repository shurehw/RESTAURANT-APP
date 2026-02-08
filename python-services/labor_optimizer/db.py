"""
Database layer — SupabaseREST (PostgREST) + optional psycopg2 pool.
Reuses the same pattern as auto_scheduler.py for consistency.
"""

from typing import Dict, List, Optional, Any
import httpx
from . import config


class SupabaseREST:
    """Lightweight PostgREST client (avoids supabase-py WebSocket hang on Windows)."""

    def __init__(self, url: str = None, key: str = None):
        url = url or config.SUPABASE_URL
        key = key or config.SUPABASE_KEY
        if not url or not key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
        self.base = f"{url}/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        self.client = httpx.Client(timeout=30)

    def select(self, table: str, columns: str = "*", **filters) -> List[Dict]:
        params = {"select": columns}
        for k, v in filters.items():
            params[k] = v
        r = self.client.get(f"{self.base}/{table}", headers=self.headers, params=params)
        r.raise_for_status()
        return r.json()

    def insert(self, table: str, data: Any) -> List[Dict]:
        r = self.client.post(f"{self.base}/{table}", headers=self.headers, json=data)
        r.raise_for_status()
        return r.json()

    def upsert(self, table: str, data: Any, on_conflict: str = None) -> List[Dict]:
        headers = {**self.headers}
        if on_conflict:
            headers["Prefer"] = f"return=representation,resolution=merge-duplicates"
        params = {}
        if on_conflict:
            params["on_conflict"] = on_conflict
        r = self.client.post(f"{self.base}/{table}", headers=headers, json=data, params=params)
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

    def rpc(self, function_name: str, params: Dict = None) -> Any:
        r = self.client.post(
            f"{self.base}/rpc/{function_name}",
            headers=self.headers,
            json=params or {},
        )
        r.raise_for_status()
        return r.json()


class PostgresPool:
    """Optional direct Postgres connection for bulk operations."""

    def __init__(self, dsn: str = None, min_conn: int = 1, max_conn: int = 5):
        self._dsn = dsn or config.DATABASE_URL
        self._pool = None
        self._min = min_conn
        self._max = max_conn

    def _ensure_pool(self):
        if self._pool is None:
            import psycopg2.pool
            if not self._dsn:
                raise ValueError("DATABASE_URL not configured — set DATABASE_URL or SUPABASE_DB_PASSWORD")
            self._pool = psycopg2.pool.ThreadedConnectionPool(self._min, self._max, self._dsn)
        return self._pool

    def get_conn(self):
        return self._ensure_pool().getconn()

    def put_conn(self, conn):
        self._ensure_pool().putconn(conn)

    def execute(self, sql: str, params: tuple = None) -> List[Dict]:
        conn = self.get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                if cur.description:
                    cols = [d[0] for d in cur.description]
                    return [dict(zip(cols, row)) for row in cur.fetchall()]
                conn.commit()
                return []
        finally:
            self.put_conn(conn)

    def execute_values(self, sql: str, values: list, template: str = None) -> None:
        """Bulk insert using psycopg2.extras.execute_values for performance."""
        from psycopg2.extras import execute_values as _ev
        conn = self.get_conn()
        try:
            with conn.cursor() as cur:
                _ev(cur, sql, values, template=template)
            conn.commit()
        finally:
            self.put_conn(conn)

    def close(self):
        if self._pool:
            self._pool.closeall()
            self._pool = None


# Module-level singletons (lazy)
_db: Optional[SupabaseREST] = None
_pg: Optional[PostgresPool] = None


def get_db() -> SupabaseREST:
    global _db
    if _db is None:
        _db = SupabaseREST()
    return _db


def get_pg() -> PostgresPool:
    global _pg
    if _pg is None:
        _pg = PostgresPool()
    return _pg
