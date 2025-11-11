"""
Auto-Scheduler with PuLP Optimization
Generates optimal weekly schedules from labor requirements
"""

import os
import sys
from datetime import datetime, timedelta, time
from typing import Dict, List, Optional, Tuple
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client, Client
from dotenv import load_dotenv
from pulp import *

load_dotenv()

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase environment variables")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# Shift time configurations
SHIFT_TIMES = {
    'breakfast': {'start': time(7, 0), 'end': time(14, 0), 'hours': 7},
    'lunch': {'start': time(11, 0), 'end': time(16, 0), 'hours': 5},
    'dinner': {'start': time(17, 0), 'end': time(23, 0), 'hours': 6},
    'late_night': {'start': time(22, 0), 'end': time(2, 0), 'hours': 4},
}


class AutoScheduler:
    """Generates optimal weekly schedules using constraint optimization"""

    def __init__(self, venue_id: str):
        self.venue_id = venue_id
        self.employees = []
        self.requirements = []
        self.positions = {}

    def load_data(self, week_start_date: str):
        """Load all necessary data for scheduling"""
        week_start = datetime.fromisoformat(week_start_date).date()
        week_end = week_start + timedelta(days=6)

        print(f"📅 Loading data for week {week_start} to {week_end}...")

        # Load employees
        emp_response = supabase.table('employees') \
            .select('*, position:positions(id, name, base_hourly_rate, category)') \
            .eq('venue_id', self.venue_id) \
            .eq('employment_status', 'active') \
            .execute()

        self.employees = emp_response.data
        print(f"👥 Loaded {len(self.employees)} active employees")

        # Load positions
        pos_response = supabase.table('positions') \
            .select('*') \
            .eq('venue_id', self.venue_id) \
            .eq('is_active', True) \
            .execute()

        self.positions = {p['id']: p for p in pos_response.data}

        # Load labor requirements for the week
        req_response = supabase.table('labor_requirements') \
            .select('*, position:positions(*)') \
            .eq('venue_id', self.venue_id) \
            .gte('business_date', week_start.isoformat()) \
            .lte('business_date', week_end.isoformat()) \
            .execute()

        self.requirements = req_response.data
        print(f"📊 Loaded {len(self.requirements)} labor requirements")

    def generate_schedule(self, week_start_date: str) -> Dict:
        """
        Main scheduling algorithm using PuLP optimization
        """
        week_start = datetime.fromisoformat(week_start_date).date()

        print(f"\n🧮 Generating optimal schedule for week starting {week_start}...\n")

        # Load data
        self.load_data(week_start_date)

        if not self.requirements:
            print("❌ No labor requirements found for this week")
            return None

        # Create optimization problem
        prob = LpProblem("Restaurant_Schedule", LpMinimize)

        # Decision variables: x[employee_id][requirement_id] = 1 if assigned
        assignments = {}

        for req in self.requirements:
            req_id = req['id']
            position_id = req['position_id']
            employees_needed = req['employees_needed']

            # Get eligible employees for this position
            eligible_employees = [
                emp for emp in self.employees
                if emp['primary_position_id'] == position_id
            ]

            for emp in eligible_employees:
                emp_id = emp['id']
                key = (emp_id, req_id)

                # Binary variable: 1 if employee assigned to this requirement
                assignments[key] = LpVariable(f"assign_{emp_id}_{req_id}", cat='Binary')

        # OBJECTIVE FUNCTION: Minimize total labor cost
        labor_costs = []

        for (emp_id, req_id), var in assignments.items():
            # Find requirement and employee
            req = next(r for r in self.requirements if r['id'] == req_id)
            emp = next(e for e in self.employees if e['id'] == emp_id)

            # Cost = hours × hourly_rate
            cost = req['hours_per_employee'] * emp['position']['base_hourly_rate']
            labor_costs.append(cost * var)

        prob += lpSum(labor_costs), "Total_Labor_Cost"

        # CONSTRAINT 1: Meet staffing requirements (exactly)
        for req in self.requirements:
            req_id = req['id']
            employees_needed = req['employees_needed']
            position_id = req['position_id']

            # Sum of all employees assigned to this requirement must equal employees_needed
            eligible_vars = [
                var for (emp_id, r_id), var in assignments.items()
                if r_id == req_id
            ]

            if eligible_vars:
                prob += (
                    lpSum(eligible_vars) == employees_needed,
                    f"Requirement_{req_id}_coverage"
                )

        # CONSTRAINT 2: Max hours per week (40 hours)
        for emp in self.employees:
            emp_id = emp['id']
            max_hours = float(emp.get('max_hours_per_week', 40))

            # Sum all hours assigned to this employee
            emp_vars = [
                var * next(r for r in self.requirements if r['id'] == req_id)['hours_per_employee']
                for (e_id, req_id), var in assignments.items()
                if e_id == emp_id
            ]

            if emp_vars:
                prob += (
                    lpSum(emp_vars) <= max_hours,
                    f"MaxHours_{emp_id}"
                )

        # CONSTRAINT 3: Min hours per week (for full-time employees)
        for emp in self.employees:
            emp_id = emp['id']
            min_hours = float(emp.get('min_hours_per_week', 0))

            if min_hours > 0:
                emp_vars = [
                    var * next(r for r in self.requirements if r['id'] == req_id)['hours_per_employee']
                    for (e_id, req_id), var in assignments.items()
                    if e_id == emp_id
                ]

                if emp_vars:
                    prob += (
                        lpSum(emp_vars) >= min_hours,
                        f"MinHours_{emp_id}"
                    )

        # CONSTRAINT 4: No overlapping shifts (one shift per day per employee)
        # Group requirements by date
        dates = list(set(req['business_date'] for req in self.requirements))

        for date in dates:
            date_reqs = [r for r in self.requirements if r['business_date'] == date]

            for emp in self.employees:
                emp_id = emp['id']

                # Employee can work max 1 shift per day (unless split shift)
                daily_vars = [
                    var for (e_id, req_id), var in assignments.items()
                    if e_id == emp_id and req_id in [r['id'] for r in date_reqs]
                ]

                if daily_vars:
                    prob += (
                        lpSum(daily_vars) <= 2,  # Allow split shifts (lunch + dinner)
                        f"MaxShiftsPerDay_{emp_id}_{date}"
                    )

        # Solve the problem
        print("🔍 Solving optimization problem...")
        prob.solve(PULP_CBC_CMD(msg=0))

        # Check solution status
        status = LpStatus[prob.status]
        print(f"\n📊 Optimization Status: {status}")

        if status != 'Optimal':
            print("❌ Could not find optimal solution")
            print("   This might mean requirements cannot be met with available staff")
            return None

        # Extract solution
        schedule_assignments = []
        total_cost = 0
        total_hours = 0

        for (emp_id, req_id), var in assignments.items():
            if var.varValue == 1:  # Employee assigned
                req = next(r for r in self.requirements if r['id'] == req_id)
                emp = next(e for e in self.employees if e['id'] == emp_id)

                shift_hours = req['hours_per_employee']
                hourly_rate = emp['position']['base_hourly_rate']
                shift_cost = shift_hours * hourly_rate

                total_cost += shift_cost
                total_hours += shift_hours

                # Create shift assignment
                shift_start, shift_end = self._get_shift_times(
                    req['business_date'],
                    req['shift_type']
                )

                schedule_assignments.append({
                    'employee_id': emp_id,
                    'employee_name': f"{emp['first_name']} {emp['last_name']}",
                    'position_id': req['position_id'],
                    'position_name': req['position']['name'],
                    'business_date': req['business_date'],
                    'shift_type': req['shift_type'],
                    'scheduled_start': shift_start.isoformat(),
                    'scheduled_end': shift_end.isoformat(),
                    'scheduled_hours': shift_hours,
                    'hourly_rate': float(hourly_rate),
                    'labor_cost': float(shift_cost),
                })

        print(f"\n✅ Schedule generated successfully!")
        print(f"   📋 {len(schedule_assignments)} shifts assigned")
        print(f"   ⏱️  {total_hours:.1f} total hours")
        print(f"   💰 ${total_cost:.2f} total labor cost")

        return {
            'week_start_date': week_start_date,
            'assignments': schedule_assignments,
            'total_hours': total_hours,
            'total_cost': total_cost,
            'status': status,
        }

    def _get_shift_times(self, business_date: str, shift_type: str) -> Tuple[datetime, datetime]:
        """Calculate shift start and end times"""
        date = datetime.fromisoformat(business_date)
        shift_config = SHIFT_TIMES.get(shift_type, SHIFT_TIMES['dinner'])

        start = datetime.combine(date, shift_config['start'])
        end = datetime.combine(date, shift_config['end'])

        # Handle overnight shifts
        if shift_config['end'] < shift_config['start']:
            end += timedelta(days=1)

        return start, end

    def save_schedule(self, schedule_data: Dict) -> str:
        """Save generated schedule to database"""
        if not schedule_data:
            return None

        week_start = datetime.fromisoformat(schedule_data['week_start_date']).date()
        week_end = week_start + timedelta(days=6)

        # Create weekly_schedule record
        schedule_record = {
            'venue_id': self.venue_id,
            'week_start_date': week_start.isoformat(),
            'week_end_date': week_end.isoformat(),
            'status': 'draft',
            'total_labor_hours': schedule_data['total_hours'],
            'total_labor_cost': schedule_data['total_cost'],
            'generated_at': datetime.now().isoformat(),
        }

        schedule_response = supabase.table('weekly_schedules').insert(schedule_record).execute()
        schedule_id = schedule_response.data[0]['id']

        print(f"\n💾 Saving schedule {schedule_id}...")

        # Create shift_assignments
        shift_records = []
        for assignment in schedule_data['assignments']:
            shift_records.append({
                'schedule_id': schedule_id,
                'venue_id': self.venue_id,
                'employee_id': assignment['employee_id'],
                'position_id': assignment['position_id'],
                'business_date': assignment['business_date'],
                'shift_type': assignment['shift_type'],
                'scheduled_start': assignment['scheduled_start'],
                'scheduled_end': assignment['scheduled_end'],
                'scheduled_hours': assignment['scheduled_hours'],
                'status': 'scheduled',
            })

        # Insert all shifts
        supabase.table('shift_assignments').insert(shift_records).execute()

        print(f"✅ Schedule saved with {len(shift_records)} shifts")

        return schedule_id


def main():
    """CLI entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Generate optimal weekly schedule')
    parser.add_argument('--venue-id', required=True, help='Venue ID')
    parser.add_argument('--week-start', required=True, help='Week start date (YYYY-MM-DD)')
    parser.add_argument('--save', action='store_true', help='Save schedule to database')

    args = parser.parse_args()

    scheduler = AutoScheduler(args.venue_id)
    schedule = scheduler.generate_schedule(args.week_start)

    if schedule and args.save:
        schedule_id = scheduler.save_schedule(schedule)
        print(f"\n🎉 Schedule {schedule_id} ready for review!")
    elif schedule:
        print("\n💡 Run with --save to save this schedule to the database")


if __name__ == '__main__':
    main()
