"""List TipSee locations - standalone script, no node_modules needed."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

conn = psycopg2.connect(
    host=os.environ.get("TIPSEE_DB_HOST", "TIPSEE_HOST_REDACTED"),
    port=int(os.environ.get("TIPSEE_DB_PORT", "5432")),
    dbname=os.environ.get("TIPSEE_DB_NAME", "postgres"),
    user=os.environ.get("TIPSEE_DB_USER"),
    password=os.environ.get("TIPSEE_DB_PASSWORD"),
    sslmode="require",
)

cur = conn.cursor()
cur.execute("""
    SELECT
        location as name,
        location_uuid as uuid,
        MIN(trading_day)::date as first_date,
        MAX(trading_day)::date as last_date,
        COUNT(*)::int as total_checks
    FROM public.tipsee_checks
    WHERE location_uuid IS NOT NULL AND location IS NOT NULL
    GROUP BY location, location_uuid
    ORDER BY location
""")

print("\n=== TipSee Locations ===\n")
print(f"{'Name':<35} {'UUID':<40} {'Date Range':<25} {'Checks':>10}")
print("-" * 115)

for row in cur.fetchall():
    name, uuid, first_date, last_date, checks = row
    print(f"{name:<35} {uuid:<40} {first_date} to {last_date}  {checks:>10,}")

cur.close()
conn.close()
