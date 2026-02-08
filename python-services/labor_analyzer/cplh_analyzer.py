"""
CPLH (Covers Per Labor Hour) Analyzer
Analyzes historical performance to set data-driven CPLH targets by position, shift, and day of week
Compares results to industry benchmarks for fine dining
"""

import os
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import pandas as pd
import numpy as np
import json

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client, Client

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase environment variables")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Industry benchmarks for fine dining (covers per labor hour)
INDUSTRY_BENCHMARKS = {
    'Server': {
        'breakfast': {'min': 8.0, 'target': 10.0, 'optimal': 12.0, 'max': 14.0},
        'lunch': {'min': 8.0, 'target': 10.0, 'optimal': 11.5, 'max': 13.0},
        'dinner': {'min': 7.0, 'target': 9.0, 'optimal': 10.5, 'max': 12.0},
        'late_night': {'min': 6.0, 'target': 8.0, 'optimal': 9.5, 'max': 11.0},
    },
    'Busser': {
        'breakfast': {'min': 12.0, 'target': 14.0, 'optimal': 16.0, 'max': 18.0},
        'lunch': {'min': 10.0, 'target': 12.0, 'optimal': 14.0, 'max': 16.0},
        'dinner': {'min': 8.0, 'target': 10.0, 'optimal': 12.0, 'max': 14.0},
        'late_night': {'min': 8.0, 'target': 10.0, 'optimal': 11.0, 'max': 13.0},
    },
    'Food Runner': {
        'breakfast': {'min': 10.0, 'target': 12.0, 'optimal': 14.0, 'max': 16.0},
        'lunch': {'min': 10.0, 'target': 12.0, 'optimal': 13.0, 'max': 15.0},
        'dinner': {'min': 8.0, 'target': 10.0, 'optimal': 11.0, 'max': 13.0},
        'late_night': {'min': 7.0, 'target': 9.0, 'optimal': 10.0, 'max': 12.0},
    },
    'Line Cook': {
        'breakfast': {'min': 6.0, 'target': 8.0, 'optimal': 9.0, 'max': 10.0},
        'lunch': {'min': 6.0, 'target': 8.0, 'optimal': 9.0, 'max': 10.0},
        'dinner': {'min': 5.0, 'target': 7.0, 'optimal': 8.0, 'max': 9.0},
        'late_night': {'min': 5.0, 'target': 6.0, 'optimal': 7.0, 'max': 8.0},
    },
    'Prep Cook': {
        'breakfast': {'min': 4.0, 'target': 6.0, 'optimal': 7.0, 'max': 8.0},
        'lunch': {'min': 4.0, 'target': 6.0, 'optimal': 7.0, 'max': 8.0},
        'dinner': {'min': 4.0, 'target': 5.0, 'optimal': 6.0, 'max': 7.0},
        'late_night': {'min': 3.0, 'target': 5.0, 'optimal': 6.0, 'max': 7.0},
    },
}


class CPLHAnalyzer:
    """Analyzes historical CPLH to set data-driven targets"""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.historical_data = None
        self.targets = []

    def fetch_historical_data(self, days_back: int = 180) -> pd.DataFrame:
        """
        Fetch historical CPLH data from materialized view
        Includes actual shifts worked and covers served
        """
        print(f"\n📊 Fetching historical data (last {days_back} days)...")

        cutoff_date = (datetime.now() - timedelta(days=days_back)).date()

        # Use the materialized view we created
        response = supabase.rpc(
            'calculate_cplh_percentiles',
            {
                'p_venue_id': self.venue_id,
                'p_position_id': None,  # Get all positions
                'p_shift_type': None,   # Get all shifts
                'p_day_of_week': None,  # Get all days
                'p_lookback_days': days_back
            }
        ).execute()

        if not response.data:
            # Fallback: query the materialized view directly
            print("  Using materialized view fallback...")
            response = supabase.table('cplh_by_position_shift') \
                .select('*') \
                .eq('venue_id', self.venue_id) \
                .gte('business_date', cutoff_date.isoformat()) \
                .execute()

            if not response.data:
                print("  ⚠️  No historical data found")
                return pd.DataFrame()

            df = pd.DataFrame(response.data)

            # Calculate CPLH if not already present
            if 'covers_per_labor_hour' not in df.columns:
                df['covers_per_labor_hour'] = df['total_covers'] / df['total_labor_hours'].replace(0, np.nan)

            self.historical_data = df
            print(f"  ✓ Loaded {len(df)} historical shift records")
            return df

        # Data from RPC function
        df = pd.DataFrame(response.data)
        self.historical_data = df
        print(f"  ✓ Loaded CPLH percentiles for {len(df)} position/shift combinations")
        return df

    def calculate_percentiles(self) -> pd.DataFrame:
        """
        Calculate CPLH percentiles by position, shift type, and day of week
        Returns targets: p25 (min), p50 (target), p75 (optimal), p90 (max)
        """
        if self.historical_data is None or len(self.historical_data) == 0:
            print("⚠️  No historical data to analyze")
            return pd.DataFrame()

        print("\n📈 Calculating CPLH percentiles...")

        df = self.historical_data.copy()

        # Filter out invalid data
        df = df[df['covers_per_labor_hour'].notna()]
        df = df[df['covers_per_labor_hour'] > 0]
        df = df[df['total_labor_hours'] > 0]

        # Group by position, shift type, and day of week
        groups = df.groupby(['position_name', 'shift_type', 'day_of_week'])

        results = []
        for (position, shift, dow), group in groups:
            if len(group) < 5:  # Need at least 5 data points for statistical validity
                continue

            cplh_values = group['covers_per_labor_hour']

            # Calculate percentiles
            p25 = cplh_values.quantile(0.25)
            p50 = cplh_values.quantile(0.50)  # Median
            p75 = cplh_values.quantile(0.75)
            p90 = cplh_values.quantile(0.90)

            # Covers range for context
            covers_min = group['total_covers'].min()
            covers_max = group['total_covers'].max()

            results.append({
                'position_name': position,
                'shift_type': shift,
                'day_of_week': dow,
                'sample_size': len(group),
                'min_cplh': round(p25, 2),
                'target_cplh': round(p50, 2),
                'optimal_cplh': round(p75, 2),
                'max_cplh': round(p90, 2),
                'avg_cplh': round(cplh_values.mean(), 2),
                'covers_range_min': int(covers_min),
                'covers_range_max': int(covers_max),
                'source': 'historical'
            })

        results_df = pd.DataFrame(results)
        print(f"  ✓ Calculated percentiles for {len(results_df)} combinations")

        return results_df

    def compare_to_benchmarks(self, percentiles_df: pd.DataFrame) -> pd.DataFrame:
        """
        Compare historical CPLH to industry benchmarks
        Use hybrid approach: historical data with benchmark validation
        """
        print("\n🎯 Comparing to industry benchmarks...")

        enhanced = []

        for _, row in percentiles_df.iterrows():
            position = row['position_name']
            shift = row['shift_type']

            # Get industry benchmark for this position/shift
            benchmark = INDUSTRY_BENCHMARKS.get(position, {}).get(shift, None)

            if benchmark:
                # Hybrid approach: Use historical if reasonable, otherwise use benchmark
                # "Reasonable" means within 30% of benchmark target

                historical_target = row['target_cplh']
                benchmark_target = benchmark['target']

                variance_pct = abs(historical_target - benchmark_target) / benchmark_target

                if variance_pct <= 0.30:  # Within 30% of benchmark
                    # Use historical data (it's reasonable)
                    source = 'historical'
                    targets = {
                        'min_cplh': row['min_cplh'],
                        'target_cplh': row['target_cplh'],
                        'optimal_cplh': row['optimal_cplh'],
                        'max_cplh': row['max_cplh'],
                    }
                else:
                    # Historical data is too far from benchmark - use hybrid
                    # Take average of historical and benchmark
                    source = 'hybrid'
                    targets = {
                        'min_cplh': round((row['min_cplh'] + benchmark['min']) / 2, 2),
                        'target_cplh': round((row['target_cplh'] + benchmark['target']) / 2, 2),
                        'optimal_cplh': round((row['optimal_cplh'] + benchmark['optimal']) / 2, 2),
                        'max_cplh': round((row['max_cplh'] + benchmark['max']) / 2, 2),
                    }

                benchmark_source = 'NRA Fine Dining 2026'
            else:
                # No benchmark for this position - use historical only
                source = 'historical'
                targets = {
                    'min_cplh': row['min_cplh'],
                    'target_cplh': row['target_cplh'],
                    'optimal_cplh': row['optimal_cplh'],
                    'max_cplh': row['max_cplh'],
                }
                benchmark_source = None

            enhanced.append({
                **row.to_dict(),
                **targets,
                'source': source,
                'benchmark_source': benchmark_source
            })

        enhanced_df = pd.DataFrame(enhanced)
        print(f"  ✓ Enhanced {len(enhanced_df)} targets with benchmark comparison")

        # Show breakdown by source
        source_counts = enhanced_df['source'].value_counts()
        print(f"  📊 Sources: {source_counts.to_dict()}")

        return enhanced_df

    def save_targets(self, targets_df: pd.DataFrame) -> int:
        """
        Save CPLH targets to database
        Returns number of targets saved
        """
        print("\n💾 Saving targets to database...")

        if len(targets_df) == 0:
            print("  ⚠️  No targets to save")
            return 0

        # Get position IDs
        positions_response = supabase.table('positions') \
            .select('id, name') \
            .eq('venue_id', self.venue_id) \
            .execute()

        position_map = {p['name']: p['id'] for p in positions_response.data}

        saved_count = 0
        errors = []

        for _, row in targets_df.iterrows():
            position_id = position_map.get(row['position_name'])

            if not position_id:
                errors.append(f"Position '{row['position_name']}' not found")
                continue

            target_record = {
                'venue_id': self.venue_id,
                'position_id': position_id,
                'shift_type': row['shift_type'],
                'day_of_week': int(row['day_of_week']) if pd.notna(row['day_of_week']) else None,
                'target_cplh': float(row['target_cplh']),
                'min_cplh': float(row['min_cplh']),
                'optimal_cplh': float(row['optimal_cplh']),
                'max_cplh': float(row['max_cplh']),
                'covers_range_min': int(row['covers_range_min']) if 'covers_range_min' in row else None,
                'covers_range_max': int(row['covers_range_max']) if 'covers_range_max' in row else None,
                'source': row['source'],
                'historical_sample_size': int(row['sample_size']) if 'sample_size' in row else None,
                'benchmark_source': row.get('benchmark_source'),
                'effective_from': datetime.now().date().isoformat(),
                'is_active': True
            }

            try:
                # Upsert (insert or update if exists)
                response = supabase.table('covers_per_labor_hour_targets').upsert(
                    target_record,
                    on_conflict='venue_id,position_id,shift_type,day_of_week,effective_from'
                ).execute()

                saved_count += 1
            except Exception as e:
                errors.append(f"{row['position_name']} {row['shift_type']}: {str(e)}")

        print(f"  ✓ Saved {saved_count} CPLH targets")

        if errors:
            print(f"  ⚠️  {len(errors)} errors:")
            for error in errors[:5]:  # Show first 5 errors
                print(f"    - {error}")

        return saved_count

    def run_analysis(self, days_back: int = 180, save: bool = True) -> pd.DataFrame:
        """
        Complete CPLH analysis workflow:
        1. Fetch historical data
        2. Calculate percentiles
        3. Compare to benchmarks
        4. Save targets (if save=True)
        """
        print("=" * 60)
        print("🔍 CPLH TARGET ANALYSIS")
        print("=" * 60)
        print(f"Venue ID: {self.venue_id}")
        print(f"Lookback: {days_back} days")
        print()

        # Step 1: Fetch data
        historical = self.fetch_historical_data(days_back=days_back)

        if len(historical) == 0:
            print("\n❌ No historical data available - cannot set targets")
            print("💡 Tip: Use industry benchmarks or manually set targets")
            return pd.DataFrame()

        # Step 2: Calculate percentiles
        percentiles = self.calculate_percentiles()

        if len(percentiles) == 0:
            print("\n❌ Insufficient data to calculate percentiles")
            return pd.DataFrame()

        # Step 3: Compare to benchmarks
        final_targets = self.compare_to_benchmarks(percentiles)

        # Step 4: Save targets
        if save:
            saved = self.save_targets(final_targets)
            print(f"\n✅ Analysis complete! {saved} targets saved to database")
        else:
            print("\n✅ Analysis complete! Targets calculated (not saved)")

        # Summary
        print("\n" + "=" * 60)
        print("📋 SUMMARY")
        print("=" * 60)
        print(final_targets[['position_name', 'shift_type', 'min_cplh', 'target_cplh', 'optimal_cplh', 'max_cplh', 'source']].to_string(index=False))
        print()

        return final_targets


def main():
    """CLI entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Analyze historical CPLH and set targets')
    parser.add_argument('venue_id', help='Venue ID to analyze')
    parser.add_argument('--days', type=int, default=180, help='Days of historical data to analyze (default: 180)')
    parser.add_argument('--no-save', action='store_true', help='Calculate targets but don\'t save to database')
    parser.add_argument('--export', type=str, help='Export results to CSV file')

    args = parser.parse_args()

    analyzer = CPLHAnalyzer(args.venue_id)
    targets = analyzer.run_analysis(days_back=args.days, save=not args.no_save)

    if args.export and len(targets) > 0:
        targets.to_csv(args.export, index=False)
        print(f"📄 Exported to {args.export}")


if __name__ == '__main__':
    main()
