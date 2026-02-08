/**
 * Backfill ETL script - runs sequentially to avoid overwhelming the edge function
 * Usage: npx tsx scripts/backfill-etl.ts [days]
 */

const SUPABASE_URL = 'https://mnraeesscqsaappkaldb.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucmFlZXNzY3FzYWFwcGthbGRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYzOTE3NCwiZXhwIjoyMDc4MjE1MTc0fQ.N4erm4GjP1AV8uDP2OVPBIdZnNtuofPmyLFdM2IVhXI';

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
