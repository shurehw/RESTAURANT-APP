/**
 * Reset password for jacob@hwoodgroup.com
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnraeesscqsaappkaldb.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucmFlZXNzY3FzYWFwcGthbGRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYzOTE3NCwiZXhwIjoyMDc4MjE1MTc0fQ.N4erm4GjP1AV8uDP2OVPBIdZnNtuofPmyLFdM2IVhXI';

const supabase = createClient(supabaseUrl, serviceKey);

async function resetPassword() {
  const email = 'jacob@hwoodgroup.com';
  const newPassword = 'password123';

  console.log(`Resetting password for ${email}...`);

  const { data, error } = await supabase.auth.admin.updateUserById(
    '88e82503-9816-4f4e-aa74-7049583d230b',
    { password: newPassword }
  );

  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  console.log('✅ Password reset successfully!');
  console.log(`\nEmail: ${email}`);
  console.log(`Password: ${newPassword}`);
  console.log(`\nYou can now log in at: https://opsos-restaurant-app.vercel.app/login`);
}

resetPassword().catch(console.error);
