"""
Prophet Baseline Forecaster
Generates net_sales and covers forecasts by venue using TipSee historical data.

Usage:
    python prophet_baseline.py                    # All venues
    python prophet_baseline.py --venue-id UUID    # Single venue
    python prophet_baseline.py --days 90          # Forecast horizon
    python prophet_baseline.py --dry-run          # Don't save to DB
"""

import os
import sys
import argparse
from datetime import datetime
from typing import Optional, Tuple, List, Dict
import pandas as pd
import numpy as np
import psycopg2
from supabase import create_client, Client
from prophet import Prophet
from dotenv import load_dotenv

load_dotenv()

# Configuration
FORECAST_DAYS = int(os.getenv("FORECAST_DAYS", "42"))
MODEL_VERSION = os.getenv("MODEL_VERSION", "prophet_v1_baseline")
MIN_TRAINING_DAYS = 60


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
    """Get Supabase client."""
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def build_prophet_model() -> Prophet:
    """Build baseline Prophet model configured for restaurants."""
    m = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        seasonality_mode="multiplicative",
        interval_width=0.80,
        changepoint_prior_scale=0.05,
    )
    m.add_country_holidays(country_name="US")
    return m


def fit_and_forecast(df: pd.DataFrame, y_col: str, forecast_days: int = FORECAST_DAYS) -> Tuple[pd.DataFrame, int]:
    """Fit Prophet model and generate forecasts."""
    prophet_df = df[["ds", y_col]].rename(columns={y_col: "y"}).copy()
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])
    prophet_df["y"] = pd.to_numeric(prophet_df["y"], errors="coerce").fillna(0)

    training_days = prophet_df["ds"].nunique()
    if training_days < MIN_TRAINING_DAYS:
        raise ValueError(f"Insufficient history: {training_days} days (need >= {MIN_TRAINING_DAYS})")

    # Remove zero-only days at start
    first_nonzero_idx = prophet_df[prophet_df["y"] > 0].index.min()
    if first_nonzero_idx is not None:
        prophet_df = prophet_df.loc[first_nonzero_idx:].reset_index(drop=True)
        training_days = len(prophet_df)

    model = build_prophet_model()
    model.fit(prophet_df)

    future = model.make_future_dataframe(periods=forecast_days, freq="D")
    fc = model.predict(future)

    for col in ["yhat", "yhat_lower", "yhat_upper"]:
        fc[col] = fc[col].clip(lower=0)

    if y_col == "covers":
        for col in ["yhat", "yhat_lower", "yhat_upper"]:
            fc[col] = fc[col].round(0)

    result = fc[["ds", "yhat", "yhat_lower", "yhat_upper", "trend"]].copy()
    result["business_date"] = result["ds"].dt.date

    return result, training_days


def get_venue_mappings(supabase: Client, venue_id: Optional[str] = None) -> List[Dict]:
    """Get venue to TipSee location mappings from Supabase."""
    query = supabase.table("venue_tipsee_mapping").select(
        "venue_id, tipsee_location_uuid, tipsee_location_name"
    ).eq("is_active", True)

    if venue_id:
        query = query.eq("venue_id", venue_id)

    response = query.execute()
    return response.data or []


def get_tipsee_data(conn, location_uuid: str) -> pd.DataFrame:
    """Get daily aggregated data from TipSee for a single location."""
    sql = """
    WITH date_range AS (
        SELECT
            MIN(trading_day)::date as start_date,
            MAX(trading_day)::date as end_date
        FROM public.tipsee_checks
        WHERE location_uuid = %s
    ),
    calendar AS (
        SELECT d::date AS ds
        FROM date_range
        CROSS JOIN generate_series(start_date, end_date, interval '1 day') AS d
    ),
    daily_agg AS (
        SELECT
            trading_day::date AS ds,
            SUM(sub_total)::numeric(14,2) AS net_sales,
            SUM(revenue_total)::numeric(14,2) AS gross_sales,
            SUM(guest_count)::int AS covers,
            COUNT(*)::int AS checks
        FROM public.tipsee_checks
        WHERE location_uuid = %s
        GROUP BY trading_day::date
    )
    SELECT
        c.ds,
        COALESCE(a.net_sales, 0)::numeric(14,2) AS net_sales,
        COALESCE(a.covers, 0)::int AS covers,
        COALESCE(a.gross_sales, 0)::numeric(14,2) AS gross_sales,
        COALESCE(a.checks, 0)::int AS checks
    FROM calendar c
    LEFT JOIN daily_agg a ON a.ds = c.ds
    ORDER BY c.ds;
    """
    return pd.read_sql(sql, conn, params=(location_uuid, location_uuid))


def save_forecasts(forecasts: list, supabase: Client):
    """Save forecasts to Supabase venue_day_forecast table."""
    if not forecasts:
        print("[WARN] No forecasts to save")
        return

    print(f"[INFO] Saving {len(forecasts)} forecast rows...")

    batch_size = 500
    for i in range(0, len(forecasts), batch_size):
        batch = forecasts[i:i + batch_size]
        records = [
            {
                "venue_id": f["venue_id"],
                "business_date": str(f["business_date"]),
                "forecast_type": f["forecast_type"],
                "yhat": float(f["yhat"]),
                "yhat_lower": float(f["yhat_lower"]),
                "yhat_upper": float(f["yhat_upper"]),
                "trend": float(f["trend"]) if f["trend"] is not None and not pd.isna(f["trend"]) else None,
                "model_version": f["model_version"],
                "training_days": f["training_days"],
                "generated_at": f["generated_at"],
            }
            for f in batch
        ]

        supabase.table("venue_day_forecast").upsert(
            records,
            on_conflict="venue_id,business_date,forecast_type,model_version"
        ).execute()

        print(f"  Batch {i // batch_size + 1}: {len(batch)} rows")

    print(f"[OK] Saved {len(forecasts)} forecasts")


def run_forecaster(venue_id: Optional[str] = None, forecast_days: int = FORECAST_DAYS, dry_run: bool = False):
    """Main forecaster routine."""
    print("\n" + "=" * 70)
    print("PROPHET BASELINE FORECASTER")
    print(f"Model version: {MODEL_VERSION}")
    print(f"Forecast horizon: {forecast_days} days")
    print("=" * 70 + "\n")

    # Initialize clients
    supabase = get_supabase()
    tipsee_conn = get_tipsee_conn()

    # Get venue mappings from Supabase
    mappings = get_venue_mappings(supabase, venue_id)
    print(f"[INFO] Found {len(mappings)} venue(s) to forecast\n")

    if not mappings:
        print("[ERROR] No venue mappings found")
        return 0, 0

    forecasts_to_save = []
    generated_at = datetime.utcnow().isoformat()
    venues_ok = 0
    venues_skipped = 0

    for mapping in mappings:
        vid = mapping["venue_id"]
        location_uuid = mapping["tipsee_location_uuid"]
        location_name = mapping["tipsee_location_name"]

        print(f"\n[VENUE] {location_name}")
        print(f"  venue_id: {vid}")

        try:
            # Get TipSee data for this location
            df = get_tipsee_data(tipsee_conn, location_uuid)
            print(f"  History: {len(df)} days ({df['ds'].min()} to {df['ds'].max()})")

            # Forecast NET SALES
            print("  Training net_sales model...")
            fc_sales, training_days = fit_and_forecast(df, "net_sales", forecast_days)
            print(f"    Training days: {training_days}")

            for _, row in fc_sales.iterrows():
                forecasts_to_save.append({
                    "venue_id": vid,
                    "business_date": row["business_date"],
                    "forecast_type": "net_sales",
                    "yhat": round(row["yhat"], 2),
                    "yhat_lower": round(row["yhat_lower"], 2),
                    "yhat_upper": round(row["yhat_upper"], 2),
                    "trend": round(row["trend"], 2) if pd.notna(row["trend"]) else None,
                    "model_version": MODEL_VERSION,
                    "training_days": training_days,
                    "generated_at": generated_at,
                })

            # Forecast COVERS
            print("  Training covers model...")
            fc_covers, _ = fit_and_forecast(df, "covers", forecast_days)

            for _, row in fc_covers.iterrows():
                forecasts_to_save.append({
                    "venue_id": vid,
                    "business_date": row["business_date"],
                    "forecast_type": "covers",
                    "yhat": round(row["yhat"], 0),
                    "yhat_lower": round(row["yhat_lower"], 0),
                    "yhat_upper": round(row["yhat_upper"], 0),
                    "trend": round(row["trend"], 2) if pd.notna(row["trend"]) else None,
                    "model_version": MODEL_VERSION,
                    "training_days": training_days,
                    "generated_at": generated_at,
                })

            # Show preview
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

    tipsee_conn.close()

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
    parser = argparse.ArgumentParser(description="Generate Prophet forecasts")
    parser.add_argument("--venue-id", type=str, help="Single venue UUID")
    parser.add_argument("--days", type=int, default=FORECAST_DAYS, help="Forecast days")
    parser.add_argument("--dry-run", action="store_true", help="Don't save to DB")

    args = parser.parse_args()

    try:
        run_forecaster(venue_id=args.venue_id, forecast_days=args.days, dry_run=args.dry_run)
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
