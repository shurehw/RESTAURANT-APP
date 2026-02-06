"""
Prophet Demand Forecaster v3
Hybrid model with 5 improvements over v2:
  1. Venue coords from DB (not hardcoded)
  2. Weather as Prophet regressors (precip + temp)
  3. Learned reservation elasticity per venue/DOW (not hardcoded)
  4. Revenue = covers × avg_check_per_dow (not separate Prophet)
  5. Outlier removal from training data

Usage:
    python forecaster.py                    # All venues
    python forecaster.py --venue-id UUID    # Single venue
    python forecaster.py --dry-run          # Don't save to DB
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
from sklearn.linear_model import Ridge
from supabase import create_client, Client
from prophet import Prophet
from dotenv import load_dotenv

load_dotenv()

# Configuration
FORECAST_DAYS = int(os.getenv("FORECAST_DAYS", "42"))
MODEL_VERSION = "prophet_v3_hybrid"
MIN_TRAINING_DAYS = 60
MIN_COVERS_THRESHOLD = 10

# Reso elasticity bounds
RESO_BETA_MIN = 0.0
RESO_BETA_MAX = 1.5

# Outlier removal
OUTLIER_PERCENTILE_LOW = 1    # bottom 1%
OUTLIER_PERCENTILE_HIGH = 99  # top 1%


# ============================================================================
# DATABASE CONNECTIONS
# ============================================================================

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


# ============================================================================
# IMPROVEMENT #1: VENUE COORDS FROM DB
# ============================================================================

def get_venue_coords(supabase: Client) -> Dict[str, Dict]:
    """
    Load venue coordinates from DB instead of hardcoded dict.
    Fails loudly if a venue is missing coords.
    """
    response = supabase.table("venues").select(
        "id, name, latitude, longitude, timezone"
    ).eq("is_active", True).not_.is_("latitude", "null").execute()

    coords = {}
    for v in response.data or []:
        coords[v["id"]] = {
            "lat": float(v["latitude"]),
            "lon": float(v["longitude"]),
            "tz": v.get("timezone", "America/Los_Angeles"),
            "name": v["name"],
        }

    return coords


# ============================================================================
# DATA RETRIEVAL
# ============================================================================

def get_historical_data(conn, location_uuid: str) -> pd.DataFrame:
    """Get daily covers + revenue + reservation data from TipSee."""
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


# ============================================================================
# IMPROVEMENT #2: WEATHER AS PROPHET REGRESSOR
# ============================================================================

def get_weather_forecast(lat: float, lon: float, tz: str, days: int = 14) -> Optional[pd.DataFrame]:
    """Fetch weather forecast from Open-Meteo (free, no API key)."""
    try:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,precipitation_sum",
            "temperature_unit": "fahrenheit",
            "precipitation_unit": "inch",
            "timezone": tz,
            "forecast_days": min(days, 16),
        }
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        daily = data.get("daily", {})
        dates = daily.get("time", [])
        temp_highs = daily.get("temperature_2m_max", [])
        precip = daily.get("precipitation_sum", [])

        rows = []
        for i, date in enumerate(dates):
            rows.append({
                "ds": pd.to_datetime(date),
                "temp_high": temp_highs[i] if i < len(temp_highs) else None,
                "precip_inch": precip[i] if i < len(precip) else 0,
            })

        return pd.DataFrame(rows)
    except Exception as e:
        print(f"  [WARN] Weather forecast API error: {e}")
        return None


def get_historical_weather(lat: float, lon: float, tz: str,
                           start_date: str, end_date: str) -> Optional[pd.DataFrame]:
    """
    Fetch historical weather from Open-Meteo Archive API.
    Required to use weather as a Prophet regressor (needs training data too).
    """
    try:
        url = "https://archive-api.open-meteo.com/v1/archive"
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": "temperature_2m_max,precipitation_sum",
            "temperature_unit": "fahrenheit",
            "precipitation_unit": "inch",
            "timezone": tz,
            "start_date": start_date,
            "end_date": end_date,
        }
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        daily = data.get("daily", {})
        dates = daily.get("time", [])
        temp_highs = daily.get("temperature_2m_max", [])
        precip = daily.get("precipitation_sum", [])

        rows = []
        for i, date in enumerate(dates):
            rows.append({
                "ds": pd.to_datetime(date),
                "temp_high": temp_highs[i] if i < len(temp_highs) else None,
                "precip_inch": precip[i] if i < len(precip) else 0,
            })

        df = pd.DataFrame(rows)
        # Fill any None values
        df["temp_high"] = df["temp_high"].fillna(df["temp_high"].median())
        df["precip_inch"] = df["precip_inch"].fillna(0)
        return df
    except Exception as e:
        print(f"  [WARN] Historical weather API error: {e}")
        return None


# ============================================================================
# IMPROVEMENT #3: LEARNED RESERVATION ELASTICITY
# ============================================================================

def learn_reso_elasticity(df: pd.DataFrame) -> Dict[int, float]:
    """
    Learn per-DOW reservation elasticity from historical data.

    For each DOW, fit: covers_ratio ~ 1 + beta * (resos_ratio - 1)
    Where ratio = value / avg_for_that_dow

    Returns dict of {dow: beta} clamped to [RESO_BETA_MIN, RESO_BETA_MAX].
    """
    df = df.copy()
    df["ds"] = pd.to_datetime(df["ds"])
    df["dow"] = df["ds"].dt.dayofweek
    df["covers"] = pd.to_numeric(df["covers"], errors="coerce").fillna(0)
    df["reso_covers"] = pd.to_numeric(df["reso_covers"], errors="coerce").fillna(0)

    # Compute DOW averages
    dow_avg_covers = df.groupby("dow")["covers"].mean()
    dow_avg_resos = df.groupby("dow")["reso_covers"].mean()

    betas = {}
    for dow in range(7):
        subset = df[df["dow"] == dow].copy()
        avg_c = dow_avg_covers.get(dow, 0)
        avg_r = dow_avg_resos.get(dow, 0)

        if avg_c <= 0 or avg_r <= 0 or len(subset) < 8:
            betas[dow] = 0.0
            continue

        # Compute ratios
        subset["covers_ratio"] = subset["covers"] / avg_c
        subset["resos_ratio"] = subset["reso_covers"] / avg_r

        # Target: covers_ratio - 1 (excess covers)
        # Feature: resos_ratio - 1 (excess resos)
        y = (subset["covers_ratio"] - 1).values.reshape(-1, 1)
        X = (subset["resos_ratio"] - 1).values.reshape(-1, 1)

        # Ridge regression with light regularization
        model = Ridge(alpha=1.0, fit_intercept=False)
        model.fit(X, y)

        beta = float(np.clip(model.coef_[0][0], RESO_BETA_MIN, RESO_BETA_MAX))
        betas[dow] = round(beta, 3)

    return betas


# ============================================================================
# IMPROVEMENT #5: OUTLIER REMOVAL
# ============================================================================

def clean_training_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Remove outliers from training data:
    - Zero-cover days (closures)
    - Top/bottom 1% of covers per venue (anomalies)
    """
    df = df.copy()
    original_len = len(df)

    # Remove zero-cover days
    df = df[df["covers"] > 0]

    # Winsorize: clip top/bottom percentiles
    if len(df) > 20:
        low = df["covers"].quantile(OUTLIER_PERCENTILE_LOW / 100)
        high = df["covers"].quantile(OUTLIER_PERCENTILE_HIGH / 100)
        df = df[(df["covers"] >= low) & (df["covers"] <= high)]

    removed = original_len - len(df)
    if removed > 0:
        print(f"  Outlier removal: dropped {removed} days ({original_len} → {len(df)})")

    return df


# ============================================================================
# PROPHET MODEL
# ============================================================================

def build_prophet_model(use_weather: bool = False) -> Prophet:
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

    # Improvement #2: weather regressors
    if use_weather:
        m.add_regressor("temp_high", standardize=True)
        m.add_regressor("precip_inch", standardize=True)

    return m


def fit_and_forecast(
    df: pd.DataFrame,
    future_resos: pd.DataFrame,
    reso_betas: Dict[int, float],
    forecast_days: int = FORECAST_DAYS,
    historical_weather: Optional[pd.DataFrame] = None,
    forecast_weather: Optional[pd.DataFrame] = None,
) -> Tuple[pd.DataFrame, int]:
    """
    Fit Prophet + learned reso adjustment + weather regressors.

    Returns: (forecast_df, training_days)
    """
    use_weather = (historical_weather is not None and forecast_weather is not None
                   and not historical_weather.empty and not forecast_weather.empty)

    # Prepare training data
    prophet_df = df[["ds", "covers"]].rename(columns={"covers": "y"}).copy()
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])
    prophet_df["y"] = pd.to_numeric(prophet_df["y"], errors="coerce").fillna(0)

    # Merge weather into training data if available
    if use_weather:
        prophet_df = prophet_df.merge(
            historical_weather[["ds", "temp_high", "precip_inch"]],
            on="ds", how="left"
        )
        # Fill gaps with median
        median_temp = prophet_df["temp_high"].median()
        prophet_df["temp_high"] = prophet_df["temp_high"].fillna(median_temp)
        prophet_df["precip_inch"] = prophet_df["precip_inch"].fillna(0)

    training_days = prophet_df["ds"].nunique()
    if training_days < MIN_TRAINING_DAYS:
        raise ValueError(f"Insufficient history: {training_days} days (need >= {MIN_TRAINING_DAYS})")

    # DOW average reservations for elasticity adjustment
    reso_df = df[["ds", "reso_covers"]].copy()
    reso_df["ds"] = pd.to_datetime(reso_df["ds"])
    reso_df["reso_covers"] = pd.to_numeric(reso_df["reso_covers"], errors="coerce").fillna(0)
    dow_avg_reso = reso_df.groupby(reso_df["ds"].dt.dayofweek)["reso_covers"].mean()

    # Build and fit
    model = build_prophet_model(use_weather=use_weather)
    model.fit(prophet_df)

    # Create future dataframe
    future = model.make_future_dataframe(periods=forecast_days, freq="D")

    # Add weather regressors to future
    if use_weather:
        # Merge forecast weather for future dates
        all_weather = pd.concat([historical_weather, forecast_weather], ignore_index=True)
        all_weather = all_weather.drop_duplicates(subset=["ds"], keep="last")
        future = future.merge(
            all_weather[["ds", "temp_high", "precip_inch"]],
            on="ds", how="left"
        )
        median_temp = historical_weather["temp_high"].median()
        future["temp_high"] = future["temp_high"].fillna(median_temp)
        future["precip_inch"] = future["precip_inch"].fillna(0)

    fc = model.predict(future)

    # Improvement #3: Apply LEARNED reservation adjustment (not hardcoded)
    future_resos = future_resos.copy()
    future_resos["ds"] = pd.to_datetime(future_resos["ds"])
    reso_lookup = dict(zip(future_resos["ds"], future_resos["reso_covers"]))

    adjustments = []
    for _, row in fc.iterrows():
        adjustment = 0
        if row["ds"] in reso_lookup:
            dow = row["ds"].dayofweek
            actual_resos = reso_lookup[row["ds"]]
            avg_resos = dow_avg_reso.get(dow, 0)
            if avg_resos > 0:
                reso_delta = actual_resos - avg_resos
                beta = reso_betas.get(dow, 0.0)
                adjustment = reso_delta * beta
        adjustments.append(adjustment)

    fc["reso_adjustment"] = adjustments
    fc["yhat"] = fc["yhat"] + fc["reso_adjustment"]
    fc["yhat_lower"] = fc["yhat_lower"] + fc["reso_adjustment"]
    fc["yhat_upper"] = fc["yhat_upper"] + fc["reso_adjustment"]

    # Clip negatives and round
    for col in ["yhat", "yhat_lower", "yhat_upper"]:
        fc[col] = fc[col].clip(lower=0).round(0)

    result = fc[["ds", "yhat", "yhat_lower", "yhat_upper", "trend"]].copy()
    result["business_date"] = result["ds"].dt.date

    return result, training_days


# ============================================================================
# IMPROVEMENT #4: REVENUE = COVERS × AVG CHECK
# ============================================================================

def compute_avg_check_per_dow(df: pd.DataFrame, window_weeks: int = 10) -> Dict[int, float]:
    """
    Compute average check per DOW from recent history.
    Uses trailing window with winsorization to handle comps/events.
    """
    df = df.copy()
    df["ds"] = pd.to_datetime(df["ds"])
    df["covers"] = pd.to_numeric(df["covers"], errors="coerce")
    df["net_sales"] = pd.to_numeric(df["net_sales"], errors="coerce")

    # Use last N weeks only
    cutoff = df["ds"].max() - timedelta(weeks=window_weeks)
    recent = df[df["ds"] >= cutoff].copy()

    # Compute per-day avg check
    recent = recent[recent["covers"] > 0].copy()
    recent["avg_check"] = recent["net_sales"] / recent["covers"]
    recent["dow"] = recent["ds"].dt.dayofweek

    # Winsorize avg_check: clip extreme values (comps, buyouts)
    if len(recent) > 10:
        low = recent["avg_check"].quantile(0.05)
        high = recent["avg_check"].quantile(0.95)
        recent["avg_check"] = recent["avg_check"].clip(low, high)

    # Group by DOW
    avg_checks = recent.groupby("dow")["avg_check"].mean().to_dict()

    # Fill missing DOWs with overall median
    overall = recent["avg_check"].median() if len(recent) > 0 else 80.0
    for dow in range(7):
        if dow not in avg_checks or pd.isna(avg_checks[dow]):
            avg_checks[dow] = overall

    return avg_checks


def forecast_revenue(covers_forecast: pd.DataFrame, avg_check_per_dow: Dict[int, float]) -> pd.DataFrame:
    """Revenue = covers × avg_check for that DOW."""
    result = covers_forecast.copy()
    result["dow"] = result["ds"].dt.dayofweek
    result["avg_check"] = result["dow"].map(avg_check_per_dow)
    result["revenue"] = (result["yhat"] * result["avg_check"]).round(2)
    return result


# ============================================================================
# VENUE MAPPINGS + SAVE
# ============================================================================

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
    """Save forecasts to demand_forecasts table."""
    if not forecasts:
        return

    batch_size = 500
    today = str(datetime.now().date())
    demand_records = []

    for f in forecasts:
        covers_pred = int(f.get("covers_predicted", 0))
        covers_lower = int(f.get("covers_lower", 0))
        covers_upper = int(f.get("covers_upper", 0))
        reso_covers = f.get("reso_covers", 0) or 0
        walkin_pred = max(0, covers_pred - reso_covers) if reso_covers else covers_pred

        # Confidence from interval width
        interval_width = covers_upper - covers_lower
        confidence = max(0.5, min(0.95, 1 - (interval_width / max(covers_pred, 1) / 2))) if covers_pred > 0 else 0.5

        weather_json = None
        if f.get("weather"):
            weather_json = json.dumps(f["weather"]) if isinstance(f["weather"], dict) else f["weather"]

        demand_records.append({
            "venue_id": f["venue_id"],
            "forecast_date": today,
            "business_date": f["business_date"],
            "shift_type": "dinner",
            "covers_predicted": covers_pred,
            "covers_lower": covers_lower,
            "covers_upper": covers_upper,
            "confidence_level": round(confidence, 3),
            "revenue_predicted": f.get("revenue_predicted"),
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


# ============================================================================
# MAIN FORECASTER
# ============================================================================

def run_forecaster(venue_id: Optional[str] = None, forecast_days: int = FORECAST_DAYS, dry_run: bool = False):
    """Main forecaster routine with all v3 improvements."""
    print("\n" + "=" * 70)
    print(f"PROPHET FORECASTER v3 ({MODEL_VERSION})")
    print(f"Improvements: weather regressors, learned reso elasticity,")
    print(f"              revenue=covers×avg_check, outlier removal")
    print(f"Forecast horizon: {forecast_days} days")
    print("=" * 70 + "\n")

    supabase = get_supabase()
    tipsee_conn = get_tipsee_conn()

    # Improvement #1: Load coords from DB
    venue_coords = get_venue_coords(supabase)
    print(f"[INFO] Venues with coordinates: {len(venue_coords)}")

    mappings = get_venue_mappings(supabase, venue_id)
    print(f"[INFO] Venues to forecast: {len(mappings)}")

    if not mappings:
        print("[ERROR] No venue mappings found")
        return

    # Check coverage
    missing_coords = [m["tipsee_location_name"] for m in mappings if m["venue_id"] not in venue_coords]
    if missing_coords:
        print(f"[WARN] Venues missing coordinates (no weather): {missing_coords}")

    weather_attached = 0
    weather_total = 0
    forecasts_to_save = []
    venues_ok = 0
    venues_skipped = 0

    for mapping in mappings:
        vid = mapping["venue_id"]
        location_uuid = mapping["tipsee_location_uuid"]
        location_name = mapping["tipsee_location_name"]
        coords = venue_coords.get(vid)

        print(f"\n{'─' * 50}")
        print(f"[VENUE] {location_name}")
        print(f"  venue_id: {vid}")
        if coords:
            print(f"  coords: {coords['lat']}, {coords['lon']} ({coords['tz']})")
        else:
            print(f"  [WARN] No coordinates - weather disabled for this venue")

        try:
            # Get historical data
            df = get_historical_data(tipsee_conn, location_uuid)
            print(f"  History: {len(df)} days ({df['ds'].min()} to {df['ds'].max()})")

            # Improvement #5: Clean training data
            df_clean = clean_training_data(df)

            # Improvement #3: Learn reso elasticity from data
            reso_betas = learn_reso_elasticity(df_clean)
            active_betas = {k: v for k, v in reso_betas.items() if v > 0}
            print(f"  Learned reso betas: {active_betas}")

            # Get future reservations
            future_resos = get_future_reservations(tipsee_conn, location_uuid, forecast_days)
            print(f"  Future resos: {len(future_resos)} days with bookings")

            # Improvement #2: Get weather (historical + forecast) if coords available
            hist_weather = None
            fcast_weather = None
            if coords:
                start_date = str(df_clean["ds"].min())
                # Historical weather ends yesterday
                end_date = str((datetime.now() - timedelta(days=1)).date())
                print(f"  Fetching historical weather ({start_date} to {end_date})...")
                hist_weather = get_historical_weather(
                    coords["lat"], coords["lon"], coords["tz"], start_date, end_date
                )
                if hist_weather is not None:
                    print(f"  Historical weather: {len(hist_weather)} days")

                print(f"  Fetching forecast weather...")
                fcast_weather = get_weather_forecast(
                    coords["lat"], coords["lon"], coords["tz"], min(forecast_days, 14)
                )
                if fcast_weather is not None:
                    print(f"  Forecast weather: {len(fcast_weather)} days")

            use_weather = (hist_weather is not None and fcast_weather is not None
                           and not hist_weather.empty and not fcast_weather.empty)
            print(f"  Weather regressors: {'ENABLED' if use_weather else 'DISABLED'}")

            # Fit covers model (Prophet + weather + learned reso)
            print("  Training covers model...")
            fc_covers, training_days = fit_and_forecast(
                df_clean, future_resos, reso_betas, forecast_days,
                historical_weather=hist_weather if use_weather else None,
                forecast_weather=fcast_weather if use_weather else None,
            )

            # Improvement #4: Revenue = covers × avg check (not separate Prophet)
            avg_checks = compute_avg_check_per_dow(df_clean)
            print(f"  Avg check by DOW: " + ", ".join(
                f"{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d]}=${v:.0f}"
                for d, v in sorted(avg_checks.items()) if v > 0
            ))
            fc_with_revenue = forecast_revenue(fc_covers, avg_checks)

            # Build reso lookup for metadata
            reso_lookup = {}
            if not future_resos.empty:
                for _, r in future_resos.iterrows():
                    key = str(r["ds"].date() if hasattr(r["ds"], "date") else r["ds"])
                    reso_lookup[key] = int(r["reso_covers"])

            # Build weather lookup for metadata
            weather_lookup = {}
            if fcast_weather is not None and not fcast_weather.empty:
                for _, w in fcast_weather.iterrows():
                    key = str(w["ds"].date() if hasattr(w["ds"], "date") else w["ds"])
                    weather_lookup[key] = {
                        "high": w["temp_high"],
                        "precip": w["precip_inch"],
                    }

            # Collect forecasts
            future_fc = fc_with_revenue[fc_with_revenue["ds"] > pd.Timestamp.today()]
            for _, row in future_fc.iterrows():
                bdate = str(row["business_date"])
                weather_total += 1
                if bdate in weather_lookup:
                    weather_attached += 1

                forecasts_to_save.append({
                    "venue_id": vid,
                    "business_date": bdate,
                    "covers_predicted": int(row["yhat"]),
                    "covers_lower": int(row["yhat_lower"]),
                    "covers_upper": int(row["yhat_upper"]),
                    "revenue_predicted": round(float(row["revenue"]), 2),
                    "reso_covers": reso_lookup.get(bdate, 0),
                    "weather": weather_lookup.get(bdate),
                })

            # Preview
            if not future_fc.empty:
                print(f"  Next 7 days forecast:")
                for _, r in future_fc.head(7).iterrows():
                    dow = r["ds"].strftime("%a")
                    rev = f"${r['revenue']:,.0f}" if pd.notna(r["revenue"]) else "?"
                    print(f"    {dow} {r['ds'].strftime('%m/%d')}: "
                          f"{int(r['yhat'])} covers ({int(r['yhat_lower'])}-{int(r['yhat_upper'])}) "
                          f"rev {rev}")

            venues_ok += 1

        except Exception as e:
            print(f"  [SKIP] {e}")
            import traceback
            traceback.print_exc()
            venues_skipped += 1
            continue

    tipsee_conn.close()

    # Debug metrics (acceptance test #1)
    if weather_total > 0:
        weather_pct = weather_attached / weather_total * 100
        print(f"\n[METRIC] Weather coverage: {weather_attached}/{weather_total} forecast rows ({weather_pct:.0f}%)")
    else:
        print(f"\n[METRIC] No forecast rows generated")

    if not dry_run and forecasts_to_save:
        save_forecasts(forecasts_to_save, supabase)

    print("\n" + "=" * 70)
    print("SUMMARY")
    print(f"  Model: {MODEL_VERSION}")
    print(f"  Venues processed: {venues_ok}")
    print(f"  Venues skipped: {venues_skipped}")
    print(f"  Total forecast days: {len(forecasts_to_save)}")
    if weather_total > 0:
        print(f"  Weather attached: {weather_attached}/{weather_total} ({weather_attached/weather_total*100:.0f}%)")
    if dry_run:
        print("  Mode: DRY RUN (no data saved)")
    print("=" * 70 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Prophet forecaster v3")
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
