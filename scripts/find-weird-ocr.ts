import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findWeirdOCR() {
  console.log('🔍 Searching for "800 INITIATIVE -31L-2 SEND PAVARH"...\n');

  // Search for this weird description
  const { data: lines } = await supabase
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
    .or('description.ilike.%800 INITIATIVE%,description.ilike.%PAVARH%,description.ilike.%-31L-2%')
    .limit(10);

  if (lines && lines.length > 0) {
    console.log(`Found ${lines.length} lines with weird OCR:\n`);
    lines.forEach((line: any) => {
      console.log('━'.repeat(60));
      console.log('Invoice:', line.invoices.invoice_number || 'N/A');
      console.log('Date:', line.invoices.invoice_date);
      console.log('Vendor:', line.invoices.vendors?.name || 'Unknown');
      console.log('Description:', line.description);
      console.log('Qty:', line.qty, '@ $' + line.unit_cost, '= $' + line.line_total);
      console.log();
    });
  } else {
    console.log('No exact matches found.\n');
  }

  // Look for other potentially garbled OCR (descriptions with lots of uppercase, numbers, and weird chars)
  console.log('🔍 Looking for other potentially garbled OCR...\n');

  const { data: suspiciousLines } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      qty,
      unit_cost,
      invoices!inner(
        invoice_number,
        vendors(name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (suspiciousLines) {
    const garbled = suspiciousLines.filter((line: any) => {
      const desc = line.description || '';
      // Look for descriptions with multiple consecutive uppercase, lots of numbers, or weird patterns
      return (
        /[A-Z]{10,}/.test(desc) || // 10+ consecutive caps
        /-\d+L-\d+/.test(desc) || // Pattern like -31L-2
        /\d{3,}\s+[A-Z]{8,}/.test(desc) || // Pattern like "800 INITIATIVE"
        /SEND\s+[A-Z]+/.test(desc) // Pattern like "SEND PAVARH"
      );
    });

    if (garbled.length > 0) {
      console.log(`Found ${garbled.length} potentially garbled descriptions:\n`);
      garbled.slice(0, 20).forEach((line: any) => {
        console.log(`[${line.invoices.vendors?.name || 'Unknown'}] ${line.description}`);
        console.log(`  Qty: ${line.qty} @ $${line.unit_cost}`);
        console.log();
      });
    }
  }
}

findWeirdOCR();
