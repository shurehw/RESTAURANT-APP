/**
 * Deduplicate Invoices
 *
 * Identifies and removes duplicate invoices based on:
 * - Same vendor
 * - Same invoice date
 * - Same invoice number (or very similar - OCR variations like "1B8357" vs "188357")
 * - Same total amount
 *
 * Keeps the earliest created invoice and deletes duplicates
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  vendor_id: string;
  created_at: string;
  storage_path: string;
  vendors?: { name: string };
}

function normalizeInvoiceNumber(num: string | null): string {
  if (!num) return '';
  // Remove common OCR errors: replace 1/I/l with 1, B/8 variations, O/0 variations
  return num
    .toUpperCase()
    .replace(/[IL]/g, '1') // I, L -> 1
    .replace(/O/g, '0')    // O -> 0
    .replace(/[^A-Z0-9]/g, '') // Remove special chars
    .trim();
}

function isSimilarInvoiceNumber(num1: string, num2: string): boolean {
  const n1 = normalizeInvoiceNumber(num1);
  const n2 = normalizeInvoiceNumber(num2);

  // Exact match after normalization
  if (n1 === n2) return true;

  // Allow for single character difference (OCR error)
  if (Math.abs(n1.length - n2.length) <= 1) {
    let diff = 0;
    const maxLen = Math.max(n1.length, n2.length);
    for (let i = 0; i < maxLen; i++) {
      if (n1[i] !== n2[i]) diff++;
      if (diff > 1) return false;
    }
    return diff <= 1;
  }

  return false;
}

async function findDuplicateGroups(): Promise<Map<string, Invoice[]>> {
  console.log('🔍 Fetching all invoices...\n');

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount, vendor_id, created_at, storage_path, vendors(name)')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch invoices: ${error.message}`);
  }

  if (!invoices || invoices.length === 0) {
    console.log('No invoices found');
    return new Map();
  }

  console.log(`Found ${invoices.length} total invoices\n`);
  console.log('🔎 Identifying duplicate groups...\n');

  // Group by vendor + date + amount
  const groups = new Map<string, Invoice[]>();

  for (const invoice of invoices as Invoice[]) {
    const key = `${invoice.vendor_id}_${invoice.invoice_date}_${invoice.total_amount}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(invoice);
  }

  // Filter to only groups with potential duplicates
  const duplicateGroups = new Map<string, Invoice[]>();

  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue;

    // Check if any invoice numbers are similar
    let hasDuplicates = false;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (isSimilarInvoiceNumber(group[i].invoice_number, group[j].invoice_number)) {
          hasDuplicates = true;
          break;
        }
      }
      if (hasDuplicates) break;
    }

    if (hasDuplicates) {
      duplicateGroups.set(key, group);
    }
  }

  return duplicateGroups;
}

async function deduplicateInvoices(dryRun: boolean = true) {
  console.log('🗑️  Invoice Deduplication Tool\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes will be made)' : '⚠️  LIVE MODE (will delete duplicates)'}\n`);
  console.log('='.repeat(80));
  console.log();

  const duplicateGroups = await findDuplicateGroups();

  if (duplicateGroups.size === 0) {
    console.log('✅ No duplicate invoices found!');
    return;
  }

  console.log(`Found ${duplicateGroups.size} groups with potential duplicates:\n`);

  let totalDuplicates = 0;
  const deleteIds: string[] = [];

  for (const [key, group] of duplicateGroups.entries()) {
    const vendor = (group[0].vendors as any)?.name || 'Unknown Vendor';
    console.log(`📋 Group: ${vendor} - ${group[0].invoice_date} - $${group[0].total_amount}`);
    console.log(`   Found ${group.length} invoices:`);

    // Sort by created_at (earliest first) - we keep the earliest
    group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    // Group by similar invoice numbers
    const similarGroups = new Map<string, Invoice[]>();

    for (const invoice of group) {
      let added = false;
      for (const [normNum, similarGroup] of similarGroups.entries()) {
        if (isSimilarInvoiceNumber(invoice.invoice_number, normNum)) {
          similarGroup.push(invoice);
          added = true;
          break;
        }
      }
      if (!added) {
        similarGroups.set(invoice.invoice_number, [invoice]);
      }
    }

    // Process each similar group
    for (const [_, similarInvoices] of similarGroups.entries()) {
      if (similarInvoices.length < 2) continue;

      const keep = similarInvoices[0]; // Earliest created
      const duplicates = similarInvoices.slice(1);

      console.log(`   ✅ KEEP: ${keep.invoice_number} (ID: ${keep.id.substring(0, 8)}..., Created: ${keep.created_at})`);

      for (const dup of duplicates) {
        console.log(`   ❌ DELETE: ${dup.invoice_number} (ID: ${dup.id.substring(0, 8)}..., Created: ${dup.created_at})`);
        deleteIds.push(dup.id);
        totalDuplicates++;
      }
    }

    console.log();
  }

  console.log('='.repeat(80));
  console.log(`\n📊 Summary: Found ${totalDuplicates} duplicate invoices to delete\n`);

  if (deleteIds.length === 0) {
    console.log('✅ No duplicates need to be deleted');
    return;
  }

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes made');
    console.log('\nTo actually delete these duplicates, run:');
    console.log('  node_modules/.bin/tsx scripts/deduplicate-invoices.ts --execute\n');
    return;
  }

  // LIVE MODE - Actually delete
  console.log('⚠️  DELETING DUPLICATES...\n');

  // Delete invoice lines first (foreign key constraint)
  console.log('Deleting invoice lines...');
  const { error: linesError } = await supabase
    .from('invoice_lines')
    .delete()
    .in('invoice_id', deleteIds);

  if (linesError) {
    console.error('❌ Failed to delete invoice lines:', linesError);
    throw linesError;
  }

  // Delete invoices
  console.log('Deleting invoices...');
  const { error: invoicesError } = await supabase
    .from('invoices')
    .delete()
    .in('id', deleteIds);

  if (invoicesError) {
    console.error('❌ Failed to delete invoices:', invoicesError);
    throw invoicesError;
  }

  console.log(`\n✅ Successfully deleted ${totalDuplicates} duplicate invoices!`);

  // Note: We're not deleting storage files as they might be referenced elsewhere
  // or could be useful for audit trail
  console.log('\n📝 Note: Storage files were NOT deleted (kept for audit trail)');
}

// Run
const args = process.argv.slice(2);
const execute = args.includes('--execute') || args.includes('--live');

deduplicateInvoices(!execute)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
