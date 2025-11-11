/**
 * Seed Historical Labor Data
 * Creates realistic historical shift and demand data for ML training
 *
 * Run: npx tsx scripts/seed-labor-history.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface Position {
  id: string;
  name: string;
  category: string;
  base_hourly_rate: number;
  tipped: boolean;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  primary_position_id: string;
}

// Realistic staffing patterns by shift and cover range
const STAFFING_PATTERNS = {
  dinner: {
    Server: [
      { covers_min: 0, covers_max: 50, staff: 2 },
      { covers_min: 51, covers_max: 85, staff: 3 },
      { covers_min: 86, covers_max: 120, staff: 4 },
      { covers_min: 121, covers_max: 160, staff: 5 },
      { covers_min: 161, covers_max: 200, staff: 6 },
    ],
    Bartender: [
      { covers_min: 0, covers_max: 80, staff: 1 },
      { covers_min: 81, covers_max: 160, staff: 2 },
      { covers_min: 161, covers_max: 300, staff: 3 },
    ],
    Busser: [
      { covers_min: 0, covers_max: 70, staff: 1 },
      { covers_min: 71, covers_max: 140, staff: 2 },
      { covers_min: 141, covers_max: 300, staff: 3 },
    ],
    Host: [
      { covers_min: 0, covers_max: 100, staff: 1 },
      { covers_min: 101, covers_max: 300, staff: 2 },
    ],
    'Line Cook': [
      { covers_min: 0, covers_max: 60, staff: 2 },
      { covers_min: 61, covers_max: 120, staff: 3 },
      { covers_min: 121, covers_max: 180, staff: 4 },
      { covers_min: 181, covers_max: 300, staff: 5 },
    ],
    Dishwasher: [
      { covers_min: 0, covers_max: 100, staff: 1 },
      { covers_min: 101, covers_max: 200, staff: 2 },
      { covers_min: 201, covers_max: 300, staff: 3 },
    ],
  },
  lunch: {
    Server: [
      { covers_min: 0, covers_max: 40, staff: 2 },
      { covers_min: 41, covers_max: 75, staff: 3 },
      { covers_min: 76, covers_max: 110, staff: 4 },
      { covers_min: 111, covers_max: 200, staff: 5 },
    ],
    Bartender: [
      { covers_min: 0, covers_max: 150, staff: 1 },
      { covers_min: 151, covers_max: 300, staff: 2 },
    ],
    Busser: [
      { covers_min: 0, covers_max: 80, staff: 1 },
      { covers_min: 81, covers_max: 200, staff: 2 },
    ],
    Host: [
      { covers_min: 0, covers_max: 300, staff: 1 },
    ],
    'Line Cook': [
      { covers_min: 0, covers_max: 50, staff: 2 },
      { covers_min: 51, covers_max: 100, staff: 3 },
      { covers_min: 101, covers_max: 200, staff: 4 },
    ],
    Dishwasher: [
      { covers_min: 0, covers_max: 150, staff: 1 },
      { covers_min: 151, covers_max: 300, staff: 2 },
    ],
  },
};

function getStaffNeeded(shift: string, position: string, covers: number): number {
  const patterns = STAFFING_PATTERNS[shift as keyof typeof STAFFING_PATTERNS];
  if (!patterns) return 1;

  const posPatterns = patterns[position as keyof typeof patterns];
  if (!posPatterns) return 1;

  const match = posPatterns.find(
    (p) => covers >= p.covers_min && covers <= p.covers_max
  );
  return match ? match.staff : 1;
}

async function main() {
  console.log('🌱 Seeding historical labor data...\n');

  // Get venue
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('is_active', true)
    .limit(1);

  if (!venues || venues.length === 0) {
    throw new Error('No active venues found');
  }

  const venue = venues[0];
  console.log(`📍 Venue: ${venue.name} (${venue.id})\n`);

  // Get positions
  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('venue_id', venue.id)
    .eq('is_active', true);

  if (!positions || positions.length === 0) {
    throw new Error('No positions found - run migration 013 first');
  }

  console.log(`👔 Loaded ${positions.length} positions`);

  // Create sample employees
  console.log('\n👥 Creating sample employees...');
  const employees: Employee[] = [];

  const employeeData = [
    // Servers
    { first: 'Sarah', last: 'Johnson', position: 'Server' },
    { first: 'Mike', last: 'Williams', position: 'Server' },
    { first: 'Emily', last: 'Davis', position: 'Server' },
    { first: 'James', last: 'Brown', position: 'Server' },
    { first: 'Lisa', last: 'Garcia', position: 'Server' },
    { first: 'Tom', last: 'Martinez', position: 'Server' },

    // Bartenders
    { first: 'Alex', last: 'Taylor', position: 'Bartender' },
    { first: 'Jordan', last: 'Anderson', position: 'Bartender' },
    { first: 'Casey', last: 'Thomas', position: 'Bartender' },

    // Bussers
    { first: 'Chris', last: 'White', position: 'Busser' },
    { first: 'Pat', last: 'Harris', position: 'Busser' },
    { first: 'Sam', last: 'Clark', position: 'Busser' },

    // Hosts
    { first: 'Morgan', last: 'Lewis', position: 'Host' },
    { first: 'Taylor', last: 'Walker', position: 'Host' },

    // Cooks
    { first: 'Carlos', last: 'Rodriguez', position: 'Line Cook' },
    { first: 'Maria', last: 'Lopez', position: 'Line Cook' },
    { first: 'David', last: 'Lee', position: 'Line Cook' },
    { first: 'Anna', last: 'Kim', position: 'Line Cook' },
    { first: 'John', last: 'Chen', position: 'Line Cook' },

    // Dishwashers
    { first: 'Jose', last: 'Hernandez', position: 'Dishwasher' },
    { first: 'Luis', last: 'Gonzalez', position: 'Dishwasher' },
  ];

  for (const emp of employeeData) {
    const position = positions.find((p) => p.name === emp.position);
    if (!position) continue;

    const { data, error } = await supabase
      .from('employees')
      .insert({
        venue_id: venue.id,
        first_name: emp.first,
        last_name: emp.last,
        primary_position_id: position.id,
        employment_status: 'active',
        hire_date: '2024-01-01',
      })
      .select()
      .single();

    if (data) {
      employees.push(data);
    }
  }

  console.log(`✅ Created ${employees.length} employees`);

  // Generate historical data for last 180 days
  console.log('\n📊 Generating 180 days of historical data...\n');

  const today = new Date();
  const demandHistory = [];
  const shiftsWorked = [];

  for (let daysAgo = 180; daysAgo >= 0; daysAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const businessDate = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();

    // Skip some random days (restaurant closed or very slow)
    if (Math.random() < 0.1) continue;

    // Generate lunch and dinner shifts
    for (const shiftType of ['lunch', 'dinner']) {
      // Generate realistic covers based on day of week and shift
      let baseCovers = shiftType === 'dinner' ? 100 : 60;

      // Weekend boost
      if (dayOfWeek === 5 || dayOfWeek === 6) {
        baseCovers *= 1.4;
      } else if (dayOfWeek === 0) {
        baseCovers *= 1.2;
      }

      // Monday/Tuesday slower
      if (dayOfWeek === 1 || dayOfWeek === 2) {
        baseCovers *= 0.8;
      }

      // Random variance ±20%
      const variance = 0.8 + Math.random() * 0.4;
      const covers = Math.round(baseCovers * variance);

      // Avg check: $18-$28
      const avgCheck = 18 + Math.random() * 10;
      const revenue = covers * avgCheck;

      // Weather (simple)
      const temp = 60 + Math.random() * 30;
      const hasEvent = Math.random() < 0.15; // 15% chance of nearby event

      // Demand history record
      demandHistory.push({
        venue_id: venue.id,
        business_date: businessDate,
        day_of_week: dayOfWeek,
        shift_type: shiftType,
        covers,
        revenue: Math.round(revenue * 100) / 100,
        avg_check: Math.round(avgCheck * 100) / 100,
        party_size_avg: 2 + Math.random() * 1.5,
        reservation_count: Math.round(covers * (0.4 + Math.random() * 0.3)),
        reservation_covers: Math.round(covers * (0.5 + Math.random() * 0.2)),
        walkin_covers: Math.round(covers * (0.3 + Math.random() * 0.3)),
        weather_temp_high: Math.round(temp),
        weather_temp_low: Math.round(temp - 10),
        weather_precipitation: Math.random() < 0.2 ? Math.random() * 2 : 0,
        weather_conditions: Math.random() < 0.2 ? 'rain' : 'clear',
        has_nearby_event: hasEvent,
        is_holiday: false,
        is_special_event: false,
      });

      // Generate shifts worked for each position
      for (const position of positions) {
        const staffNeeded = getStaffNeeded(shiftType, position.name, covers);

        // Get employees for this position
        const positionEmployees = employees.filter(
          (e) => e.primary_position_id === position.id
        );

        if (positionEmployees.length === 0) continue;

        // Assign shifts (randomly pick from available employees)
        const assignedEmployees = positionEmployees
          .sort(() => Math.random() - 0.5)
          .slice(0, staffNeeded);

        for (const employee of assignedEmployees) {
          const shiftHours = shiftType === 'dinner' ? 6 : 5;
          const actualHours = shiftHours + (Math.random() - 0.5) * 0.5; // Slight variance

          const clockIn = new Date(date);
          if (shiftType === 'lunch') {
            clockIn.setHours(11, 0, 0);
          } else {
            clockIn.setHours(17, 0, 0);
          }

          const clockOut = new Date(clockIn);
          clockOut.setHours(clockOut.getHours() + Math.round(actualHours * 10) / 10);

          const regularPay = actualHours * position.base_hourly_rate;
          const tips = position.tipped ? covers / staffNeeded * (2 + Math.random() * 3) : 0;
          const totalComp = regularPay + tips;

          shiftsWorked.push({
            venue_id: venue.id,
            employee_id: employee.id,
            position_id: position.id,
            business_date: businessDate,
            shift_type: shiftType,
            clock_in: clockIn.toISOString(),
            clock_out: clockOut.toISOString(),
            scheduled_hours: shiftHours,
            actual_hours: Math.round(actualHours * 100) / 100,
            overtime_hours: 0,
            hourly_rate: position.base_hourly_rate,
            regular_pay: Math.round(regularPay * 100) / 100,
            overtime_pay: 0,
            tips: Math.round(tips * 100) / 100,
            total_compensation: Math.round(totalComp * 100) / 100,
            covers_served: position.category === 'front_of_house' ? Math.round(covers / staffNeeded) : null,
            tables_served: position.name === 'Server' ? Math.round(covers / staffNeeded / 3) : null,
            avg_check: position.category === 'front_of_house' ? Math.round(avgCheck * 100) / 100 : null,
            customer_complaints: Math.random() < 0.05 ? 1 : 0,
          });
        }
      }
    }

    // Progress indicator
    if ((180 - daysAgo) % 30 === 0) {
      console.log(`   Generated ${180 - daysAgo} days...`);
    }
  }

  console.log(`\n📈 Inserting ${demandHistory.length} demand history records...`);

  // Insert in batches
  const batchSize = 100;
  for (let i = 0; i < demandHistory.length; i += batchSize) {
    const batch = demandHistory.slice(i, i + batchSize);
    await supabase.from('demand_history').insert(batch);
  }

  console.log(`✅ Demand history inserted`);

  console.log(`\n👷 Inserting ${shiftsWorked.length} shift records...`);

  for (let i = 0; i < shiftsWorked.length; i += batchSize) {
    const batch = shiftsWorked.slice(i, i + batchSize);
    await supabase.from('actual_shifts_worked').insert(batch);
  }

  console.log(`✅ Shifts worked inserted`);

  console.log('\n🎉 Done! Historical labor data seeded successfully.');
  console.log('\n📊 Summary:');
  console.log(`   - ${employees.length} employees created`);
  console.log(`   - ${demandHistory.length} days of demand history`);
  console.log(`   - ${shiftsWorked.length} shifts worked`);
  console.log('\n💡 Next steps:');
  console.log(`   1. Run: python python-services/labor_analyzer/staffing_analyzer.py --venue-id ${venue.id}`);
  console.log(`   2. Run: python python-services/labor_analyzer/requirements_calculator.py --venue-id ${venue.id}`);
}

main().catch(console.error);
