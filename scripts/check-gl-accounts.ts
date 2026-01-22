import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkGLAccounts() {
  const { data: glAccounts, error } = await supabase
    .from('gl_accounts')
    .select('*');

  if (error) {
    console.error('Error fetching GL accounts:', error);
    return;
  }

  console.log('\nGL Accounts in database:', glAccounts?.length || 0);

  if (glAccounts && glAccounts.length > 0) {
    console.log('\nExisting GL Accounts:');
    glAccounts.forEach(gl => {
      console.log(`  ${gl.account_number} - ${gl.account_name} (${gl.id})`);
    });
  } else {
    console.log('\n⚠️  No GL accounts found in database!');
    console.log('We need to create the standard R365 beverage GL accounts.');
  }
}

checkGLAccounts().catch(console.error);
