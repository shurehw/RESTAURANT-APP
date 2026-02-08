"""
Backtest: v4 gated vs v3 ungated vs baseline Prophet

Holds out the last N days of data, trains on everything before,
predicts the holdout period, then compares to actuals.

Tests three models:
  - Baseline: raw Prophet (no weather, no reso, no outlier removal)
  - V3: full Prophet + continuous weather + reso (on everything)
  - V4: tier-gated (model_router picks per venue)

Usage:
    python backtest.py                  # 90-day holdout, all venues
    python backtest.py --holdout 60     # 60-day holdout
    python backtest.py --venue-id UUID  # Single venue
"""

import os
import sys
import argparse
from datetime import datetime, timedelta
from typing import Optional, Dict, List
import pandas as pd
import numpy as np
from prophet import Prophet
from dotenv import load_dotenv

load_dotenv()

from forecaster import (
    get_tipsee_conn,
    get_supabase,
    get_venue_coords,
    get_venue_mappings,
    get_historical_data,
    get_historical_weather,
    learn_reso_elasticity,
    clean_training_data,
    build_prophet_model,
    compute_avg_check_per_dow,
    convert_weather_to_binary,
    naive_dow_forecast,
    model_router,
    ModelConfig,
    TIER_C_MIN,
)


def fit_prophet_holdout(
    train_df: pd.DataFrame,
    holdout_days: int,
    weather_mode: str = "off",
    historical_weather: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    """
    Fit Prophet on train_df, predict holdout_days beyond the training end.
    Supports continuous, binary, or no weather.
    """
    prophet_df = train_df[["ds", "covers"]].rename(columns={"covers": "y"}).copy()
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])
    prophet_df["y"] = pd.to_numeric(prophet_df["y"], errors="coerce").fillna(0)

    has_weather = (weather_mode != "off" and historical_weather is not None
                   and not historical_weather.empty)

    # Prepare weather data
    hw = None
    if has_weather:
        hw = historical_weather.copy()
        if weather_mode == "binary":
            hw = convert_weather_to_binary(hw)

    # Merge weather into training
    if has_weather and hw is not None:
        train_end = prophet_df["ds"].max()
        hw_train = hw[hw["ds"] <= train_end].copy()
        if weather_mode == "continuous":
            cols = ["ds", "temp_high", "precip_inch"]
        else:
            cols = ["ds", "is_rainy", "is_extreme_heat"]
        prophet_df = prophet_df.merge(hw_train[cols], on="ds", how="left")
        for c in cols[1:]:
            if c == "temp_high":
                prophet_df[c] = prophet_df[c].fillna(prophet_df[c].median())
            else:
                prophet_df[c] = prophet_df[c].fillna(0)

    model = build_prophet_model(weather_mode=weather_mode if has_weather else "off")
    model.fit(prophet_df)

    future = model.make_future_dataframe(periods=holdout_days, freq="D")

    # Add weather to future (use actual historical weather for backtest fairness)
    if has_weather and hw is not None:
        if weather_mode == "continuous":
            cols = ["ds", "temp_high", "precip_inch"]
        else:
            cols = ["ds", "is_rainy", "is_extreme_heat"]
        future = future.merge(hw[cols], on="ds", how="left")
        for c in cols[1:]:
            if c == "temp_high":
                future[c] = future[c].fillna(hw[c].median())
            else:
                future[c] = future[c].fillna(0)

    fc = model.predict(future)

    for col in ["yhat", "yhat_lower", "yhat_upper"]:
        fc[col] = fc[col].clip(lower=0).round(0)

    return fc[["ds", "yhat", "yhat_lower", "yhat_upper"]]


def fit_baseline(train_df: pd.DataFrame, holdout_days: int) -> pd.DataFrame:
    """Baseline Prophet: no weather, no reso, no outlier removal."""
    prophet_df = train_df[["ds", "covers"]].rename(columns={"covers": "y"}).copy()
    prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])
    prophet_df["y"] = pd.to_numeric(prophet_df["y"], errors="coerce").fillna(0)

    model = Prophet(
        yearly_seasonality=True,
        weekly_seasonality=True,
        daily_seasonality=False,
        seasonality_mode="multiplicative",
        interval_width=0.80,
        changepoint_prior_scale=0.05,
    )
    model.add_country_holidays(country_name="US")
    model.fit(prophet_df)

    future = model.make_future_dataframe(periods=holdout_days, freq="D")
    fc = model.predict(future)

    for col in ["yhat", "yhat_lower", "yhat_upper"]:
        fc[col] = fc[col].clip(lower=0).round(0)

    return fc[["ds", "yhat", "yhat_lower", "yhat_upper"]]


def compute_metrics(actuals: pd.DataFrame, predictions: pd.DataFrame, label: str) -> Dict:
    """Compute MAPE, within-10%, within-20%, bias for a forecast vs actuals."""
    merged = actuals.merge(predictions, on="ds", how="inner")
    merged = merged[merged["actual"] > 0]

    if len(merged) == 0:
        return {"label": label, "n": 0, "mape": None, "within_10": None, "within_20": None, "bias": None}

    merged["pct_error"] = (abs(merged["yhat"] - merged["actual"]) / merged["actual"] * 100)
    merged["signed_error"] = merged["yhat"] - merged["actual"]

    mape = merged["pct_error"].mean()
    within_10 = (merged["pct_error"] <= 10).mean() * 100
    within_20 = (merged["pct_error"] <= 20).mean() * 100
    bias = merged["signed_error"].mean()

    return {
        "label": label,
        "n": len(merged),
        "mape": round(mape, 1),
        "within_10": round(within_10, 1),
        "within_20": round(within_20, 1),
        "bias": round(bias, 1),
    }


def run_backtest(venue_id: Optional[str] = None, holdout_days: int = 90):
    """Run backtest comparing Baseline vs V3 (ungated) vs V4 (gated)."""
    print("\n" + "=" * 70)
    print(f"BACKTEST: Baseline vs V3 (ungated) vs V4 (gated)")
    print(f"Holdout: last {holdout_days} days")
    print("=" * 70 + "\n")

    supabase = get_supabase()
    tipsee_conn = get_tipsee_conn()
    venue_coords = get_venue_coords(supabase)
    mappings = get_venue_mappings(supabase, venue_id)

    print(f"Venues to backtest: {len(mappings)}\n")

    all_baseline = []
    all_v3 = []
    all_v4 = []

    for mapping in mappings:
        vid = mapping["venue_id"]
        location_uuid = mapping["tipsee_location_uuid"]
        location_name = mapping["tipsee_location_name"]
        venue_class = mapping.get("venue_class")
        coords = venue_coords.get(vid)

        print(f"{'-' * 50}")
        print(f"[VENUE] {location_name} ({venue_class or 'unknown'})")

        try:
            df_all = get_historical_data(tipsee_conn, location_uuid)
            df_all["ds"] = pd.to_datetime(df_all["ds"])
            total_days = len(df_all)

            # Split
            cutoff_date = df_all["ds"].max() - timedelta(days=holdout_days)
            train_raw = df_all[df_all["ds"] <= cutoff_date].copy()
            holdout = df_all[df_all["ds"] > cutoff_date].copy()
            actual_holdout_days = len(holdout)

            print(f"  Train: {len(train_raw)}d, Holdout: {actual_holdout_days}d")

            # Actuals
            actuals = holdout[["ds", "covers"]].rename(columns={"covers": "actual"}).copy()
            actuals["actual"] = pd.to_numeric(actuals["actual"], errors="coerce").fillna(0)

            # Get weather for entire period
            hist_weather = None
            if coords:
                start_date = str(train_raw["ds"].min().date())
                end_date = str(holdout["ds"].max().date())
                hist_weather = get_historical_weather(
                    coords["lat"], coords["lon"], coords["tz"], start_date, end_date
                )
                if hist_weather is not None:
                    print(f"  Weather: {len(hist_weather)} days")

            # V4 routing decision
            config = model_router(len(train_raw), venue_class, has_coords=coords is not None)
            print(f"  V4 route -> {config}")

            # --- BASELINE ---
            if len(train_raw) >= TIER_C_MIN:
                print("  Training BASELINE...")
                baseline_fc = fit_baseline(train_raw, actual_holdout_days)
                baseline_holdout = baseline_fc[baseline_fc["ds"] > cutoff_date]
                all_baseline.append(compute_metrics(actuals, baseline_holdout, location_name))
            else:
                print("  BASELINE: skipped (too few days)")
                all_baseline.append({"label": location_name, "n": 0, "mape": None,
                                     "within_10": None, "within_20": None, "bias": None})

            # --- V3 (ungated - always uses continuous weather + reso) ---
            if len(train_raw) >= 60:  # v3 min was 60
                train_clean_v3 = clean_training_data(train_raw)
                reso_betas_v3 = learn_reso_elasticity(train_clean_v3)
                print(f"  Training V3 (ungated, continuous weather)...")
                v3_fc = fit_prophet_holdout(
                    train_clean_v3, actual_holdout_days,
                    weather_mode="continuous", historical_weather=hist_weather,
                )
                v3_holdout = v3_fc[v3_fc["ds"] > cutoff_date]
                all_v3.append(compute_metrics(actuals, v3_holdout, location_name))
            else:
                print(f"  V3: skipped (<60d)")
                all_v3.append({"label": location_name, "n": 0, "mape": None,
                               "within_10": None, "within_20": None, "bias": None})

            # --- V4 (gated) ---
            if config.use_prophet:
                train_v4 = clean_training_data(train_raw) if config.use_outlier_removal else train_raw
                print(f"  Training V4 (weather={config.use_weather})...")
                v4_fc = fit_prophet_holdout(
                    train_v4, actual_holdout_days,
                    weather_mode=config.use_weather, historical_weather=hist_weather,
                )
                v4_holdout = v4_fc[v4_fc["ds"] > cutoff_date]
                all_v4.append(compute_metrics(actuals, v4_holdout, location_name))
            else:
                # Tier D: naive
                print(f"  Training V4 (naive DOW avg)...")
                naive_fc = naive_dow_forecast(train_raw, actual_holdout_days)
                naive_holdout = naive_fc.copy()
                naive_holdout = naive_holdout.rename(columns={})  # already has yhat
                all_v4.append(compute_metrics(actuals, naive_holdout, location_name))

            # Per-venue table
            b = all_baseline[-1]
            v3 = all_v3[-1]
            v4 = all_v4[-1]
            print(f"\n  {'Metric':<15} {'Baseline':>10} {'V3':>10} {'V4':>10}")
            print(f"  {'-'*55}")
            if v4["mape"] is not None:
                bm = f"{b['mape']:.1f}%" if b["mape"] is not None else "N/A"
                v3m = f"{v3['mape']:.1f}%" if v3["mape"] is not None else "N/A"
                v4m = f"{v4['mape']:.1f}%"
                print(f"  {'MAPE':<15} {bm:>10} {v3m:>10} {v4m:>10}")

                bw = f"{b['within_10']:.1f}%" if b["within_10"] is not None else "N/A"
                v3w = f"{v3['within_10']:.1f}%" if v3["within_10"] is not None else "N/A"
                v4w = f"{v4['within_10']:.1f}%"
                print(f"  {'Within 10%':<15} {bw:>10} {v3w:>10} {v4w:>10}")

                bw2 = f"{b['within_20']:.1f}%" if b["within_20"] is not None else "N/A"
                v3w2 = f"{v3['within_20']:.1f}%" if v3["within_20"] is not None else "N/A"
                v4w2 = f"{v4['within_20']:.1f}%"
                print(f"  {'Within 20%':<15} {bw2:>10} {v3w2:>10} {v4w2:>10}")

                print(f"  {'Sample':<15} {b['n']:>10} {v3['n']:>10} {v4['n']:>10}")
            print()

        except Exception as e:
            print(f"  [ERROR] {e}")
            import traceback
            traceback.print_exc()
            continue

    tipsee_conn.close()

    # --- AGGREGATE ---
    print("\n" + "=" * 70)
    print("AGGREGATE RESULTS")
    print("=" * 70)

    def aggregate(metrics_list):
        valid = [m for m in metrics_list if m["mape"] is not None and m["n"] > 0]
        if not valid:
            return None
        total_n = sum(m["n"] for m in valid)
        w_mape = sum(m["mape"] * m["n"] for m in valid) / total_n
        w_10 = sum(m["within_10"] * m["n"] for m in valid) / total_n
        w_20 = sum(m["within_20"] * m["n"] for m in valid) / total_n
        w_bias = sum(m["bias"] * m["n"] for m in valid) / total_n
        return {
            "mape": round(w_mape, 1), "within_10": round(w_10, 1),
            "within_20": round(w_20, 1), "bias": round(w_bias, 1),
            "n": total_n, "venues": len(valid),
        }

    agg_base = aggregate(all_baseline)
    agg_v3 = aggregate(all_v3)
    agg_v4 = aggregate(all_v4)

    print(f"\n  {'Metric':<20} {'Baseline':>12} {'V3':>12} {'V4':>12}")
    print(f"  {'-'*56}")
    if agg_base and agg_v3 and agg_v4:
        print(f"  {'MAPE':<20} {agg_base['mape']:>11.1f}% {agg_v3['mape']:>11.1f}% {agg_v4['mape']:>11.1f}%")
        print(f"  {'Within 10%':<20} {agg_base['within_10']:>11.1f}% {agg_v3['within_10']:>11.1f}% {agg_v4['within_10']:>11.1f}%")
        print(f"  {'Within 20%':<20} {agg_base['within_20']:>11.1f}% {agg_v3['within_20']:>11.1f}% {agg_v4['within_20']:>11.1f}%")
        print(f"  {'Avg Bias':<20} {agg_base['bias']:>12.1f} {agg_v3['bias']:>12.1f} {agg_v4['bias']:>12.1f}")
        print(f"  {'Sample days':<20} {agg_base['n']:>12} {agg_v3['n']:>12} {agg_v4['n']:>12}")
        print(f"  {'Venues':<20} {agg_base['venues']:>12} {agg_v3['venues']:>12} {agg_v4['venues']:>12}")

        # Verdict
        d_v4_base = agg_v4["mape"] - agg_base["mape"]
        d_v4_v3 = agg_v4["mape"] - agg_v3["mape"]
        print(f"\n  V4 vs Baseline: MAPE {d_v4_base:+.1f}pp")
        print(f"  V4 vs V3:       MAPE {d_v4_v3:+.1f}pp")

        if d_v4_base < -2 and d_v4_v3 < 0:
            print(f"\n  VERDICT: V4 WINS - beats both baseline and V3")
        elif d_v4_base < -2:
            print(f"\n  VERDICT: V4 beats baseline, similar to V3")
        else:
            print(f"\n  VERDICT: Needs investigation")
    elif agg_v4:
        print(f"  V4 MAPE: {agg_v4['mape']:.1f}%")

    print("\n" + "=" * 70 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Backtest v4 gated vs v3 vs baseline")
    parser.add_argument("--holdout", type=int, default=90, help="Holdout days (default: 90)")
    parser.add_argument("--venue-id", type=str, help="Single venue UUID")
    args = parser.parse_args()

    run_backtest(venue_id=args.venue_id, holdout_days=args.holdout)


if __name__ == "__main__":
    main()
