import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function preFlightCheck() {
  console.log('🚀 Pre-Flight Check for Delilah Dallas Invoice Processing\n');

  const checks = [];

  // 1. Delilah Dallas venue exists
  const { data: venue } = await supabase
    .from('venues')
    .select('id, name, organization_id')
    .eq('name', 'Delilah Dallas')
    .single();

  checks.push({
    check: '1. Delilah Dallas Venue',
    status: venue ? '✅ PASS' : '❌ FAIL',
    details: venue ? venue.id.substring(0, 8) + '...' : 'Not found',
  });

  // 2. h.woods GL accounts loaded
  const { data: glAccounts, count } = await supabase
    .from('gl_accounts')
    .select('*', { count: 'exact' })
    .eq('org_id', '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41');

  checks.push({
    check: '2. h.woods GL Accounts',
    status: count && count > 300 ? '✅ PASS' : '⚠️  WARN',
    details: `${count} accounts loaded`,
  });

  // 3. Items table has new columns
  const { data: sampleItem } = await supabase
    .from('items')
    .select('id, organization_id, gl_account_id')
    .limit(1)
    .single();

  const hasOrgId = sampleItem && 'organization_id' in sampleItem;
  const hasGLId = sampleItem && 'gl_account_id' in sampleItem;

  checks.push({
    check: '3. Items.organization_id',
    status: hasOrgId ? '✅ PASS' : '❌ FAIL',
    details: hasOrgId ? 'Column exists' : 'Missing column',
  });

  checks.push({
    check: '4. Items.gl_account_id',
    status: hasGLId ? '✅ PASS' : '❌ FAIL',
    details: hasGLId ? 'Column exists' : 'Missing column',
  });

  // 4. Invoices have pre-opening flag
  const { data: sampleInvoice } = await supabase
    .from('invoices')
    .select('id, is_preopening')
    .limit(1)
    .maybeSingle();

  const hasPreopening = sampleInvoice && 'is_preopening' in sampleInvoice;

  checks.push({
    check: '5. Invoices.is_preopening',
    status: hasPreopening ? '✅ PASS' : '❌ FAIL',
    details: hasPreopening ? 'Column exists' : 'Missing column',
  });

  // 5. Learning loop table exists
  const { error: feedbackError } = await supabase
    .from('gl_mapping_feedback')
    .select('id')
    .limit(1);

  checks.push({
    check: '6. GL Learning Loop',
    status: !feedbackError ? '✅ PASS' : '❌ FAIL',
    details: !feedbackError ? 'Table ready' : 'Table missing',
  });

  // 6. Test suggestion function
  if (sampleItem) {
    const { data: suggestions, error: suggestError } = await supabase.rpc(
      'suggest_gl_account_for_item_v2',
      {
        p_item_id: sampleItem.id,
        p_organization_id: '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41',
      }
    );

    checks.push({
      check: '7. GL Suggestion Function',
      status: !suggestError && suggestions ? '✅ PASS' : '❌ FAIL',
      details: suggestions
        ? `${suggestions.length} suggestions`
        : suggestError?.message || 'No suggestions',
    });
  }

  // Display results
  console.table(checks);

  const failCount = checks.filter((c) => c.status.includes('FAIL')).length;
  const warnCount = checks.filter((c) => c.status.includes('WARN')).length;

  console.log('\n' + '='.repeat(60));
  if (failCount === 0) {
    console.log('✅ All checks passed! System is ready for invoice processing.');
    if (warnCount > 0) {
      console.log(`⚠️  ${warnCount} warning(s) - review above`);
    }
  } else {
    console.log(`❌ ${failCount} check(s) failed. Please fix before testing.`);
  }
  console.log('='.repeat(60) + '\n');

  // Next steps
  console.log('📋 Next Steps:');
  console.log('1. Upload a Delilah Dallas invoice PDF/image');
  console.log('2. System will OCR and extract line items');
  console.log('3. Map items to your catalog');
  console.log('4. GL accounts auto-suggest based on item category');
  console.log('5. System learns from your choices');
  console.log('6. Mark invoice as pre-opening: is_preopening = true\n');
}

preFlightCheck();
