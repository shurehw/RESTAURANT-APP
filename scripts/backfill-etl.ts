/**
 * Backfill ETL script - runs sequentially to avoid overwhelming the edge function
 * Usage: npx tsx scripts/backfill-etl.ts [days]
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function syncDate(date: string): Promise<{ success: boolean; summary: any }> {
  const url = `${SUPABASE_URL}/functions/v1/etl-sync?date=${date}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  const data = await res.json();
  return { success: res.ok && data.success, summary: data.summary || data };
}

async function main() {
  const days = parseInt(process.argv[2] || '90');
  console.log(`\n🚀 Starting backfill for ${days} days...\n`);

  const results = { success: 0, failed: 0 };
  const startTime = Date.now();

  for (let i = days; i >= 1; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    process.stdout.write(`[${days - i + 1}/${days}] ${dateStr}... `);

    try {
      const { success, summary } = await syncDate(dateStr);
      if (success) {
        console.log(`✓ ${summary.successful}/${summary.total} venues`);
        results.success++;
      } else {
        console.log(`✗ Failed: ${JSON.stringify(summary).slice(0, 100)}`);
        results.failed++;
      }
    } catch (e: any) {
      console.log(`✗ Error: ${e.message}`);
      results.failed++;
    }

    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n✅ Backfill complete in ${duration}s`);
  console.log(`   Success: ${results.success} days`);
  console.log(`   Failed: ${results.failed} days\n`);
}

main().catch(console.error);
