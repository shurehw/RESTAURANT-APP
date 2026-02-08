/**
 * Backfill Fact Tables Script
 *
 * Populates venue_day_facts and related tables with historical TipSee data
 * to enable proper WTD and PTD calculations.
 *
 * Usage:
 *   npx ts-node scripts/backfill-fact-tables.ts
 *   npx ts-node scripts/backfill-fact-tables.ts --start 2025-12-29 --end 2026-02-05
 *   npx ts-node scripts/backfill-fact-tables.ts --days 90
 *   npx ts-node scripts/backfill-fact-tables.ts --venue-id abc-123
 */

import { backfillDateRange, getVenueTipseeMappings } from '../lib/etl/tipsee-sync';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let startDate: string | undefined;
  let endDate: string | undefined;
  let daysBack = 90; // Default to 90 days for good WTD/PTD coverage
  let venueId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--start':
        startDate = args[++i];
        break;
      case '--end':
        endDate = args[++i];
        break;
      case '--days':
        daysBack = parseInt(args[++i], 10);
        break;
      case '--venue-id':
        venueId = args[++i];
        break;
      case '--help':
        console.log(`
Backfill Fact Tables Script

Populates venue_day_facts and related tables with historical TipSee data.

Options:
  --start YYYY-MM-DD    Start date for backfill
  --end YYYY-MM-DD      End date for backfill (defaults to yesterday)
  --days N              Number of days to backfill (default: 90)
  --venue-id UUID       Only backfill a specific venue
  --help                Show this help message

Examples:
  npx ts-node scripts/backfill-fact-tables.ts
  npx ts-node scripts/backfill-fact-tables.ts --days 60
  npx ts-node scripts/backfill-fact-tables.ts --start 2025-12-29 --end 2026-02-05
        `);
        process.exit(0);
    }
  }

  // Calculate date range
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (!endDate) {
    endDate = yesterday.toISOString().split('T')[0];
  }

  if (!startDate) {
    const start = new Date(yesterday);
    start.setDate(start.getDate() - daysBack + 1);
    startDate = start.toISOString().split('T')[0];
  }

  console.log('='.repeat(60));
  console.log('Fact Table Backfill');
  console.log('='.repeat(60));
  console.log(`Date Range: ${startDate} → ${endDate}`);

  // Get venue info
  const mappings = await getVenueTipseeMappings();
  const targetVenues = venueId
    ? mappings.filter(m => m.venue_id === venueId)
    : mappings;

  if (targetVenues.length === 0) {
    console.error('No venue mappings found.');
    process.exit(1);
  }

  console.log(`Venues: ${targetVenues.map(v => v.venue_name).join(', ')}`);

  // Calculate total days
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();
  const totalDays = Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
  const totalSyncs = totalDays * targetVenues.length;

  console.log(`Total days: ${totalDays}`);
  console.log(`Total syncs: ${totalSyncs}`);
  console.log('='.repeat(60));
  console.log('');

  const startTime = Date.now();

  try {
    const result = await backfillDateRange(startDate, endDate, venueId);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('='.repeat(60));
    console.log('Backfill Complete');
    console.log('='.repeat(60));
    console.log(`Total syncs: ${result.total}`);
    console.log(`Successful:  ${result.successful}`);
    console.log(`Failed:      ${result.failed}`);
    console.log(`Duration:    ${duration}s`);
    console.log(`Rate:        ${(result.total / parseFloat(duration)).toFixed(1)} syncs/sec`);

    if (result.failed > 0) {
      console.log('');
      console.log('Check logs above for failed sync details.');
      process.exit(1);
    }

  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

main();
