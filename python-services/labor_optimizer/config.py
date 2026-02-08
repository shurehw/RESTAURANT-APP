"""
Configuration — loads from environment variables with sensible defaults.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env files (same pattern as auto_scheduler.py)
_project_root = Path(__file__).resolve().parent.parent.parent
load_dotenv(_project_root / ".env")
load_dotenv(_project_root / ".env.local", override=True)

# Supabase
SUPABASE_URL: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
DATABASE_URL: str = os.getenv("DATABASE_URL", "")

# If DATABASE_URL not set, derive from SUPABASE_URL
if not DATABASE_URL and SUPABASE_URL:
    # Supabase project ref is between // and .supabase
    # URL: https://abcdef.supabase.co → host: db.abcdef.supabase.co
    ref = SUPABASE_URL.split("//")[1].split(".")[0] if "//" in SUPABASE_URL else ""
    db_password = os.getenv("SUPABASE_DB_PASSWORD", "")
    if ref and db_password:
        DATABASE_URL = f"postgresql://postgres.{ref}:{db_password}@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

# Toast POS
TOAST_API_BASE: str = os.getenv("TOAST_API_BASE", "https://api.toasttab.com")
TOAST_CLIENT_ID: str = os.getenv("TOAST_CLIENT_ID", "")
TOAST_CLIENT_SECRET: str = os.getenv("TOAST_CLIENT_SECRET", "")
TOAST_API_KEY: str = os.getenv("TOAST_API_KEY", "")

# Square POS
SQUARE_BASE_URL: str = os.getenv("SQUARE_BASE_URL", "https://connect.squareup.com")
SQUARE_ACCESS_TOKEN: str = os.getenv("SQUARE_ACCESS_TOKEN", "")

# Defaults
DEFAULT_COVERS_PER_SERVER: float = float(os.getenv("DEFAULT_COVERS_PER_SERVER", "16.0"))
DEFAULT_COVERS_PER_BARTENDER: float = float(os.getenv("DEFAULT_COVERS_PER_BARTENDER", "30.0"))
DEFAULT_BUFFER_PCT: float = float(os.getenv("DEFAULT_BUFFER_PCT", "0.10"))
DEFAULT_PEAK_BUFFER_PCT: float = float(os.getenv("DEFAULT_PEAK_BUFFER_PCT", "0.15"))
DEFAULT_DWELL_MINUTES: int = int(os.getenv("DEFAULT_DWELL_MINUTES", "90"))
DEFAULT_AVG_HOURLY_RATE: float = float(os.getenv("DEFAULT_AVG_HOURLY_RATE", "18.0"))

# Profile building
MIN_SAMPLE_COUNT: int = int(os.getenv("MIN_SAMPLE_COUNT", "3"))
DEFAULT_LOOKBACK_WEEKS: int = int(os.getenv("DEFAULT_LOOKBACK_WEEKS", "8"))

# Report output
REPORT_OUTPUT_DIR: str = os.getenv("REPORT_OUTPUT_DIR", str(_project_root / "reports"))
