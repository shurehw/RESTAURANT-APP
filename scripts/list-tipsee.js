const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.TIPSEE_DB_HOST,
  user: process.env.TIPSEE_DB_USER,
  port: parseInt(process.env.TIPSEE_DB_PORT || '5432'),
  database: process.env.TIPSEE_DB_NAME || 'postgres',
  password: process.env.TIPSEE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    const res = await pool.query(`
      SELECT
        location as name,
        location_uuid as uuid,
        MIN(trading_day)::date as first_date,
        MAX(trading_day)::date as last_date,
        COUNT(*)::int as total_checks
      FROM public.tipsee_checks
      WHERE location_uuid IS NOT NULL AND location IS NOT NULL
      GROUP BY location, location_uuid
      ORDER BY location
    `);

    console.log('\n=== TipSee Locations ===\n');
    console.log('Name'.padEnd(35) + 'UUID'.padEnd(40) + 'Date Range'.padEnd(25) + 'Checks');
    console.log('-'.repeat(110));

    for (const r of res.rows) {
      console.log(
        r.name.padEnd(35) +
        r.uuid.padEnd(40) +
        (r.first_date + ' to ' + r.last_date).padEnd(25) +
        r.total_checks.toLocaleString()
      );
    }

    console.log('\n--- SQL to insert mappings ---\n');
    for (const r of res.rows) {
      console.log(`-- ${r.name}`);
      console.log(`INSERT INTO venue_tipsee_mapping (venue_id, tipsee_location_uuid, tipsee_location_name)`);
      console.log(`VALUES ('YOUR-VENUE-UUID', '${r.uuid}', '${r.name}')`);
      console.log(`ON CONFLICT (venue_id) DO UPDATE SET tipsee_location_uuid = EXCLUDED.tipsee_location_uuid;\n`);
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

main();
