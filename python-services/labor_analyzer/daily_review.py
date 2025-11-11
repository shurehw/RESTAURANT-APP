"""
Daily Forecast Review Engine
Runs at 9am daily to review upcoming shifts and recommend adjustments
"""

import os
import sys
from datetime import datetime, timedelta, time
from typing import Dict, List, Optional
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase environment variables")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# Predictive Scheduling Laws - Penalty Costs
PENALTY_COSTS = {
    'cut_less_than_24h': 50,      # Cut with <24h notice = show-up pay (4hrs min)
    'cut_less_than_48h': 25,      # Cut with <48h notice = predictability pay
    'add_less_than_14d': 0,       # Adding shifts = no penalty (employees love more hours)
    'modify_less_than_24h': 25,   # Modify shift = $25 predictability pay
}


class DailyForecastReview:
    """Reviews forecasts daily and recommends schedule adjustments"""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.labor_targets = self._load_labor_targets()
        self.positions = self._load_positions()

    def _load_labor_targets(self) -> Dict:
        """Load labor % targets"""
        response = supabase.table('labor_targets') \
            .select('*') \
            .eq('venue_id', self.venue_id) \
            .eq('is_active', True) \
            .limit(1) \
            .execute()

        if response.data:
            return response.data[0]
        return {
            'target_labor_percentage': 27.5,
            'min_labor_percentage': 27.0,
            'max_labor_percentage': 28.0
        }

    def _load_positions(self) -> Dict[str, Dict]:
        """Load positions"""
        response = supabase.table('positions') \
            .select('*') \
            .eq('venue_id', self.venue_id) \
            .eq('is_active', True) \
            .execute()

        return {p['id']: p for p in response.data}

    def run_daily_review(self, review_window_hours: int = 48):
        """
        Main daily review process
        Runs at 9am to review shifts in next 24-72 hours
        """
        now = datetime.now()
        review_start = now
        review_end = now + timedelta(hours=review_window_hours)

        print(f"\n{'='*70}")
        print(f"🔍 DAILY FORECAST REVIEW - {now.strftime('%A, %B %d, %Y at %I:%M %p')}")
        print(f"{'='*70}\n")
        print(f"📅 Reviewing shifts from now until {review_end.strftime('%A, %B %d at %I:%M %p')}")
        print(f"   Review window: {review_window_hours} hours\n")

        # Get scheduled shifts in review window
        shifts = self._get_upcoming_shifts(review_start, review_end)

        if not shifts:
            print("✅ No scheduled shifts found in review window")
            return []

        print(f"📋 Found {len(shifts)} scheduled shifts to review\n")

        adjustments = []

        # Review each shift
        for shift in shifts:
            adjustment = self._review_shift(shift, now)
            if adjustment:
                adjustments.append(adjustment)

        # Filter adjustments with net benefit > $50
        profitable_adjustments = [
            adj for adj in adjustments
            if adj['net_benefit'] >= 50
        ]

        print(f"\n{'='*70}")
        print(f"📊 REVIEW SUMMARY")
        print(f"{'='*70}")
        print(f"   Shifts reviewed: {len(shifts)}")
        print(f"   Adjustments identified: {len(adjustments)}")
        print(f"   Profitable adjustments (net benefit ≥ $50): {len(profitable_adjustments)}")

        if profitable_adjustments:
            total_savings = sum(adj['net_benefit'] for adj in profitable_adjustments)
            print(f"   💰 Total potential savings: ${total_savings:.2f}")
            print(f"\n   Recommended actions:")
            for adj in profitable_adjustments:
                print(f"      • {adj['adjustment_type'].upper()}: {adj['employee_name']} "
                      f"({adj['position']}) - Net benefit: ${adj['net_benefit']:.2f}")
        else:
            print(f"   ✅ No adjustments needed - all shifts are optimized")

        print(f"{'='*70}\n")

        # Save adjustments to database
        if profitable_adjustments:
            self._save_adjustments(profitable_adjustments)

        return profitable_adjustments

    def _get_upcoming_shifts(self, start: datetime, end: datetime) -> List[Dict]:
        """Get all scheduled shifts in the review window"""
        response = supabase.table('shift_assignments') \
            .select(`
                *,
                employee:employees(id, first_name, last_name),
                position:positions(id, name, base_hourly_rate),
                schedule:weekly_schedules(id, status)
            `) \
            .eq('venue_id', self.venue_id) \
            .eq('status', 'scheduled') \
            .gte('scheduled_start', start.isoformat()) \
            .lte('scheduled_start', end.isoformat()) \
            .execute()

        return response.data or []

    def _review_shift(self, shift: Dict, now: datetime) -> Optional[Dict]:
        """
        Review a single shift and determine if adjustment is needed
        """
        shift_start = datetime.fromisoformat(shift['scheduled_start'])
        hours_until_shift = (shift_start - now).total_seconds() / 3600

        # Get latest forecast for this shift
        latest_forecast = self._get_latest_forecast(
            shift['business_date'],
            shift['shift_type']
        )

        if not latest_forecast:
            return None

        # Get original forecast (when schedule was created)
        original_forecast = self._get_original_forecast(
            shift['schedule_id'],
            shift['business_date'],
            shift['shift_type']
        )

        if not original_forecast:
            return None

        # Calculate variance
        covers_variance = latest_forecast['covers_predicted'] - original_forecast['covers_predicted']
        variance_pct = (covers_variance / original_forecast['covers_predicted'] * 100) if original_forecast['covers_predicted'] > 0 else 0

        # Significant variance threshold: ±15%
        if abs(variance_pct) < 15:
            return None

        # Determine adjustment type
        if variance_pct < -15:
            # Forecast decreased significantly - consider cutting
            return self._evaluate_cut(shift, latest_forecast, hours_until_shift, variance_pct)
        elif variance_pct > 15:
            # Forecast increased significantly - consider adding
            return self._evaluate_add(shift, latest_forecast, hours_until_shift, variance_pct)

        return None

    def _get_latest_forecast(self, business_date: str, shift_type: str) -> Optional[Dict]:
        """Get most recent forecast for a shift"""
        response = supabase.table('demand_forecasts') \
            .select('*') \
            .eq('venue_id', self.venue_id) \
            .eq('business_date', business_date) \
            .eq('shift_type', shift_type) \
            .order('created_at', desc=True) \
            .limit(1) \
            .execute()

        return response.data[0] if response.data else None

    def _get_original_forecast(self, schedule_id: str, business_date: str, shift_type: str) -> Optional[Dict]:
        """Get forecast that was used when creating the schedule"""
        # Get schedule creation time
        schedule_response = supabase.table('weekly_schedules') \
            .select('generated_at') \
            .eq('id', schedule_id) \
            .single() \
            .execute()

        if not schedule_response.data:
            return None

        generated_at = schedule_response.data['generated_at']

        # Get forecast closest to schedule generation time
        response = supabase.table('demand_forecasts') \
            .select('*') \
            .eq('venue_id', self.venue_id) \
            .eq('business_date', business_date) \
            .eq('shift_type', shift_type) \
            .lte('created_at', generated_at) \
            .order('created_at', desc=True) \
            .limit(1) \
            .execute()

        return response.data[0] if response.data else None

    def _evaluate_cut(self, shift: Dict, forecast: Dict, hours_until: float, variance_pct: float) -> Optional[Dict]:
        """Evaluate if cutting this shift makes financial sense"""

        # Calculate labor savings
        hourly_rate = shift['position']['base_hourly_rate']
        shift_hours = shift['scheduled_hours']
        labor_savings = shift_hours * hourly_rate

        # Calculate penalty cost based on notice period
        if hours_until < 24:
            penalty_cost = PENALTY_COSTS['cut_less_than_24h']
        elif hours_until < 48:
            penalty_cost = PENALTY_COSTS['cut_less_than_48h']
        else:
            penalty_cost = 0

        net_benefit = labor_savings - penalty_cost

        # Only recommend if net benefit > $50
        if net_benefit < 50:
            return None

        return {
            'shift_id': shift['id'],
            'employee_id': shift['employee_id'],
            'employee_name': f"{shift['employee']['first_name']} {shift['employee']['last_name']}",
            'position': shift['position']['name'],
            'adjustment_type': 'cut',
            'business_date': shift['business_date'],
            'shift_type': shift['shift_type'],
            'scheduled_start': shift['scheduled_start'],
            'hours_until_shift': hours_until,
            'forecast_variance_pct': variance_pct,
            'original_covers': None,  # TODO: Get from original forecast
            'new_covers': forecast['covers_predicted'],
            'labor_savings': labor_savings,
            'penalty_cost': penalty_cost,
            'net_benefit': net_benefit,
            'reason': f"Forecast decreased {abs(variance_pct):.1f}% - covers dropped to {forecast['covers_predicted']}",
        }

    def _evaluate_add(self, shift: Dict, forecast: Dict, hours_until: float, variance_pct: float) -> Optional[Dict]:
        """Evaluate if adding staff makes sense (check if understaffed)"""

        # For adding staff, we need to check if current staffing is insufficient
        # This would require calculating required staff from latest forecast
        # For now, return None (adding staff is more complex)

        # TODO: Implement staff addition logic
        # - Get labor requirements from latest forecast
        # - Compare to scheduled staff count
        # - If understaffed, recommend adding

        return None

    def _save_adjustments(self, adjustments: List[Dict]):
        """Save recommended adjustments to database"""

        records = []
        for adj in adjustments:
            records.append({
                'venue_id': self.venue_id,
                'shift_id': adj['shift_id'],
                'adjustment_type': adj['adjustment_type'],
                'recommended_at': datetime.now().isoformat(),
                'hours_until_shift': adj['hours_until_shift'],
                'forecast_variance_pct': adj['forecast_variance_pct'],
                'labor_savings': adj['labor_savings'],
                'penalty_cost': adj['penalty_cost'],
                'net_benefit': adj['net_benefit'],
                'reason': adj['reason'],
                'status': 'pending',
            })

        supabase.table('schedule_adjustments').insert(records).execute()
        print(f"💾 Saved {len(records)} adjustment recommendations to database")


def main():
    """CLI entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Run daily forecast review')
    parser.add_argument('--venue-id', required=True, help='Venue ID')
    parser.add_argument('--window-hours', type=int, default=48, help='Review window in hours (default: 48)')

    args = parser.parse_args()

    reviewer = DailyForecastReview(args.venue_id)
    adjustments = reviewer.run_daily_review(args.window_hours)

    if adjustments:
        print(f"\n💡 Next steps:")
        print(f"   1. Review recommended adjustments at /labor/briefing")
        print(f"   2. Contact affected employees")
        print(f"   3. Update schedule in system")
    else:
        print(f"\n✅ No action needed - schedule is optimal!")


if __name__ == '__main__':
    main()
