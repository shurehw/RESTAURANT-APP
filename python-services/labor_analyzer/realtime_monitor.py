"""
Real-Time Shift Monitor
Tracks actual performance vs forecast every 15 minutes during service
Recommends cuts/adds in real-time based on actual pace
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


class RealtimeShiftMonitor:
    """Monitors shifts in real-time and recommends adjustments"""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.labor_targets = self._load_labor_targets()

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

    def capture_snapshot(self, actual_covers: int, actual_revenue: float):
        """
        Capture a 15-minute snapshot during service
        Compare actual performance to forecast
        """
        now = datetime.now()
        business_date = now.date().isoformat()

        # Determine current shift
        shift_type = self._determine_shift_type(now.time())

        if not shift_type:
            print(f"⚠️  Not currently during a service period")
            return None

        print(f"\n{'='*70}")
        print(f"📸 REAL-TIME SNAPSHOT - {now.strftime('%I:%M %p')}")
        print(f"{'='*70}\n")
        print(f"📅 {business_date} ({shift_type} shift)")
        print(f"📊 Actual so far: {actual_covers} covers, ${actual_revenue:.2f} revenue\n")

        # Get forecast for today's shift
        forecast = self._get_forecast(business_date, shift_type)

        if not forecast:
            print(f"⚠️  No forecast found for {shift_type} shift on {business_date}")
            return None

        # Get currently clocked-in staff
        current_staff = self._get_current_staff(now)

        # Calculate metrics
        shift_progress = self._calculate_shift_progress(now.time(), shift_type)
        expected_covers_by_now = forecast['covers_predicted'] * shift_progress
        expected_revenue_by_now = (forecast['revenue_predicted'] or 0) * shift_progress

        covers_variance = actual_covers - expected_covers_by_now
        covers_variance_pct = (covers_variance / expected_covers_by_now * 100) if expected_covers_by_now > 0 else 0

        revenue_variance = actual_revenue - expected_revenue_by_now
        revenue_variance_pct = (revenue_variance / expected_revenue_by_now * 100) if expected_revenue_by_now > 0 else 0

        # Calculate labor metrics
        total_labor_cost = sum(
            staff['scheduled_hours'] * staff['position']['base_hourly_rate']
            for staff in current_staff
        )

        if actual_revenue > 0:
            current_labor_pct = (total_labor_cost / actual_revenue) * 100
        else:
            current_labor_pct = 0

        # Projected end-of-shift metrics (extrapolate current pace)
        if shift_progress > 0:
            projected_covers = actual_covers / shift_progress
            projected_revenue = actual_revenue / shift_progress
            projected_labor_pct = (total_labor_cost / projected_revenue * 100) if projected_revenue > 0 else 0
        else:
            projected_covers = forecast['covers_predicted']
            projected_revenue = forecast['revenue_predicted'] or 0
            projected_labor_pct = 0

        print(f"📈 PERFORMANCE vs FORECAST")
        print(f"   Shift progress: {shift_progress*100:.0f}%")
        print(f"   Expected covers by now: {expected_covers_by_now:.0f}")
        print(f"   Actual covers: {actual_covers}")
        print(f"   Variance: {covers_variance:+.0f} ({covers_variance_pct:+.1f}%)")
        print(f"\n   Expected revenue by now: ${expected_revenue_by_now:.2f}")
        print(f"   Actual revenue: ${actual_revenue:.2f}")
        print(f"   Variance: ${revenue_variance:+.2f} ({revenue_variance_pct:+.1f}%)")
        print(f"\n💰 LABOR METRICS")
        print(f"   Current staff: {len(current_staff)}")
        print(f"   Labor cost: ${total_labor_cost:.2f}")
        print(f"   Current labor %: {current_labor_pct:.1f}%")
        print(f"   Target labor %: {self.labor_targets['target_labor_percentage']:.1f}%")
        print(f"\n🔮 END-OF-SHIFT PROJECTION")
        print(f"   Projected covers: {projected_covers:.0f} (forecast: {forecast['covers_predicted']})")
        print(f"   Projected revenue: ${projected_revenue:.2f} (forecast: ${forecast['revenue_predicted'] or 0:.2f})")
        print(f"   Projected labor %: {projected_labor_pct:.1f}%")

        # Determine recommendations
        recommendations = self._generate_recommendations(
            current_staff,
            projected_labor_pct,
            covers_variance_pct,
            shift_progress,
            now
        )

        # Save snapshot
        snapshot_id = self._save_snapshot({
            'venue_id': self.venue_id,
            'business_date': business_date,
            'shift_type': shift_type,
            'snapshot_time': now.isoformat(),
            'shift_progress': shift_progress,
            'actual_covers': actual_covers,
            'actual_revenue': actual_revenue,
            'expected_covers': expected_covers_by_now,
            'expected_revenue': expected_revenue_by_now,
            'covers_variance_pct': covers_variance_pct,
            'revenue_variance_pct': revenue_variance_pct,
            'staff_count': len(current_staff),
            'labor_cost': total_labor_cost,
            'labor_percentage': current_labor_pct,
            'projected_covers': projected_covers,
            'projected_revenue': projected_revenue,
            'projected_labor_percentage': projected_labor_pct,
        })

        if recommendations:
            print(f"\n⚠️  RECOMMENDATIONS")
            for rec in recommendations:
                print(f"   • {rec['type'].upper()}: {rec['message']}")
            self._save_recommendations(snapshot_id, recommendations)
        else:
            print(f"\n✅ ON TRACK - No adjustments needed")

        print(f"\n{'='*70}\n")

        return snapshot_id

    def _determine_shift_type(self, current_time: time) -> Optional[str]:
        """Determine which shift is currently active"""
        hour = current_time.hour

        if 7 <= hour < 11:
            return 'breakfast'
        elif 11 <= hour < 16:
            return 'lunch'
        elif 17 <= hour < 23:
            return 'dinner'
        elif 22 <= hour or hour < 3:
            return 'late_night'
        else:
            return None

    def _calculate_shift_progress(self, current_time: time, shift_type: str) -> float:
        """Calculate how far through the shift we are (0.0 to 1.0)"""

        # Shift time windows
        shifts = {
            'breakfast': (time(7, 0), time(14, 0)),   # 7am-2pm
            'lunch': (time(11, 0), time(16, 0)),      # 11am-4pm
            'dinner': (time(17, 0), time(23, 0)),     # 5pm-11pm
            'late_night': (time(22, 0), time(2, 0)),  # 10pm-2am
        }

        if shift_type not in shifts:
            return 0.0

        start, end = shifts[shift_type]

        # Convert times to minutes since midnight
        current_mins = current_time.hour * 60 + current_time.minute
        start_mins = start.hour * 60 + start.minute
        end_mins = end.hour * 60 + end.minute

        # Handle overnight shifts
        if end_mins < start_mins:
            end_mins += 24 * 60
            if current_mins < start_mins:
                current_mins += 24 * 60

        if current_mins < start_mins:
            return 0.0

        shift_duration = end_mins - start_mins
        elapsed = current_mins - start_mins

        progress = min(elapsed / shift_duration, 1.0)
        return progress

    def _get_forecast(self, business_date: str, shift_type: str) -> Optional[Dict]:
        """Get forecast for specific date/shift"""
        response = supabase.table('demand_forecasts') \
            .select('*') \
            .eq('venue_id', self.venue_id) \
            .eq('business_date', business_date) \
            .eq('shift_type', shift_type) \
            .order('created_at', desc=True) \
            .limit(1) \
            .execute()

        return response.data[0] if response.data else None

    def _get_current_staff(self, now: datetime) -> List[Dict]:
        """Get all staff currently clocked in"""
        business_date = now.date().isoformat()

        response = supabase.table('shift_assignments') \
            .select(`
                *,
                employee:employees(id, first_name, last_name),
                position:positions(id, name, base_hourly_rate)
            `) \
            .eq('venue_id', self.venue_id) \
            .eq('business_date', business_date) \
            .lte('scheduled_start', now.isoformat()) \
            .gte('scheduled_end', now.isoformat()) \
            .eq('status', 'scheduled') \
            .execute()

        return response.data or []

    def _generate_recommendations(
        self,
        current_staff: List[Dict],
        projected_labor_pct: float,
        covers_variance_pct: float,
        shift_progress: float,
        now: datetime
    ) -> List[Dict]:
        """Generate real-time recommendations"""

        recommendations = []

        # Only make recommendations if we're past 25% of shift (have enough data)
        if shift_progress < 0.25:
            return recommendations

        target = self.labor_targets['target_labor_percentage']
        max_labor = self.labor_targets['max_labor_percentage']

        # Overstaffed - consider cutting
        if projected_labor_pct > max_labor + 2:
            # Find lowest-priority staff to cut
            # Priority: lowest seniority, part-time, lowest performance
            recommendations.append({
                'type': 'cut',
                'severity': 'high' if projected_labor_pct > max_labor + 5 else 'medium',
                'message': f"Projected labor % is {projected_labor_pct:.1f}% (target: {target:.1f}%). Consider cutting 1-2 staff.",
                'staff_count': len(current_staff),
                'projected_labor_pct': projected_labor_pct,
            })

        # Understaffed - consider adding
        elif covers_variance_pct > 20 and shift_progress < 0.6:
            recommendations.append({
                'type': 'add',
                'severity': 'medium',
                'message': f"Running {covers_variance_pct:+.0f}% ahead of forecast. Consider calling in additional staff.",
                'covers_variance_pct': covers_variance_pct,
            })

        # Check for approaching overtime
        for staff in current_staff:
            # TODO: Calculate weekly hours and check if approaching 40
            pass

        return recommendations

    def _save_snapshot(self, snapshot_data: Dict) -> str:
        """Save snapshot to database"""
        response = supabase.table('shift_monitoring') \
            .insert(snapshot_data) \
            .execute()

        return response.data[0]['id'] if response.data else None

    def _save_recommendations(self, snapshot_id: str, recommendations: List[Dict]):
        """Save recommendations to database"""
        records = []
        for rec in recommendations:
            records.append({
                'snapshot_id': snapshot_id,
                'venue_id': self.venue_id,
                'recommendation_type': rec['type'],
                'severity': rec['severity'],
                'message': rec['message'],
                'status': 'pending',
                'created_at': datetime.now().isoformat(),
            })

        supabase.table('realtime_adjustments').insert(records).execute()


def main():
    """CLI entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Capture real-time shift snapshot')
    parser.add_argument('--venue-id', required=True, help='Venue ID')
    parser.add_argument('--actual-covers', type=int, required=True, help='Actual covers so far')
    parser.add_argument('--actual-revenue', type=float, required=True, help='Actual revenue so far')

    args = parser.parse_args()

    monitor = RealtimeShiftMonitor(args.venue_id)
    monitor.capture_snapshot(args.actual_covers, args.actual_revenue)


if __name__ == '__main__':
    main()
