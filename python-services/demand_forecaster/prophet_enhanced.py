"""
Enhanced Prophet Forecaster
Uses TipSee POS data + Reservations + Weather (optional)

Usage:
    python prophet_enhanced.py                    # All venues
    python prophet_enhanced.py --venue-id UUID    # Single venue
    python prophet_enhanced.py --dry-run          # Don't save to DB
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Tuple
import pandas as pd
import numpy as np
import psycopg2
import requests
from supabase import create_client, Client
from prophet import Prophet
from dotenv import load_dotenv

load_dotenv()

# Configuration
FORECAST_DAYS = int(os.getenv("FORECAST_DAYS", "42"))
MODEL_VERSION = os.getenv("MODEL_VERSION", "prophet_v2_hybrid")
MIN_TRAINING_DAYS = 60
MIN_COVERS_THRESHOLD = 10

# Day-of-week reservation adjustment multipliers
# Higher on Fri/Sat when walk-ins scale with reservations
DOW_RESO_MULTIPLIERS = {
    0: 0.0,   # Mon - typically closed
    1: 0.3,   # Tue
    2: 0.3,   # Wed
    3: 0.4,   # Thu
    4: 1.0,   # Fri
    5: 1.0,   # Sat
    6: 0.5,   # Sun
}

# Venue coordinates for weather
VENUE_COORDS = {
    "f1e2158b-e567-4a1c-8750-2e826bdf1a2b": {"lat": 25.7617, "lon": -80.1918, "name": "Miami"},
    "f7a049ac-cf43-42b6-9083-b35d1848b24f": {"lat": 34.0901, "lon": -118.3861, "name": "LA"},
    "aeb1790a-1ce9-4d6c-b1bc-7ef618294dc4": {"lat": 34.0901, "lon": -118.3861, "name": "LA"},
    "5c4a4913-bca0-426f-8b51-54e175ea609f": {"lat": 34.0901, "lon": -118.3861, "name": "LA"},
}


def get_tipsee_conn():
    """Get connection to TipSee PostgreSQL."""
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


def get_historical_data(conn, location_uuid: str) -> pd.DataFrame:
    """Get daily covers + reservation data from TipSee."""
    sql = """
    WITH pos_data AS (
        SELECT
            trading_day::date AS ds,
            SUM(guest_count)::int AS covers,
            SUM(revenue_total)::numeric(14,2) AS net_sales
        FROM public.tipsee_checks
        WHERE location_uuid = %s
        GROUP BY trading_day::date
    ),
    reso_data AS (
        SELECT
            date AS ds,
            COUNT(*) AS reso_count,
            SUM(max_guests)::int AS reso_covers
        FROM public.full_reservations
        WHERE location_uuid = %s
          AND status IN ('COMPLETE', 'ARRIVED', 'SEATED', 'CONFIRMED')
        GROUP BY date
    )
    SELECT
        p.ds,
        p.covers,
        p.net_sales,
        COALESCE(r.reso_count, 0) AS reso_count,
        COALESCE(r.reso_covers, 0) AS reso_covers
    FROM pos_data p
    LEFT JOIN reso_data r ON r.ds = p.ds
    WHERE p.covers > %s
    ORDER BY p.ds
    """
    return pd.read_sql(sql, conn, params=(location_uuid, location_uuid, MIN_COVERS_THRESHOLD))


def get_future_reservations(conn, location_uuid: str, days: int = FORECAST_DAYS) -> pd.DataFrame:
    """Get reservation counts for future dates."""
    today = datetime.now().date()
    end_date = today + timedelta(days=days)

    sql = """
    SELECT
        date AS ds,
        COUNT(*) AS reso_count,
        COALESCE(SUM(max_guests), 0)::int AS reso_covers
    FROM public.full_reservations
    WHERE location_uuid = %s
      AND date >= %s
      AND date <= %s
      AND status IN ('CONFIRMED', 'BOOKED')
    GROUP BY date
    """
    return pd.read_sql(sql, conn, params=(location_uuid, str(today), str(end_date)))


def get_weather_forecast(lat: float, lon: float, days: int = 14) -> Optional[pd.DataFrame]:
    """Fetch weather forecast from Open-Meteo (free, no API key needed)."""
    try:
        # Open-Meteo API - free, no key required
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
            "temperature_unit": "fahrenheit",
            "precipitation_unit": "inch",
            "timezone": "America/New_York",
            "forecast_days": min(days, 16),  # Open-Meteo supports up to 16 days
        }
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        daily = data.get("daily", {})
        dates = daily.get("time", [])
        temp_highs = daily.get("temperature_2m_max", [])
        temp_lows = daily.get("temperature_2m_min", [])
        precip = daily.get("precipitation_sum", [])
        codes = daily.get("weathercode", [])

        # WMO weather codes to descriptions
        weather_codes = {
            0: "Clear", 1: "Clear", 2: "Partly Cloudy", 3: "Cloudy",
            45: "Fog", 48: "Fog",
            51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
            61: "Rain", 63: "Rain", 65: "Heavy Rain",
            71: "Snow", 73: "Snow", 75: "Heavy Snow",
            80: "Showers", 81: "Showers", 82: "Heavy Showers",
            95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
        }

        weather = []
        for i, date in enumerate(dates):
            weather.append({
                "ds": pd.to_datetime(date).date(),
                "temp_high": temp_highs[i] if i < len(temp_highs) else None,
                "temp_low": temp_lows[i] if i < len(temp_lows) else None,
                "precipitation": precip[i] if i < len(precip) else 0,
                "weather_main": weather_codes.get(codes[i], "Unknown") if i < len(codes) else "Unknown",
            })

        return pd.DataFrame(weather)
    except Exception as e:
        print(f"  [WARN] Weather API error: {e}")
        return None


def build_prophet_model() -> Prophet:
    """Build Prophet model with custom config."""
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


def fit_and_forecast(
    df: pd.DataFrame,
    future_resos: pd.DataFrame,
    y_col: str = "covers",
    forecast_days: int = FORECAST_DAYS,
) -> Tuple[pd.DataFrame, int, pd.Series]:
    """
    Fit Prophet baseline and forecast with hybrid reservation adjustment.

    Returns:
        (forecast_df, training_days, dow_avg_reso)
    """
    # Prepare training data
    prophet_df = df[["ds", y_col]].rename(columns={y_col: "y"}).copy()
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])
    prophet_df["y"] = pd.to_numeric(prophet_df["y"], errors="coerce").fillna(0)

    training_days = prophet_df["ds"].nunique()
    if training_days < MIN_TRAINING_DAYS:
        raise ValueError(f"Insufficient history: {training_days} days (need >= {MIN_TRAINING_DAYS})")

    # Calculate DOW average reservations for hybrid adjustment
    reso_df = df[["ds", "reso_covers"]].copy()
    reso_df["ds"] = pd.to_datetime(reso_df["ds"])
    reso_df["reso_covers"] = pd.to_numeric(reso_df["reso_covers"], errors="coerce").fillna(0)
    dow_avg_reso = reso_df.groupby(reso_df["ds"].dt.dayofweek)["reso_covers"].mean()

    # Build and fit baseline Prophet model (no regressor)
    model = build_prophet_model()
    model.fit(prophet_df)

    # Create future dataframe and predict
    future = model.make_future_dataframe(periods=forecast_days, freq="D")
    fc = model.predict(future)

    # HYBRID ADJUSTMENT: Apply DOW-specific reservation boost
    # Only for future dates where we have reservation data
    future_resos = future_resos.copy()
    future_resos["ds"] = pd.to_datetime(future_resos["ds"])
    reso_lookup = dict(zip(future_resos["ds"], future_resos["reso_covers"]))

    adjustments = []
    for idx, row in fc.iterrows():
        adjustment = 0
        if row["ds"] in reso_lookup:
            dow = row["ds"].dayofweek
            actual_resos = reso_lookup[row["ds"]]
            avg_resos = dow_avg_reso.get(dow, 0)
            reso_delta = actual_resos - avg_resos
            mult = DOW_RESO_MULTIPLIERS.get(dow, 0.5)
            adjustment = reso_delta * mult
        adjustments.append(adjustment)

    fc["adjustment"] = adjustments
    fc["yhat"] = fc["yhat"] + fc["adjustment"]
    fc["yhat_lower"] = fc["yhat_lower"] + fc["adjustment"]
    fc["yhat_upper"] = fc["yhat_upper"] + fc["adjustment"]

    # Clip negatives
    for col in ["yhat", "yhat_lower", "yhat_upper"]:
        fc[col] = fc[col].clip(lower=0)

    if y_col == "covers":
        for col in ["yhat", "yhat_lower", "yhat_upper"]:
            fc[col] = fc[col].round(0)

    result = fc[["ds", "yhat", "yhat_lower", "yhat_upper", "trend"]].copy()
    result["business_date"] = result["ds"].dt.date

    return result, training_days, dow_avg_reso


def get_venue_mappings(supabase: Client, venue_id: Optional[str] = None) -> List[Dict]:
    """Get venue to TipSee location mappings."""
    query = supabase.table("venue_tipsee_mapping").select(
        "venue_id, tipsee_location_uuid, tipsee_location_name"
    ).eq("is_active", True)

    if venue_id:
        query = query.eq("venue_id", venue_id)

    response = query.execute()
    return response.data or []


def save_forecasts(forecasts: list, supabase: Client):
    """Save forecasts to demand_forecasts table (consolidated)."""
    if not forecasts:
        return

    batch_size = 500

    # Group by venue/date to combine covers + net_sales
    grouped = {}
    for f in forecasts:
        key = (f["venue_id"], str(f["business_date"]))
        if key not in grouped:
            grouped[key] = {
                "venue_id": f["venue_id"],
                "business_date": f["business_date"],
                "reso_covers": f.get("reso_covers", 0),
                "weather": f.get("weather"),
            }
        grouped[key][f["forecast_type"]] = f

    # Save to demand_forecasts (consolidated table)
    print(f"[INFO] Saving {len(grouped)} forecast days to demand_forecasts...")
    today = str(datetime.now().date())
    demand_records = []

    for (vid, bdate), data in grouped.items():
        covers = data.get("covers", {})
        sales = data.get("net_sales", {})
        reso_covers = data.get("reso_covers", 0)

        if not covers:
            continue

        covers_pred = int(covers.get("yhat", 0))
        covers_lower = int(covers.get("yhat_lower", 0))
        covers_upper = int(covers.get("yhat_upper", 0))
        walkin_pred = max(0, covers_pred - reso_covers) if reso_covers else covers_pred

        # Confidence from interval width
        interval_width = covers_upper - covers_lower
        confidence = max(0.5, min(0.95, 1 - (interval_width / max(covers_pred, 1) / 2))) if covers_pred > 0 else 0.5

        # Format weather for storage
        weather = data.get("weather")
        weather_json = None
        if weather:
            weather_json = json.dumps(weather) if isinstance(weather, dict) else weather

        demand_records.append({
            "venue_id": vid,
            "forecast_date": today,
            "business_date": str(bdate),
            "shift_type": "dinner",
            "covers_predicted": covers_pred,
            "covers_lower": covers_lower,
            "covers_upper": covers_upper,
            "confidence_level": round(confidence, 3),
            "revenue_predicted": float(sales.get("yhat", 0)) if sales else None,
            "reservation_covers_predicted": reso_covers if reso_covers else None,
            "walkin_covers_predicted": walkin_pred,
            "model_version": MODEL_VERSION,
            "model_accuracy": None,
            "weather_forecast": weather_json,
            "events": None,
        })

    for i in range(0, len(demand_records), batch_size):
        batch = demand_records[i:i + batch_size]
        supabase.table("demand_forecasts").upsert(
            batch,
            on_conflict="venue_id,forecast_date,business_date,shift_type"
        ).execute()

    print(f"[OK] Saved {len(demand_records)} forecasts to demand_forecasts")


def run_forecaster(venue_id: Optional[str] = None, forecast_days: int = FORECAST_DAYS, dry_run: bool = False):
    """Main forecaster routine."""
    print("\n" + "=" * 70)
    print("ENHANCED PROPHET FORECASTER")
    print(f"Model version: {MODEL_VERSION}")
    print(f"Features: POS + Reservations + Weather (Open-Meteo)")
    print(f"Forecast horizon: {forecast_days} days")
    print("=" * 70 + "\n")

    supabase = get_supabase()
    tipsee_conn = get_tipsee_conn()

    mappings = get_venue_mappings(supabase, venue_id)
    print(f"[INFO] Found {len(mappings)} venue(s) to forecast\n")

    if not mappings:
        print("[ERROR] No venue mappings found")
        return

    forecasts_to_save = []
    generated_at = datetime.now(tz=None).isoformat()
    venues_ok = 0
    venues_skipped = 0

    for mapping in mappings:
        vid = mapping["venue_id"]
        location_uuid = mapping["tipsee_location_uuid"]
        location_name = mapping["tipsee_location_name"]

        print(f"\n[VENUE] {location_name}")
        print(f"  venue_id: {vid}")

        try:
            # Get historical data with reservations
            df = get_historical_data(tipsee_conn, location_uuid)
            print(f"  History: {len(df)} days ({df['ds'].min()} to {df['ds'].max()})")
            print(f"  Avg reso covers: {df['reso_covers'].mean():.0f}")

            # Get future reservations
            future_resos = get_future_reservations(tipsee_conn, location_uuid, forecast_days)
            print(f"  Future resos: {len(future_resos)} days with bookings")

            # Fetch weather forecast (Open-Meteo)
            weather_lookup = {}
            if location_uuid in VENUE_COORDS:
                coords = VENUE_COORDS[location_uuid]
                weather_df = get_weather_forecast(coords["lat"], coords["lon"], min(forecast_days, 14))
                if weather_df is not None and not weather_df.empty:
                    print(f"  Weather: {len(weather_df)} days fetched")
                    for _, w in weather_df.iterrows():
                        weather_lookup[str(w["ds"])] = {
                            "high": w["temp_high"],
                            "low": w["temp_low"],
                            "precip": w["precipitation"],
                            "condition": w["weather_main"],
                        }

            # Forecast COVERS (hybrid: Prophet baseline + reservation adjustment)
            print("  Training covers model (hybrid approach)...")
            fc_covers, training_days, _ = fit_and_forecast(df, future_resos, "covers", forecast_days)

            # Build reso_covers lookup from future_resos
            reso_lookup = {}
            if not future_resos.empty:
                for _, r in future_resos.iterrows():
                    reso_lookup[str(r["ds"].date() if hasattr(r["ds"], "date") else r["ds"])] = int(r["reso_covers"])

            for _, row in fc_covers.iterrows():
                bdate = str(row["business_date"])
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
                    "reso_covers": reso_lookup.get(bdate, 0),
                    "weather": weather_lookup.get(bdate),
                })

            # Forecast NET SALES (hybrid: Prophet baseline + reservation adjustment)
            print("  Training net_sales model (hybrid approach)...")
            fc_sales, _, _ = fit_and_forecast(df, future_resos, "net_sales", forecast_days)

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

            # Preview
            future_fc = fc_covers[fc_covers["ds"] > pd.Timestamp.today()]
            if not future_fc.empty:
                print(f"  Next 7 days covers forecast:")
                for _, r in future_fc.head(7).iterrows():
                    print(f"    {r['ds'].strftime('%a %m/%d')}: {int(r['yhat'])} ({int(r['yhat_lower'])}-{int(r['yhat_upper'])})")

            venues_ok += 1

        except Exception as e:
            print(f"  [SKIP] {e}")
            venues_skipped += 1
            continue

    tipsee_conn.close()

    if not dry_run and forecasts_to_save:
        save_forecasts(forecasts_to_save, supabase)

    print("\n" + "=" * 70)
    print("SUMMARY")
    print(f"  Venues processed: {venues_ok}")
    print(f"  Venues skipped: {venues_skipped}")
    print(f"  Total forecasts: {len(forecasts_to_save)}")
    if dry_run:
        print("  Mode: DRY RUN (no data saved)")
    print("=" * 70 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Enhanced Prophet forecaster")
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
