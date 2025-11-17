/**
 * Reset password for jacob@hwoodgroup.com
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnraeesscqsaappkaldb.supabase.co';
const serviceKey = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

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
