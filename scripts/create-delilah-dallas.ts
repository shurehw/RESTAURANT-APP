import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function createDelilahDallas() {
  // Get h.woods organization ID (same as other Delilah venues)
  const { data: existingVenue } = await supabase
    .from('venues')
    .select('organization_id')
    .eq('name', 'Delilah LA')
    .single();

  if (!existingVenue) {
    console.error('❌ Could not find Delilah LA venue to get organization_id');
    return;
  }

  const orgId = existingVenue.organization_id;
  console.log(`✓ Using h.woods organization: ${orgId}`);

  // Create Delilah Dallas venue
  const { data: newVenue, error } = await supabase
    .from('venues')
    .insert({
      name: 'Delilah Dallas',
      organization_id: orgId,
      pos_type: 'toast',
      is_active: true,
      r365_entity_id: 'R365_DELILAH_DALLAS',
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error creating venue:', error);
    return;
  }

  console.log('\n✓ Successfully created Delilah Dallas venue:');
  console.log('  ID:', newVenue.id);
  console.log('  Name:', newVenue.name);
  console.log('  Organization:', newVenue.organization_id);
  console.log('  POS Type:', newVenue.pos_type);
  console.log('\n✓ Ready to upload pre-opening invoices for Delilah Dallas');
}

createDelilahDallas();
