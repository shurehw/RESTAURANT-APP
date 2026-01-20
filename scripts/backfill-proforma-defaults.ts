import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function backfillProjectDefaults(projectNames: string[]) {
  console.log('🔍 Searching for projects:', projectNames);

  // Get projects by name
  const { data: projects, error: projectError } = await supabase
    .from('proforma_projects')
    .select('id, name, total_sf, sf_per_seat, bar_seats, use_manual_seats, manual_seats')
    .in('name', projectNames);

  if (projectError) {
    console.error('❌ Error fetching projects:', projectError);
    return;
  }

  if (!projects || projects.length === 0) {
    console.log('⚠️  No projects found with those names');
    return;
  }

  console.log(`\n✅ Found ${projects.length} project(s):\n`);

  for (const project of projects) {
    console.log(`📋 Processing: ${project.name} (${project.id})`);

    // Check existing revenue centers
    const { data: existingRC } = await supabase
      .from('revenue_centers')
      .select('id')
      .eq('project_id', project.id);

    // Check existing service periods
    const { data: existingSP } = await supabase
      .from('service_periods')
      .select('id')
      .eq('project_id', project.id);

    console.log(`   Current: ${existingRC?.length || 0} revenue centers, ${existingSP?.length || 0} service periods`);

    // Create revenue centers if none exist
    if (!existingRC || existingRC.length === 0) {
      // Calculate dining seats from project settings
      const calculatedSeats = project.use_manual_seats
        ? (project.manual_seats || 50)
        : (project.total_sf && project.sf_per_seat
            ? Math.floor(project.total_sf / project.sf_per_seat)
            : 50);

      const { error: rcError } = await supabase
        .from('revenue_centers')
        .insert([
          {
            project_id: project.id,
            name: 'Dining Room',
            is_primary: true,
            total_seats: calculatedSeats,
            display_order: 1
          },
          {
            project_id: project.id,
            name: 'Bar',
            is_primary: false,
            total_seats: project.bar_seats || 0,
            display_order: 2
          }
        ]);

      if (rcError) {
        console.error(`   ❌ Error creating revenue centers:`, rcError);
      } else {
        console.log(`   ✅ Created 2 revenue centers`);
      }
    } else {
      console.log(`   ⏭️  Skipping revenue centers (already exist)`);
    }

    // Create service periods if none exist
    if (!existingSP || existingSP.length === 0) {
      const { error: spError } = await supabase
        .from('service_periods')
        .insert([
          {
            project_id: project.id,
            name: 'Lunch',
            days_per_week: 7,
            turns_per_day: 1.5,
            avg_check: 35,
            display_order: 1
          },
          {
            project_id: project.id,
            name: 'Dinner',
            days_per_week: 7,
            turns_per_day: 2,
            avg_check: 75,
            display_order: 2
          }
        ]);

      if (spError) {
        console.error(`   ❌ Error creating service periods:`, spError);
      } else {
        console.log(`   ✅ Created 2 service periods`);
      }
    } else {
      console.log(`   ⏭️  Skipping service periods (already exist)`);
    }

    console.log('');
  }

  console.log('🎉 Backfill complete!\n');
}

// Run backfill for specified projects
backfillProjectDefaults(['Rivani Speakeasy', 'Manav\'s project']);
