/**
 * Setup email sync for h.wood
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function setupEmailSync() {
  console.log('\n📧 Setting up email sync for h.wood...\n');

  // Find h.wood organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%wood%')
    .single();

  if (orgError || !org) {
    console.error('❌ h.wood organization not found:', orgError);
    return;
  }

  console.log(`✅ Found organization: ${org.name} (${org.id})\n`);

  // Check if email sync config already exists
  const { data: existing } = await supabase
    .from('email_sync_config')
    .select('*')
    .eq('organization_id', org.id)
    .eq('email_address', 'ap@hwoodgroup.com')
    .single();

  if (existing) {
    console.log('📧 Email sync config already exists:');
    console.log(`  Email: ${existing.email_address}`);
    console.log(`  Enabled: ${existing.enabled}`);
    console.log(`  Auto-process: ${existing.auto_process_invoices}`);
    console.log(`  Last sync: ${existing.last_sync_at || 'Never'}`);
    console.log(`  Total synced: ${existing.total_emails_synced}`);
    console.log(`  Invoices created: ${existing.total_invoices_created}\n`);
    return;
  }

  // Create email sync config
  const { data: config, error: configError } = await supabase
    .from('email_sync_config')
    .insert({
      organization_id: org.id,
      email_address: 'ap@hwoodgroup.com',
      email_type: 'microsoft_graph',
      enabled: true,
      auto_process_invoices: true,
      subject_keywords: ['invoice', 'bill', 'statement', 'payment'],
    })
    .select()
    .single();

  if (configError) {
    console.error('❌ Error creating email sync config:', configError);
    return;
  }

  console.log('✅ Email sync config created!');
  console.log(`  Email: ${config.email_address}`);
  console.log(`  Type: ${config.email_type}`);
  console.log(`  Auto-process: ${config.auto_process_invoices}\n`);
}

setupEmailSync().catch(console.error);
