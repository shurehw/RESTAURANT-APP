"""
Historical Staffing Analyzer
Analyzes past shifts to learn optimal staffing patterns using machine learning
"""

import os
import sys
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
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


class StaffingAnalyzer:
    """Analyzes historical staffing data to learn optimal patterns"""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.models: Dict[str, RandomForestRegressor] = {}
        self.patterns: List[Dict] = []

    def fetch_historical_data(self, days_back: int = 180) -> pd.DataFrame:
        """
        Fetch historical shifts with demand data
        Combines actual_shifts_worked with demand_history
        """
        cutoff_date = (datetime.now() - timedelta(days=days_back)).date()

        # Fetch actual shifts worked
        response = supabase.table('actual_shifts_worked') \
            .select('*, position:positions(name, category), employee:employees(performance_rating)') \
            .eq('venue_id', self.venue_id) \
            .gte('business_date', cutoff_date.isoformat()) \
            .is_('clock_out', 'not.null') \
            .execute()

        shifts = response.data

        # Fetch demand history
        demand_response = supabase.table('demand_history') \
            .select('business_date, shift_type, covers, revenue, day_of_week') \
            .eq('venue_id', self.venue_id) \
            .gte('business_date', cutoff_date.isoformat()) \
            .execute()

        demand = demand_response.data

        if not shifts or not demand:
            print("⚠️  No historical data found")
            return pd.DataFrame()

        # Convert to DataFrames
        shifts_df = pd.DataFrame(shifts)
        demand_df = pd.DataFrame(demand)

        # Aggregate shifts by date/shift_type/position
        shifts_df['actual_hours'] = pd.to_numeric(shifts_df['actual_hours'], errors='coerce')
        shifts_df['total_compensation'] = pd.to_numeric(shifts_df['total_compensation'], errors='coerce')

        agg_shifts = shifts_df.groupby(['business_date', 'shift_type', 'position_id']).agg({
            'employee_id': 'count',  # Number of employees
            'actual_hours': 'sum',   # Total hours worked
            'total_compensation': 'sum',  # Total labor cost
            'covers_served': 'sum',
        }).reset_index()

        agg_shifts.rename(columns={'employee_id': 'employees_worked'}, inplace=True)

        # Add position names
        position_map = {s['position_id']: s['position']['name'] for s in shifts if s.get('position')}
        agg_shifts['position_name'] = agg_shifts['position_id'].map(position_map)

        # Merge with demand data
        merged = pd.merge(
            agg_shifts,
            demand_df,
            on=['business_date', 'shift_type'],
            how='inner'
        )

        # Calculate metrics
        merged['labor_percentage'] = (merged['total_compensation'] / merged['revenue'] * 100).round(2)
        merged['covers_per_employee'] = (merged['covers'] / merged['employees_worked']).round(2)
        merged['hours_per_cover'] = (merged['actual_hours'] / merged['covers']).round(3)

        return merged

    def analyze_position_patterns(self, df: pd.DataFrame, position_name: str) -> List[Dict]:
        """
        Analyze staffing patterns for a specific position
        Creates tiered buckets based on cover ranges
        """
        position_data = df[df['position_name'] == position_name].copy()

        if len(position_data) < 10:
            print(f"⚠️  Not enough data for {position_name} (need 10+ shifts, found {len(position_data)})")
            return []

        # Filter for "good" shifts (labor % within target, no extreme outliers)
        labor_target = 27.5
        position_data = position_data[
            (position_data['labor_percentage'] >= 20) &
            (position_data['labor_percentage'] <= 35)
        ]

        if len(position_data) < 5:
            print(f"⚠️  Not enough quality data for {position_name} after filtering")
            return []

        patterns = []

        # Group by shift type and day of week
        for shift_type in position_data['shift_type'].unique():
            shift_data = position_data[position_data['shift_type'] == shift_type]

            # Create cover range buckets
            covers_min = shift_data['covers'].min()
            covers_max = shift_data['covers'].max()

            # Dynamic buckets based on data distribution
            if covers_max - covers_min < 50:
                # Small range - use 2 buckets
                buckets = [covers_min, (covers_min + covers_max) / 2, covers_max]
            else:
                # Larger range - use quartiles
                buckets = [
                    covers_min,
                    shift_data['covers'].quantile(0.33),
                    shift_data['covers'].quantile(0.66),
                    covers_max
                ]

            # Analyze each bucket
            for i in range(len(buckets) - 1):
                bucket_data = shift_data[
                    (shift_data['covers'] >= buckets[i]) &
                    (shift_data['covers'] < buckets[i + 1])
                ]

                if len(bucket_data) < 2:
                    continue

                avg_employees = bucket_data['employees_worked'].median()
                avg_labor_pct = bucket_data['labor_percentage'].median()
                confidence = min(len(bucket_data) / 20.0, 1.0)  # More samples = higher confidence

                patterns.append({
                    'position_name': position_name,
                    'shift_type': shift_type,
                    'day_of_week': None,  # Average across all days
                    'covers_min': int(buckets[i]),
                    'covers_max': int(buckets[i + 1]),
                    'employees_recommended': int(round(avg_employees)),
                    'avg_labor_percentage': float(avg_labor_pct),
                    'confidence_score': float(confidence),
                    'sample_size': len(bucket_data),
                    'analyzed_shifts': len(shift_data),
                })

        return patterns

    def train_ml_model(self, df: pd.DataFrame, position_name: str) -> RandomForestRegressor:
        """
        Train ML model to predict employees needed
        Features: covers, shift_type, day_of_week, revenue
        Target: employees_worked
        """
        position_data = df[df['position_name'] == position_name].copy()

        if len(position_data) < 20:
            raise ValueError(f"Not enough data to train model for {position_name}")

        # Prepare features
        position_data['shift_type_encoded'] = pd.Categorical(position_data['shift_type']).codes
        position_data['day_of_week'] = pd.to_numeric(position_data['day_of_week'], errors='coerce')

        X = position_data[['covers', 'revenue', 'shift_type_encoded', 'day_of_week']].fillna(0)
        y = position_data['employees_worked']

        # Train/test split
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # Train Random Forest
        model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
        model.fit(X_train, y_train)

        # Evaluate
        y_pred = model.predict(X_test)
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)

        print(f"✅ {position_name} model trained - MAE: {mae:.2f}, R²: {r2:.3f}")

        return model

    def analyze_all_positions(self) -> List[Dict]:
        """
        Main analysis function
        Returns all staffing patterns learned from historical data
        """
        print(f"📊 Analyzing staffing patterns for venue {self.venue_id}...")

        # Fetch historical data
        df = self.fetch_historical_data(days_back=180)

        if df.empty:
            print("❌ No historical data available")
            return []

        print(f"📈 Loaded {len(df)} historical shift records")

        all_patterns = []

        # Analyze each position
        positions = df['position_name'].unique()

        for position in positions:
            print(f"\n🔍 Analyzing {position}...")

            try:
                # Pattern-based analysis
                patterns = self.analyze_position_patterns(df, position)
                all_patterns.extend(patterns)

                # Train ML model
                model = self.train_ml_model(df, position)
                self.models[position] = model

            except Exception as e:
                print(f"⚠️  Error analyzing {position}: {e}")
                continue

        return all_patterns

    def save_patterns_to_db(self, patterns: List[Dict]):
        """Save learned patterns to staffing_patterns table"""
        if not patterns:
            print("No patterns to save")
            return

        # Get position IDs
        positions_response = supabase.table('positions') \
            .select('id, name') \
            .eq('venue_id', self.venue_id) \
            .execute()

        position_map = {p['name']: p['id'] for p in positions_response.data}

        # Prepare records
        records = []
        model_version = f"v1_{datetime.now().strftime('%Y%m%d')}"

        for pattern in patterns:
            position_id = position_map.get(pattern['position_name'])
            if not position_id:
                continue

            records.append({
                'venue_id': self.venue_id,
                'position_id': position_id,
                'shift_type': pattern['shift_type'],
                'day_of_week': pattern['day_of_week'],
                'covers_min': pattern['covers_min'],
                'covers_max': pattern['covers_max'],
                'employees_recommended': pattern['employees_recommended'],
                'avg_labor_percentage': pattern['avg_labor_percentage'],
                'confidence_score': pattern['confidence_score'],
                'sample_size': pattern['sample_size'],
                'analyzed_shifts': pattern['analyzed_shifts'],
                'date_range_start': (datetime.now() - timedelta(days=180)).date().isoformat(),
                'date_range_end': datetime.now().date().isoformat(),
                'model_version': model_version,
                'is_active': True,
            })

        # Deactivate old patterns
        supabase.table('staffing_patterns') \
            .update({'is_active': False}) \
            .eq('venue_id', self.venue_id) \
            .execute()

        # Insert new patterns
        supabase.table('staffing_patterns').insert(records).execute()

        print(f"\n✅ Saved {len(records)} staffing patterns to database")


def main():
    """Main execution"""
    import argparse

    parser = argparse.ArgumentParser(description='Analyze historical staffing patterns')
    parser.add_argument('--venue-id', required=True, help='Venue ID to analyze')
    parser.add_argument('--days-back', type=int, default=180, help='Days of history to analyze')

    args = parser.parse_args()

    analyzer = StaffingAnalyzer(args.venue_id)
    patterns = analyzer.analyze_all_positions()

    if patterns:
        print(f"\n📋 Summary of learned patterns:")
        for p in patterns:
            print(f"  {p['position_name']} ({p['shift_type']}): {p['covers_min']}-{p['covers_max']} covers → {p['employees_recommended']} employees (confidence: {p['confidence_score']:.0%})")

        # Save to database
        analyzer.save_patterns_to_db(patterns)
    else:
        print("\n❌ No patterns learned - need more historical data")


if __name__ == '__main__':
    main()
