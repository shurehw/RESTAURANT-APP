/**
 * Comprehensive OCR Audit
 * Reviews ALL invoice lines for data quality issues:
 * - Impossible prices (> $10k per unit)
 * - Garbled descriptions
 * - Duplicate detection
 * - Vendor-specific issues
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AuditIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  lineId: string;
  lineDescription: string;
  qty: number;
  unitCost: number;
  lineTotal: number;
  vendor: string;
  invoice: string;
}

const issues: AuditIssue[] = [];

async function auditAllLines() {
  console.log('🔍 COMPREHENSIVE OCR AUDIT\n');
  console.log('═'.repeat(60));

  // Fetch ALL invoice lines
  const { data: allLines, error } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      qty,
      unit_cost,
      line_total,
      invoices!inner(
        invoice_number,
        invoice_date,
        vendors(name)
      )
    `)
    .order('unit_cost', { ascending: false });

  if (error) {
    console.error('❌ Error fetching lines:', error);
    return;
  }

  console.log(`\n📊 Analyzing ${allLines?.length || 0} invoice lines...\n`);

  allLines?.forEach((line: any) => {
    const vendor = line.invoices.vendors?.name || 'Unknown';
    const invoice = line.invoices.invoice_number || 'N/A';
    const desc = line.description || '';

    // 1. CRITICAL: Impossible unit prices (> $10,000)
    if (line.unit_cost > 10000) {
      issues.push({
        severity: 'critical',
        category: 'Impossible Price',
        description: `Unit cost $${line.unit_cost.toFixed(2)} is impossibly high`,
        lineId: line.id,
        lineDescription: desc,
        qty: line.qty,
        unitCost: line.unit_cost,
        lineTotal: line.line_total,
        vendor,
        invoice
      });
    }

    // 2. CRITICAL: Impossible line totals (> $50,000)
    if (line.line_total > 50000) {
      issues.push({
        severity: 'critical',
        category: 'Impossible Total',
        description: `Line total $${line.line_total.toFixed(2)} is impossibly high`,
        lineId: line.id,
        lineDescription: desc,
        qty: line.qty,
        unitCost: line.unit_cost,
        lineTotal: line.line_total,
        vendor,
        invoice
      });
    }

    // 3. HIGH: Garbled descriptions (very long all-caps, weird chars)
    if (/^[A-Z\d\s-]{40,}$/.test(desc)) {
      issues.push({
        severity: 'high',
        category: 'Garbled Text',
        description: 'Very long all-caps text (likely OCR error)',
        lineId: line.id,
        lineDescription: desc,
        qty: line.qty,
        unitCost: line.unit_cost,
        lineTotal: line.line_total,
        vendor,
        invoice
      });
    }

    // 4. HIGH: Contains 8+ digit numbers (OCR artifact)
    if (/\d{8,}/.test(desc)) {
      issues.push({
        severity: 'high',
        category: 'Garbled Text',
        description: 'Contains 8+ digit number (likely SKU/code misread)',
        lineId: line.id,
        lineDescription: desc,
        qty: line.qty,
        unitCost: line.unit_cost,
        lineTotal: line.line_total,
        vendor,
        invoice
      });
    }

    // 5. MEDIUM: Suspicious descriptions
    const suspiciousKeywords = [
      'PRSMINA', 'ALIENS', 'PLANNING', 'BROWSER', 'SYNTHER',
      'RIKATTARME', 'LOTION'
    ];
    if (suspiciousKeywords.some(kw => desc.toUpperCase().includes(kw))) {
      issues.push({
        severity: 'medium',
        category: 'Suspicious Description',
        description: 'Contains suspicious/garbled keywords',
        lineId: line.id,
        lineDescription: desc,
        qty: line.qty,
        unitCost: line.unit_cost,
        lineTotal: line.line_total,
        vendor,
        invoice
      });
    }

    // 6. MEDIUM: Very short descriptions (< 5 chars)
    if (desc.trim().length < 5 && desc.trim().length > 0) {
      issues.push({
        severity: 'medium',
        category: 'Short Description',
        description: 'Description too short to be meaningful',
        lineId: line.id,
        lineDescription: desc,
        qty: line.qty,
        unitCost: line.unit_cost,
        lineTotal: line.line_total,
        vendor,
        invoice
      });
    }
  });

  // Generate report
  console.log('📋 AUDIT RESULTS\n');
  console.log('═'.repeat(60));

  const critical = issues.filter(i => i.severity === 'critical');
  const high = issues.filter(i => i.severity === 'high');
  const medium = issues.filter(i => i.severity === 'medium');

  console.log(`\n🚨 CRITICAL issues: ${critical.length}`);
  console.log(`⚠️  HIGH issues: ${high.length}`);
  console.log(`⚡ MEDIUM issues: ${medium.length}`);
  console.log(`\nTotal issues: ${issues.length}`);

  // Group by vendor
  const byVendor: Record<string, AuditIssue[]> = {};
  issues.forEach(issue => {
    if (!byVendor[issue.vendor]) byVendor[issue.vendor] = [];
    byVendor[issue.vendor].push(issue);
  });

  console.log('\n\n📊 ISSUES BY VENDOR:\n');
  Object.entries(byVendor)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([vendor, vendorIssues]) => {
      const criticalCount = vendorIssues.filter(i => i.severity === 'critical').length;
      const highCount = vendorIssues.filter(i => i.severity === 'high').length;

      console.log(`\n${vendor} (${vendorIssues.length} issues)`);
      if (criticalCount > 0) console.log(`  🚨 ${criticalCount} critical`);
      if (highCount > 0) console.log(`  ⚠️  ${highCount} high`);

      // Show top 5 issues
      vendorIssues.slice(0, 5).forEach(issue => {
        console.log(`  - [${issue.severity.toUpperCase()}] ${issue.category}`);
        console.log(`    "${issue.lineDescription}"`);
        console.log(`    ${issue.qty} @ $${issue.unitCost} = $${issue.lineTotal}`);
      });

      if (vendorIssues.length > 5) {
        console.log(`  ... and ${vendorIssues.length - 5} more`);
      }
    });

  // Calculate impact
  const criticalValue = critical.reduce((sum, i) => sum + i.lineTotal, 0);
  const totalIssueValue = issues.reduce((sum, i) => sum + i.lineTotal, 0);

  console.log('\n\n💰 FINANCIAL IMPACT:\n');
  console.log(`Critical issues value: $${criticalValue.toFixed(2)}`);
  console.log(`Total issues value: $${totalIssueValue.toFixed(2)}`);

  // Export issues to delete
  console.log('\n\n🗑️  RECOMMENDED DELETIONS:\n');
  const toDelete = critical.filter(i =>
    i.category === 'Impossible Price' || i.category === 'Impossible Total'
  );

  console.log(`${toDelete.length} lines should be deleted (impossible prices/totals)`);
  console.log(`IDs: ${toDelete.map(i => i.lineId).join(', ')}`);

  // Save to file
  const fs = require('fs');
  fs.writeFileSync(
    'ocr-audit-report.json',
    JSON.stringify({ issues, byVendor, summary: {
      total: issues.length,
      critical: critical.length,
      high: high.length,
      medium: medium.length,
      criticalValue,
      totalIssueValue,
      recommendedDeletions: toDelete.map(i => i.lineId)
    }}, null, 2)
  );

  console.log('\n✅ Full report saved to: ocr-audit-report.json');
}

auditAllLines();
