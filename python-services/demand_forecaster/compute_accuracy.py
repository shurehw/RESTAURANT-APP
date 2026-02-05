"""
Forecast Accuracy Computation
Computes weekly MAPE and other metrics by comparing forecasts to actuals.

Usage:
    python compute_accuracy.py                    # All venues, last week
    python compute_accuracy.py --venue-id UUID    # Single venue
    python compute_accuracy.py --weeks 4          # Last 4 weeks

Environment Variables:
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""

import os
import argparse
from datetime import datetime, timedelta
from typing import Optional
import pandas as pd
import numpy as np
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()


def get_supabase() -> Client:
    """Get Supabase client."""
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    )


def compute_accuracy_metrics(
    venue_id: Optional[str] = None,
    weeks_back: int = 1,
    model_version: str = "prophet_v1_baseline"
):
    """
    Compute forecast accuracy by comparing predictions to actuals.

    Args:
        venue_id: Optional single venue UUID
        weeks_back: Number of weeks to analyze
        model_version: Which model version to evaluate
    """
    supabase = get_supabase()

    # Date range
    end_date = datetime.now().date() - timedelta(days=1)  # Yesterday
    start_date = end_date - timedelta(weeks=weeks_back)

    print(f"\n[INFO] Computing accuracy for {start_date} to {end_date}")
    print(f"[INFO] Model version: {model_version}")

    # Fetch forecast vs actual data
    query = supabase.rpc(
        "get_forecast_accuracy_data",
        {
            "p_start_date": str(start_date),
            "p_end_date": str(end_date),
            "p_model_version": model_version,
            "p_venue_id": venue_id,
        }
    )

    # Alternative: Use the view directly
    query = supabase.from_("forecast_vs_actual") \
        .select("*") \
        .gte("business_date", str(start_date)) \
        .lte("business_date", str(end_date)) \
        .eq("model_version", model_version)

    if venue_id:
        query = query.eq("venue_id", venue_id)

    response = query.execute()

    if not response.data:
        print("[WARN] No forecast vs actual data found")
        return

    df = pd.DataFrame(response.data)

    # Filter to only days with actuals
    df = df[df["actual"].notna() & (df["actual"] > 0)]

    if df.empty:
        print("[WARN] No days with non-zero actuals found")
        return

    print(f"[INFO] Found {len(df)} forecast-actual pairs")

    # Compute metrics by venue and forecast_type
    results = []
    for (vid, ftype), group in df.groupby(["venue_id", "forecast_type"]):
        if len(group) < 3:
            print(f"[SKIP] {vid} {ftype}: only {len(group)} days")
            continue

        # Error calculations
        errors = group["predicted"].values - group["actual"].values
        abs_errors = np.abs(errors)
        pct_errors = abs_errors / group["actual"].values * 100

        # Metrics
        mape = np.mean(pct_errors) / 100
        mae = np.mean(abs_errors)
        rmse = np.sqrt(np.mean(errors ** 2))
        median_error = np.median(abs_errors)

        # Interval coverage
        within = group["within_interval"].sum() if "within_interval" in group.columns else 0
        coverage = within / len(group) * 100

        result = {
            "venue_id": vid,
            "venue_name": group["venue_name"].iloc[0] if "venue_name" in group.columns else vid,
            "forecast_type": ftype,
            "model_version": model_version,
            "period_start": str(start_date),
            "period_end": str(end_date),
            "mape": round(mape, 4),
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
            "median_error": round(median_error, 2),
            "interval_coverage": round(coverage, 2),
            "days_evaluated": len(group),
        }
        results.append(result)

        # Print summary
        print(f"\n[{result['venue_name']}] {ftype.upper()}")
        print(f"  MAPE: {mape:.1%}")
        print(f"  MAE:  ${mae:,.2f}" if ftype == "net_sales" else f"  MAE:  {mae:.1f}")
        print(f"  Coverage: {coverage:.1f}% of actuals within prediction interval")
        print(f"  Days: {len(group)}")

    # Save to forecast_accuracy table
    if results:
        print(f"\n[INFO] Saving {len(results)} accuracy records...")
        for r in results:
            supabase.table("forecast_accuracy").upsert(
                r,
                on_conflict="venue_id,forecast_type,model_version,period_start,period_end"
            ).execute()
        print("[OK] Accuracy metrics saved")

    return results


def main():
    parser = argparse.ArgumentParser(
        description="Compute forecast accuracy metrics"
    )
    parser.add_argument(
        "--venue-id",
        type=str,
        help="Single venue UUID (default: all venues)"
    )
    parser.add_argument(
        "--weeks",
        type=int,
        default=1,
        help="Number of weeks to analyze (default: 1)"
    )
    parser.add_argument(
        "--model-version",
        type=str,
        default="prophet_v1_baseline",
        help="Model version to evaluate"
    )

    args = parser.parse_args()

    compute_accuracy_metrics(
        venue_id=args.venue_id,
        weeks_back=args.weeks,
        model_version=args.model_version
    )


if __name__ == "__main__":
    main()
