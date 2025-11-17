/**
 * Create the missing current_user_venue_ids view
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnraeesscqsaappkaldb.supabase.co';
const serviceKey = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

const supabase = createClient(supabaseUrl, serviceKey);

async function createView() {
  console.log('Creating current_user_venue_ids view...');

  const sql = `
CREATE OR REPLACE VIEW current_user_venue_ids AS
SELECT DISTINCT v.id as venue_id
FROM venues v
JOIN organization_users ou ON v.organization_id = ou.organization_id
WHERE ou.user_id = auth.uid();

GRANT SELECT ON current_user_venue_ids TO authenticated;

COMMENT ON VIEW current_user_venue_ids IS 'Returns venue IDs accessible to the currently authenticated user based on their organization membership';
  `;

  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).maybeSingle();

  if (error) {
    console.log('❌ Error:', error.message);
    console.log('\nTrying direct query...');

    // Try using pg_net or direct query
    const { error: error2 } = await supabase.from('_migrations').select('*').limit(1);
    console.log('Connection test:', error2 ? error2.message : 'OK');

    return;
  }

  console.log('✅ View created successfully!');
}

createView().catch(console.error);
