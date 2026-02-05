"""
Prophet Baseline Forecaster
Generates net_sales and covers forecasts by venue using TipSee historical data.

Usage:
    python prophet_baseline.py                    # All venues
    python prophet_baseline.py --venue-id UUID    # Single venue
    python prophet_baseline.py --days 90          # Forecast horizon

Environment Variables:
    TIPSEE_DB_HOST, TIPSEE_DB_USER, TIPSEE_DB_PASSWORD, TIPSEE_DB_NAME, TIPSEE_DB_PORT
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
    MODEL_VERSION (optional, default: prophet_v1_baseline)
    FORECAST_DAYS (optional, default: 42)
"""

import os
import sys
import argparse
from datetime import datetime, date
from typing import Optional, Tuple
import pandas as pd
import numpy as np
import psycopg2
from psycopg2.extras import execute_values
from supabase import create_client, Client
from prophet import Prophet
from dotenv import load_dotenv

load_dotenv()

# Configuration
FORECAST_DAYS = int(os.getenv("FORECAST_DAYS", "42"))
MODEL_VERSION = os.getenv("MODEL_VERSION", "prophet_v1_baseline")
MIN_TRAINING_DAYS = 60  # Minimum days of history required

# SQL: Extract training data from TipSee, aggregated by venue and business_date
SQL_TRAINING_DATA = """
WITH venue_dates AS (
  -- Get date range per TipSee location
  SELECT
    vm.venue_id,
    vm.tipsee_location_uuid,
    MIN(tc.trading_day::date) as start_date,
    MAX(tc.trading_day::date) as end_date
  FROM venue_tipsee_mapping vm
  JOIN tipsee_checks tc ON tc.location_uuid = vm.tipsee_location_uuid::text
  WHERE vm.is_active = true
    {venue_filter}
  GROUP BY vm.venue_id, vm.tipsee_location_uuid
),
calendar AS (
  -- Generate continuous date series for each venue
  SELECT
    vd.venue_id,
    vd.tipsee_location_uuid,
    d::date AS ds
  FROM venue_dates vd
  CROSS JOIN LATERAL generate_series(vd.start_date, vd.end_date, interval '1 day') AS d
),
daily_agg AS (
  -- Aggregate TipSee checks by trading_day
  SELECT
    vm.venue_id,
    tc.trading_day::date AS ds,
    SUM(tc.sub_total)::numeric(14,2) AS net_sales,      -- sub_total = before tax
    SUM(tc.revenue_total)::numeric(14,2) AS gross_sales,
    SUM(tc.guest_count)::int AS covers,
    COUNT(*)::int AS checks
  FROM venue_tipsee_mapping vm
  JOIN tipsee_checks tc ON tc.location_uuid = vm.tipsee_location_uuid::text
  WHERE vm.is_active = true
    {venue_filter}
  GROUP BY vm.venue_id, tc.trading_day
)
SELECT
  c.venue_id::text,
  c.ds,
  COALESCE(a.net_sales, 0)::numeric(14,2) AS net_sales,
  COALESCE(a.covers, 0)::int AS covers,
  COALESCE(a.gross_sales, 0)::numeric(14,2) AS gross_sales,
  COALESCE(a.checks, 0)::int AS checks
FROM calendar c
LEFT JOIN daily_agg a
  ON a.venue_id = c.venue_id
  AND a.ds = c.ds
ORDER BY c.venue_id, c.ds;
"""

# SQL: Upsert forecasts into Supabase
SQL_UPSERT_FORECASTS = """
INSERT INTO venue_day_forecast
(venue_id, business_date, forecast_type, yhat, yhat_lower, yhat_upper, trend, model_version, training_days, generated_at)
VALUES %s
ON CONFLICT (venue_id, business_date, forecast_type, model_version)
DO UPDATE SET
  yhat = EXCLUDED.yhat,
  yhat_lower = EXCLUDED.yhat_lower,
  yhat_upper = EXCLUDED.yhat_upper,
  trend = EXCLUDED.trend,
  training_days = EXCLUDED.training_days,
  generated_at = EXCLUDED.generated_at;
"""


def get_tipsee_conn():
    """Get connection to TipSee PostgreSQL (Hwood Group data)."""
    return psycopg2.connect(
        host=os.environ["TIPSEE_DB_HOST"],
        port=int(os.getenv("TIPSEE_DB_PORT", "5432")),
        dbname=os.environ["TIPSEE_DB_NAME"],
        user=os.environ["TIPSEE_DB_USER"],
        password=os.environ["TIPSEE_DB_PASSWORD"],
        sslmode="require",
        connect_timeout=30,
    )


def get_supabase() -> Client:
    """Get Supabase client for storing forecasts."""
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )


def build_prophet_model() -> Prophet:
    """
    Build baseline Prophet model configured for restaurants.

    Settings:
    - Yearly seasonality: captures seasonal patterns
    - Weekly seasonality: captures Tue vs Fri vs Sat patterns
    - Multiplicative: handles scale changes correctly
    - US holidays: captures holiday effects
    """
    m = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,  # Meaningless at daily grain
        seasonality_mode="multiplicative",
        interval_width=0.80,
        changepoint_prior_scale=0.05,  # Conservative trend changes
    )
    # Add US holidays (H.wood venues are US-based)
    m.add_country_holidays(country_name="US")
    return m


def fit_and_forecast(
    df: pd.DataFrame,
    y_col: str,
    forecast_days: int = FORECAST_DAYS
) -> Tuple[pd.DataFrame, int]:
    """
    Fit Prophet model and generate forecasts.

    Args:
        df: DataFrame with 'ds' and y_col columns
        y_col: Column name for target variable ('net_sales' or 'covers')
        forecast_days: Number of days to forecast

    Returns:
        Tuple of (forecast DataFrame, training_days count)
    """
    # Prepare Prophet format
    prophet_df = df[["ds", y_col]].rename(columns={y_col: "y"}).copy()
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])
    prophet_df["y"] = pd.to_numeric(prophet_df["y"], errors="coerce").fillna(0)

    # Validation
    training_days = prophet_df["ds"].nunique()
    if training_days < MIN_TRAINING_DAYS:
        raise ValueError(
            f"Insufficient history: {training_days} days (need >= {MIN_TRAINING_DAYS})"
        )

    # Remove zero-only days at start (venue may have been closed)
    first_nonzero_idx = prophet_df[prophet_df["y"] > 0].index.min()
    if first_nonzero_idx is not None:
        prophet_df = prophet_df.loc[first_nonzero_idx:].reset_index(drop=True)
        training_days = len(prophet_df)

    # Fit model
    model = build_prophet_model()
    model.fit(prophet_df)

    # Generate future dates
    future = model.make_future_dataframe(periods=forecast_days, freq="D")

    # Predict
    fc = model.predict(future)

    # Clip negative values (sales and covers can't be negative)
    for col in ["yhat", "yhat_lower", "yhat_upper"]:
        fc[col] = fc[col].clip(lower=0)

    # Round covers to integers (sales stay as decimals)
    if y_col == "covers":
        for col in ["yhat", "yhat_lower", "yhat_upper"]:
            fc[col] = fc[col].round(0)

    # Extract relevant columns
    result = fc[["ds", "yhat", "yhat_lower", "yhat_upper", "trend"]].copy()
    result["business_date"] = result["ds"].dt.date

    return result, training_days


def load_training_data(venue_id: Optional[str] = None) -> pd.DataFrame:
    """
    Load training data from TipSee via venue_tipsee_mapping.

    Args:
        venue_id: Optional UUID to filter to single venue

    Returns:
        DataFrame with venue_id, ds, net_sales, covers
    """
    # Build venue filter
    if venue_id:
        venue_filter = f"AND vm.venue_id = '{venue_id}'::uuid"
    else:
        venue_filter = ""

    sql = SQL_TRAINING_DATA.format(venue_filter=venue_filter)

    print(f"[INFO] Connecting to TipSee database...")
    with get_tipsee_conn() as conn:
        df = pd.read_sql(sql, conn)

    if df.empty:
        raise ValueError("No training data returned from TipSee")

    print(f"[INFO] Loaded {len(df)} rows for {df['venue_id'].nunique()} venue(s)")
    print(f"[INFO] Date range: {df['ds'].min()} to {df['ds'].max()}")

    return df


def save_forecasts(forecasts: list, supabase: Client):
    """
    Save forecasts to Supabase venue_day_forecast table.

    Args:
        forecasts: List of forecast tuples
        supabase: Supabase client
    """
    if not forecasts:
        print("[WARN] No forecasts to save")
        return

    # Use raw SQL via Supabase's postgrest or direct connection
    # For bulk upsert, we need to use direct SQL
    print(f"[INFO] Saving {len(forecasts)} forecast rows...")

    # Use service role connection for bulk insert
    response = supabase.rpc("exec_sql", {
        "query": SQL_UPSERT_FORECASTS,
        "params": forecasts
    }).execute()

    # Alternative: Use Supabase's upsert (slower but simpler)
    # This works better with the Supabase Python client
    batch_size = 1000
    for i in range(0, len(forecasts), batch_size):
        batch = forecasts[i:i + batch_size]
        records = [
            {
                "venue_id": f[0],
                "business_date": str(f[1]),
                "forecast_type": f[2],
                "yhat": float(f[3]),
                "yhat_lower": float(f[4]),
                "yhat_upper": float(f[5]),
                "trend": float(f[6]) if f[6] is not None else None,
                "model_version": f[7],
                "training_days": f[8],
                "generated_at": f[9].isoformat(),
            }
            for f in batch
        ]
        supabase.table("venue_day_forecast").upsert(
            records,
            on_conflict="venue_id,business_date,forecast_type,model_version"
        ).execute()

    print(f"[OK] Saved {len(forecasts)} forecasts to venue_day_forecast")


def run_forecaster(
    venue_id: Optional[str] = None,
    forecast_days: int = FORECAST_DAYS,
    dry_run: bool = False
):
    """
    Main forecaster routine.

    Args:
        venue_id: Optional single venue to forecast
        forecast_days: Days to forecast into future
        dry_run: If True, print results but don't save
    """
    print("\n" + "=" * 70)
    print("PROPHET BASELINE FORECASTER")
    print(f"Model version: {MODEL_VERSION}")
    print(f"Forecast horizon: {forecast_days} days")
    print("=" * 70 + "\n")

    # Load training data from TipSee
    df = load_training_data(venue_id)

    # Initialize Supabase for saving
    supabase = get_supabase() if not dry_run else None

    # Track results
    forecasts_to_save = []
    generated_at = datetime.utcnow()
    venues_ok = 0
    venues_skipped = 0

    # Process each venue
    for vid, venue_df in df.groupby("venue_id"):
        venue_df = venue_df.sort_values("ds").reset_index(drop=True)
        print(f"\n[VENUE] {vid}")
        print(f"  History: {len(venue_df)} days ({venue_df['ds'].min()} to {venue_df['ds'].max()})")

        try:
            # Forecast NET SALES
            print("  Training net_sales model...")
            fc_sales, training_days = fit_and_forecast(
                venue_df, "net_sales", forecast_days
            )
            print(f"    Training days: {training_days}")

            for _, row in fc_sales.iterrows():
                forecasts_to_save.append((
                    vid,
                    row["business_date"],
                    "net_sales",
                    round(row["yhat"], 2),
                    round(row["yhat_lower"], 2),
                    round(row["yhat_upper"], 2),
                    round(row["trend"], 2) if pd.notna(row["trend"]) else None,
                    MODEL_VERSION,
                    training_days,
                    generated_at,
                ))

            # Forecast COVERS
            print("  Training covers model...")
            fc_covers, _ = fit_and_forecast(
                venue_df, "covers", forecast_days
            )

            for _, row in fc_covers.iterrows():
                forecasts_to_save.append((
                    vid,
                    row["business_date"],
                    "covers",
                    round(row["yhat"], 0),
                    round(row["yhat_lower"], 0),
                    round(row["yhat_upper"], 0),
                    round(row["trend"], 2) if pd.notna(row["trend"]) else None,
                    MODEL_VERSION,
                    training_days,
                    generated_at,
                ))

            # Summary stats
            future_sales = fc_sales[fc_sales["ds"] > pd.Timestamp.today()]
            if not future_sales.empty:
                print(f"  Next 7 days net_sales forecast:")
                for _, r in future_sales.head(7).iterrows():
                    print(f"    {r['ds'].strftime('%a %m/%d')}: ${r['yhat']:,.0f} (${r['yhat_lower']:,.0f}-${r['yhat_upper']:,.0f})")

            venues_ok += 1

        except Exception as e:
            print(f"  [SKIP] {e}")
            venues_skipped += 1
            continue

    # Save to database
    if not dry_run and forecasts_to_save:
        save_forecasts(forecasts_to_save, supabase)

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print(f"  Venues processed: {venues_ok}")
    print(f"  Venues skipped: {venues_skipped}")
    print(f"  Total forecasts: {len(forecasts_to_save)}")
    if dry_run:
        print("  Mode: DRY RUN (no data saved)")
    print("=" * 70 + "\n")

    return venues_ok, venues_skipped


def main():
    parser = argparse.ArgumentParser(
        description="Generate Prophet forecasts for net_sales and covers by venue"
    )
    parser.add_argument(
        "--venue-id",
        type=str,
        help="Single venue UUID to forecast (default: all venues)"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=FORECAST_DAYS,
        help=f"Forecast horizon in days (default: {FORECAST_DAYS})"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print forecasts but don't save to database"
    )

    args = parser.parse_args()

    try:
        run_forecaster(
            venue_id=args.venue_id,
            forecast_days=args.days,
            dry_run=args.dry_run
        )
    except Exception as e:
        print(f"\n[ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
