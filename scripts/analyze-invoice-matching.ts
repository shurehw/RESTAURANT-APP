import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyzeInvoiceMatching(invoiceId: string) {
  // Get invoice details with venue for organization_id
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, vendor:vendors(id, name), venue:venues(id, name, organization_id)')
    .eq('id', invoiceId)
    .single();

  if (!invoice) {
    console.error('Invoice not found');
    return;
  }

  const orgId = invoice.venue?.organization_id;
  if (!orgId) {
    console.error('No organization found for this invoice');
    return;
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`INVOICE MATCHING ANALYSIS: ${invoice.invoice_number}`);
  console.log(`Vendor: ${invoice.vendor?.name}`);
  console.log(`Organization: ${orgId}`);
  console.log('═══════════════════════════════════════════════════\n');

  // Get all invoice lines
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('*, item:items(id, name, sku)')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true });

  if (!lines || lines.length === 0) {
    console.log('No invoice lines found');
    return;
  }

  const mapped = lines.filter(l => l.item_id !== null);
  const unmapped = lines.filter(l => l.item_id === null);

  console.log(`📊 SUMMARY`);
  console.log(`─────────────────────────────────────────────────`);
  console.log(`  Total lines: ${lines.length}`);
  console.log(`  Mapped: ${mapped.length} (${Math.round(mapped.length / lines.length * 100)}%)`);
  console.log(`  Unmapped: ${unmapped.length} (${Math.round(unmapped.length / lines.length * 100)}%)`);
  console.log('');

  console.log(`🔍 ANALYZING UNMAPPED ITEMS (${unmapped.length})`);
  console.log('═══════════════════════════════════════════════════\n');

  for (const line of unmapped) {
    console.log(`📦 ${line.description}`);
    console.log(`   Qty: ${line.qty} | Unit Cost: $${line.unit_cost} | Total: $${line.line_total}`);

    // Apply normalization logic from search API
    const query = line.description || '';
    let normalizedQuery = query
      .replace(/[*\-_\/\\|]/g, ' ')
      .replace(/\b(tequila|vodka|whiskey|whisky|gin|rum|bourbon|scotch|cognac|brandy|liqueur|wine|beer|champagne|mezcal)\b/gi, ' ')
      .replace(/\b(japanese|french|scottish|american|mexican|irish|canadian)\b/gi, ' ')
      .replace(/\b(wh|whis|whisk)\b/gi, ' ')
      .replace(/\b(el0|oro|elo)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    normalizedQuery = normalizedQuery
      .replace(/\bfamily\b/gi, 'familia')
      .replace(/\breserva\b/gi, 'reposado');

    console.log(`   Normalized: "${normalizedQuery}"`);

    // Try to find matches
    const { data: matches, error } = await supabase
      .from('items')
      .select('id, name, sku, category')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .or(`name.ilike.%${normalizedQuery}%,sku.ilike.%${normalizedQuery}%`)
      .limit(5);

    if (error) {
      console.log(`   ❌ Search error: ${error.message}`);
    } else if (!matches || matches.length === 0) {
      console.log(`   ❌ No matches found`);

      // Try partial searches to help debug
      const words = normalizedQuery.split(' ').filter(w => w.length >= 3);
      if (words.length > 0) {
        const firstWord = words[0];
        const { data: partialMatches } = await supabase
          .from('items')
          .select('name')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .ilike('name', `%${firstWord}%`)
          .limit(3);

        if (partialMatches && partialMatches.length > 0) {
          console.log(`   💡 Possible matches for "${firstWord}":`);
          partialMatches.forEach(m => console.log(`      - ${m.name}`));
        }
      }
    } else {
      console.log(`   ✅ Found ${matches.length} match(es):`);
      matches.forEach(m => console.log(`      - ${m.name} (${m.sku})`));
    }

    console.log('');
  }

  console.log(`\n✅ MAPPED ITEMS (${mapped.length})`);
  console.log('═══════════════════════════════════════════════════\n');

  mapped.slice(0, 10).forEach(line => {
    console.log(`  ${line.description}`);
    console.log(`    → ${line.item?.name} (${line.item?.sku})`);
  });

  if (mapped.length > 10) {
    console.log(`  ... and ${mapped.length - 10} more`);
  }
}

const invoiceId = process.argv[2] || '1841471';
analyzeInvoiceMatching(invoiceId);
