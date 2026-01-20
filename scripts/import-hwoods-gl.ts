import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Map R365 GLType to OpsOS section
function mapGLTypeToSection(glType: string, parentAccount: string, accountNumber: string): string {
  // Construction costs = PreOpening
  if (accountNumber.startsWith('8') || parentAccount === 'Construction Costs') {
    return 'PreOpening';
  }

  // Sales
  if (glType === 'Sales') {
    return 'Sales';
  }

  // COGS
  if (glType === 'COGS' || accountNumber.startsWith('5')) {
    return 'COGS';
  }

  // Labor Cost
  if (glType === 'Labor Cost' || accountNumber.startsWith('6')) {
    return 'Labor';
  }

  // Operating Expenses (Utilities, Repairs, Marketing, Music, etc.)
  if (glType === 'Utilities' || glType === 'Repairs & Maintenance' ||
      glType === 'Marketing' || glType === 'Music & Entertainment' ||
      glType === 'Operating Expense') {
    return 'Opex';
  }

  // Occupancy and 7xxx = Opex
  if (glType === 'Expense' && (
    accountNumber.startsWith('7') ||
    parentAccount.includes('Occupancy') ||
    parentAccount.includes('Administrative') ||
    parentAccount.includes('General')
  )) {
    return 'Opex';
  }

  // Corporate overhead
  if (glType === 'Corporate Overhead') {
    return 'BelowTheLine';
  }

  // Taxes
  if (glType === 'Taxes') {
    return 'BelowTheLine';
  }

  // Default any other Expense to Opex
  if (glType === 'Expense') {
    return 'Opex';
  }

  // Fallback
  return 'Opex';
}

async function importGLAccounts() {
  console.log('📦 Importing h.woods GL Accounts\n');

  // 1. Get h.woods organization ID
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('name', 'The h.wood Group')
    .single();

  if (!org) {
    console.error('❌ h.wood Group organization not found');
    return;
  }

  console.log(`✓ Found organization: ${org.name} (${org.id})\n`);

  // 2. Read and parse CSV
  const csvPath = 'C:\\Users\\JacobShure\\Downloads\\export_1_19_2026.csv';
  const csvContent = readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(`✓ Loaded ${records.length} GL accounts from CSV\n`);

  // 3. Filter P&L accounts only (exclude balance sheet)
  const plAccounts = records.filter((r: any) => {
    const glType = r.GLType;
    // Include all P&L types, exclude balance sheet (Asset, Liability, Equity)
    const balanceSheetTypes = ['Current Asset', 'Fixed Asset', 'Other Asset',
                                'Current Liability', 'Long Term Liability', 'Equity', 'Income Tax'];
    return !balanceSheetTypes.includes(glType);
  });

  console.log(`✓ Filtered to ${plAccounts.length} P&L accounts (excluded balance sheet)\n`);

  // 4. Transform to gl_accounts format
  const glAccountsToInsert = plAccounts.map((r: any, index: number) => {
    const section = mapGLTypeToSection(r.GLType, r.ParentAccount || '', r.AccountNumber);

    return {
      org_id: org.id,
      external_code: r.AccountNumber,
      name: r.AccountName,
      section,
      is_summary: r.DisableEntry === 'Yes', // Summary accounts have DisableEntry = Yes
      is_active: true,
      display_order: index,
    };
  });

  // 5. Insert in batches
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < glAccountsToInsert.length; i += batchSize) {
    const batch = glAccountsToInsert.slice(i, i + batchSize);

    const { error } = await supabase
      .from('gl_accounts')
      .upsert(batch, {
        onConflict: 'org_id,name',
        ignoreDuplicates: false
      });

    if (error) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error);
    } else {
      inserted += batch.length;
      console.log(`  ✓ Inserted batch ${i / batchSize + 1} (${inserted}/${glAccountsToInsert.length})`);
    }
  }

  // 6. Summary
  console.log(`\n✅ Successfully imported ${inserted} GL accounts for h.wood Group\n`);

  // Show breakdown by section
  const { data: sectionCounts } = await supabase
    .from('gl_accounts')
    .select('section')
    .eq('org_id', org.id);

  if (sectionCounts) {
    const breakdown = sectionCounts.reduce((acc: any, r: any) => {
      acc[r.section] = (acc[r.section] || 0) + 1;
      return acc;
    }, {});

    console.log('Breakdown by section:');
    Object.entries(breakdown).forEach(([section, count]) => {
      console.log(`  ${section}: ${count}`);
    });
  }
}

importGLAccounts();
