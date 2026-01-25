/**
 * Review all vendors for OCR errors, suspicious names, and potential merges
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function reviewVendors() {
  console.log('📋 Reviewing all vendors for issues...\n');

  // Get all vendors with invoice counts
  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, is_active')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!vendors || vendors.length === 0) {
    console.log('No vendors found');
    return;
  }

  console.log(`Found ${vendors.length} active vendors\n`);

  // Get invoice counts for each vendor
  const vendorsWithCounts = await Promise.all(
    vendors.map(async (vendor) => {
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', vendor.id);

      return { ...vendor, invoice_count: count || 0 };
    })
  );

  // Sort by invoice count descending
  vendorsWithCounts.sort((a, b) => b.invoice_count - a.invoice_count);

  console.log('All vendors (sorted by invoice count):\n');
  console.log('═'.repeat(100));
  console.log('COUNT | VENDOR NAME');
  console.log('═'.repeat(100));

  vendorsWithCounts.forEach((vendor, idx) => {
    const count = String(vendor.invoice_count).padStart(5, ' ');
    console.log(`${count} | ${vendor.name}`);
  });

  console.log('═'.repeat(100));
  console.log();

  // Flag suspicious patterns
  console.log('🔍 Suspicious Patterns:\n');

  const issues: Array<{ vendor: typeof vendorsWithCounts[0], issue: string }> = [];

  for (const vendor of vendorsWithCounts) {
    const name = vendor.name.toLowerCase();

    // Check for restaurant/venue names (should not be vendors)
    if (name.includes('delilah') || name.includes('hwood')) {
      issues.push({ vendor, issue: 'Contains restaurant/venue name' });
    }

    // Check for generic/placeholder names
    if (name.includes('unknown') || name.includes('test') || name.includes('temp')) {
      issues.push({ vendor, issue: 'Generic/placeholder name' });
    }

    // Check for very short names (likely OCR errors)
    if (vendor.name.length < 3) {
      issues.push({ vendor, issue: 'Very short name (likely OCR error)' });
    }

    // Check for numbers-only (likely invoice numbers, not vendors)
    if (/^\d+$/.test(vendor.name.trim())) {
      issues.push({ vendor, issue: 'Numbers only (likely invoice number)' });
    }

    // Check for LLC/Inc variations that might be same company
    const baseName = vendor.normalized_name
      .replace(/\b(llc|inc|corp|ltd|company)\b/gi, '')
      .trim();

    // Find potential duplicates
    const similar = vendorsWithCounts.filter(v => {
      if (v.id === vendor.id) return false;
      const otherBase = v.normalized_name
        .replace(/\b(llc|inc|corp|ltd|company)\b/gi, '')
        .trim();
      return baseName === otherBase && baseName.length > 3;
    });

    if (similar.length > 0) {
      issues.push({
        vendor,
        issue: `Potential duplicate of: ${similar.map(v => v.name).join(', ')}`
      });
    }
  }

  if (issues.length > 0) {
    issues.forEach(({ vendor, issue }) => {
      console.log(`⚠️  ${vendor.name} (${vendor.invoice_count} invoices)`);
      console.log(`   Issue: ${issue}`);
      console.log(`   ID: ${vendor.id}`);
      console.log();
    });
  } else {
    console.log('✅ No obvious issues found');
  }

  console.log('═'.repeat(100));
  console.log(`\n📊 Summary:`);
  console.log(`   Total vendors: ${vendors.length}`);
  console.log(`   Vendors with invoices: ${vendorsWithCounts.filter(v => v.invoice_count > 0).length}`);
  console.log(`   Vendors without invoices: ${vendorsWithCounts.filter(v => v.invoice_count === 0).length}`);
  console.log(`   Potential issues: ${issues.length}\n`);
}

reviewVendors().catch(console.error);
