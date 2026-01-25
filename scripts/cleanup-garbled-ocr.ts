/**
 * Clean Up Garbled OCR Line Items
 * Identifies and removes junk OCR text that shouldn't be in the database
 * Run with: npx dotenv -e .env.local -- npx tsx scripts/cleanup-garbled-ocr.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Patterns that indicate garbled OCR or junk text
const JUNK_PATTERNS = [
  // Header/footer text
  /SEND\s+(TO\s+)?IMPORTED/i,
  /ROUTE\s+PRODUCT\s+DESCRIPTION/i,
  /PRODUCT\s+DESCRIPTION/i,
  /PAGE\s+\d+\s+OF\s+\d+/i,
  /TOTAL\s+AMOUNT\s+DUE/i,
  /REMIT\s+TO/i,
  /INVOICE\s+NUMBER/i,
  /BILL\s+TO/i,
  /SHIP\s+TO/i,

  // Garbled text patterns
  /-\d+L-\d+/,  // Pattern like -31L-2
  /^\d{3,}\s+[A-Z]{8,}/,  // Pattern like "800 INITIATIVE"
  /^[A-Z]{15,}/,  // 15+ consecutive caps with no spaces

  // Common OCR garbage
  /KEKLLCUS|SCELLENING|PAVARH/i,  // Specific garbled words we found
  /^[A-Z\d\s-]{40,}$/,  // Very long all-caps strings
];

// Additional checks for suspicious items
function isLikelySuspicious(line: any): boolean {
  const desc = (line.description || '').trim();

  // Empty or very short descriptions
  if (desc.length < 3) return true;

  // Zero cost items (might be headers)
  if (line.unit_cost === 0 && line.line_total === 0) return true;

  // Check against junk patterns
  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(desc)) return true;
  }

  // Unusually high ratio of uppercase to lowercase (excluding normal food items)
  const upperCount = (desc.match(/[A-Z]/g) || []).length;
  const lowerCount = (desc.match(/[a-z]/g) || []).length;
  if (upperCount > 20 && lowerCount < 3) return true;

  // Contains multiple consecutive numbers that don't look like sizes (e.g., 380000191)
  if (/\d{8,}/.test(desc)) return true;

  return false;
}

async function cleanupGarbledOCR() {
  console.log('🧹 Cleaning Up Garbled OCR Line Items\n');

  // First, let's find all suspicious line items
  console.log('📊 Analyzing all invoice line items...\n');

  const { data: allLines, error: fetchError } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      qty,
      unit_cost,
      line_total,
      invoices!inner(
        id,
        invoice_number,
        invoice_date,
        vendors(name)
      )
    `)
    .order('created_at', { ascending: false });

  if (fetchError) {
    console.error('❌ Error fetching lines:', fetchError);
    return;
  }

  console.log(`Total invoice lines: ${allLines?.length || 0}`);

  // Filter suspicious items
  const suspiciousLines = (allLines || []).filter(isLikelySuspicious);

  console.log(`Suspicious items found: ${suspiciousLines.length}\n`);

  if (suspiciousLines.length === 0) {
    console.log('✅ No garbled OCR items found!');
    return;
  }

  // Group by vendor for better overview
  const byVendor: Record<string, any[]> = {};
  suspiciousLines.forEach((line: any) => {
    const vendor = line.invoices.vendors?.name || 'Unknown';
    if (!byVendor[vendor]) byVendor[vendor] = [];
    byVendor[vendor].push(line);
  });

  console.log('📋 Suspicious Items by Vendor:\n');
  Object.entries(byVendor).forEach(([vendor, lines]) => {
    console.log(`\n${vendor} (${lines.length} items):`);
    lines.slice(0, 10).forEach((line: any) => {
      console.log(`  - "${line.description}"`);
      console.log(`    Qty: ${line.qty} @ $${line.unit_cost} = $${line.line_total}`);
      console.log(`    Invoice: ${line.invoices.invoice_number || 'N/A'}`);
    });
    if (lines.length > 10) {
      console.log(`  ... and ${lines.length - 10} more`);
    }
  });

  console.log('\n' + '━'.repeat(60));
  console.log(`\n⚠️  Found ${suspiciousLines.length} suspicious line items`);
  console.log(`Total value: $${suspiciousLines.reduce((sum: number, l: any) => sum + (l.line_total || 0), 0).toFixed(2)}`);

  // Ask for confirmation (in production, you'd prompt the user)
  console.log('\n🗑️  Deleting suspicious line items...\n');

  const idsToDelete = suspiciousLines.map((l: any) => l.id);

  // Delete in batches of 100
  let deletedCount = 0;
  for (let i = 0; i < idsToDelete.length; i += 100) {
    const batch = idsToDelete.slice(i, i + 100);
    const { error: deleteError } = await supabase
      .from('invoice_lines')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error(`❌ Error deleting batch ${i / 100 + 1}:`, deleteError);
    } else {
      deletedCount += batch.length;
      console.log(`  Deleted batch ${i / 100 + 1}: ${batch.length} items (total: ${deletedCount})`);
    }
  }

  console.log(`\n✅ Cleanup complete! Deleted ${deletedCount} garbled OCR line items`);

  // Now check for invoices with no line items left
  console.log('\n🔍 Checking for invoices with no line items...\n');

  const { data: emptyInvoices } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      vendors(name)
    `)
    .not('id', 'in',
      `(SELECT DISTINCT invoice_id FROM invoice_lines)`
    )
    .limit(50);

  if (emptyInvoices && emptyInvoices.length > 0) {
    console.log(`⚠️  Found ${emptyInvoices.length} invoices with no line items:`);
    emptyInvoices.forEach((inv: any) => {
      console.log(`  - ${inv.vendors?.name || 'Unknown'} | ${inv.invoice_number} | ${inv.invoice_date} | $${inv.total_amount}`);
    });
    console.log('\nYou may want to delete these empty invoices manually.');
  } else {
    console.log('✅ No empty invoices found.');
  }
}

cleanupGarbledOCR();
