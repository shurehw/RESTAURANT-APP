"""
Labor Requirements Calculator
Calculates staffing needs from demand forecasts using ML-learned patterns
"""

import os
import sys
from datetime import datetime
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


class LaborRequirementsCalculator:
    """Calculates labor requirements from demand forecasts"""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.labor_targets = self._load_labor_targets()
        self.positions = self._load_positions()
        self.staffing_patterns = self._load_staffing_patterns()

    def _load_labor_targets(self) -> Dict:
        """Load labor percentage targets"""
        response = supabase.table('labor_targets') \
            .select('*') \
            .eq('venue_id', self.venue_id) \
            .eq('is_active', True) \
            .is_('shift_type', 'null') \
            .limit(1) \
            .execute()

        if response.data:
            return response.data[0]
        else:
            # Default targets
            return {
                'target_labor_percentage': 27.5,
                'min_labor_percentage': 27.0,
                'max_labor_percentage': 28.0
            }

    def _load_positions(self) -> Dict[str, Dict]:
        """Load position wage data"""
        response = supabase.table('positions') \
            .select('*') \
            .eq('venue_id', self.venue_id) \
            .eq('is_active', True) \
            .execute()

        return {p['id']: p for p in response.data}

    def _load_staffing_patterns(self) -> List[Dict]:
        """Load ML-learned staffing patterns"""
        response = supabase.table('staffing_patterns') \
            .select('*, position:positions(*)') \
            .eq('venue_id', self.venue_id) \
            .eq('is_active', True) \
            .execute()

        return response.data

    def find_matching_pattern(
        self,
        position_id: str,
        shift_type: str,
        covers: int,
        day_of_week: Optional[int] = None
    ) -> Optional[Dict]:
        """
        Find the best matching staffing pattern for given parameters
        """
        matching = [
            p for p in self.staffing_patterns
            if p['position_id'] == position_id
            and p['shift_type'] == shift_type
            and covers >= p['covers_min']
            and covers <= p['covers_max']
            and (p['day_of_week'] is None or p['day_of_week'] == day_of_week)
        ]

        if not matching:
            return None

        # Sort by confidence and specificity
        matching.sort(key=lambda p: (
            p['day_of_week'] is not None,  # Prefer day-specific patterns
            p['confidence_score']
        ), reverse=True)

        return matching[0]

    def calculate_requirements_for_forecast(self, forecast_id: str) -> List[Dict]:
        """
        Calculate labor requirements for a specific forecast
        Returns list of requirements by position
        """
        # Fetch forecast
        forecast_response = supabase.table('demand_forecasts') \
            .select('*') \
            .eq('id', forecast_id) \
            .single() \
            .execute()

        forecast = forecast_response.data
        if not forecast:
            raise ValueError(f"Forecast {forecast_id} not found")

        covers = forecast['covers_predicted']
        revenue = forecast['revenue_predicted'] or 0
        shift_type = forecast['shift_type']
        business_date = forecast['business_date']

        # Get day of week
        date_obj = datetime.fromisoformat(business_date)
        day_of_week = date_obj.weekday()

        print(f"📊 Calculating requirements for {shift_type} on {business_date}")
        print(f"   Forecast: {covers} covers, ${revenue:.0f} revenue")

        requirements = []
        total_labor_cost = 0
        total_labor_hours = 0

        # Calculate for each position
        for position_id, position in self.positions.items():
            pattern = self.find_matching_pattern(
                position_id,
                shift_type,
                covers,
                day_of_week
            )

            if not pattern:
                # No pattern found - skip or use default service standard
                continue

            employees_needed = pattern['employees_recommended']
            hours_per_employee = 6.0  # Default shift length (could be from service_standards)
            total_hours = employees_needed * hours_per_employee

            hourly_rate = float(position['base_hourly_rate'])
            total_cost = total_hours * hourly_rate

            total_labor_cost += total_cost
            total_labor_hours += total_hours

            requirements.append({
                'forecast_id': forecast_id,
                'venue_id': self.venue_id,
                'business_date': business_date,
                'shift_type': shift_type,
                'position': position['name'],
                'position_id': position_id,
                'staffing_pattern_id': pattern['id'],
                'employees_needed': employees_needed,
                'hours_per_employee': hours_per_employee,
                'total_hours': total_hours,
                'avg_hourly_rate': hourly_rate,
                'total_cost': total_cost,
                'calculation_method': 'ml_model',
            })

            print(f"   {position['name']}: {employees_needed} × {hours_per_employee}h @ ${hourly_rate}/hr = ${total_cost:.0f}")

        # Calculate labor percentage
        if revenue > 0:
            labor_percentage = (total_labor_cost / revenue) * 100
        else:
            labor_percentage = 0

        # Check against targets
        within_target = (
            labor_percentage >= self.labor_targets['min_labor_percentage'] and
            labor_percentage <= self.labor_targets['max_labor_percentage']
        )

        print(f"\n   💰 Total Labor: ${total_labor_cost:.0f} ({labor_percentage:.1f}% of revenue)")
        print(f"   🎯 Target: {self.labor_targets['min_labor_percentage']}-{self.labor_targets['max_labor_percentage']}%")
        print(f"   {'✅' if within_target else '⚠️'} {'Within' if within_target else 'Outside'} target range")

        # Add labor_percentage and within_target to each requirement
        for req in requirements:
            req['labor_percentage'] = round(labor_percentage, 2)
            req['within_target'] = within_target

        # Update forecast with labor estimates
        supabase.table('demand_forecasts') \
            .update({
                'labor_cost_estimate': round(total_labor_cost, 2),
                'labor_percentage_estimate': round(labor_percentage, 2)
            }) \
            .eq('id', forecast_id) \
            .execute()

        return requirements

    def save_requirements(self, requirements: List[Dict]):
        """Save calculated requirements to database"""
        if not requirements:
            print("No requirements to save")
            return

        # Delete existing requirements for this forecast
        forecast_id = requirements[0]['forecast_id']
        supabase.table('labor_requirements') \
            .delete() \
            .eq('forecast_id', forecast_id) \
            .execute()

        # Insert new requirements
        supabase.table('labor_requirements').insert(requirements).execute()

        print(f"✅ Saved {len(requirements)} labor requirements")

    def calculate_for_upcoming_forecasts(self, days_ahead: int = 7):
        """
        Calculate requirements for all upcoming forecasts
        """
        from datetime import date, timedelta

        today = date.today()
        end_date = today + timedelta(days=days_ahead)

        # Fetch upcoming forecasts
        response = supabase.table('demand_forecasts') \
            .select('id, business_date, shift_type, covers_predicted') \
            .eq('venue_id', self.venue_id) \
            .gte('business_date', today.isoformat()) \
            .lte('business_date', end_date.isoformat()) \
            .order('business_date', desc=False) \
            .execute()

        forecasts = response.data

        if not forecasts:
            print(f"No forecasts found for next {days_ahead} days")
            return

        print(f"\n🔄 Calculating requirements for {len(forecasts)} upcoming forecasts...\n")

        for forecast in forecasts:
            print(f"\n{'='*60}")
            try:
                requirements = self.calculate_requirements_for_forecast(forecast['id'])
                self.save_requirements(requirements)
            except Exception as e:
                print(f"❌ Error calculating requirements for forecast {forecast['id']}: {e}")
                continue

        print(f"\n{'='*60}")
        print(f"✅ Completed calculations for {len(forecasts)} forecasts")


def main():
    """Main execution"""
    import argparse

    parser = argparse.ArgumentParser(description='Calculate labor requirements from forecasts')
    parser.add_argument('--venue-id', required=True, help='Venue ID')
    parser.add_argument('--forecast-id', help='Specific forecast ID to calculate')
    parser.add_argument('--days-ahead', type=int, default=7, help='Calculate for next N days')

    args = parser.parse_args()

    calculator = LaborRequirementsCalculator(args.venue_id)

    if args.forecast_id:
        # Calculate for specific forecast
        requirements = calculator.calculate_requirements_for_forecast(args.forecast_id)
        calculator.save_requirements(requirements)
    else:
        # Calculate for all upcoming forecasts
        calculator.calculate_for_upcoming_forecasts(args.days_ahead)


if __name__ == '__main__':
    main()
