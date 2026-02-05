import { Pool } from 'pg';

const pool = new Pool({
  host: 'TIPSEE_HOST_REDACTED',
  user: 'TIPSEE_USERNAME_REDACTED',
  port: 5432,
  database: 'postgres',
  password: 'TIPSEE_PASSWORD_REDACTED',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    const r = await pool.query(`
      SELECT location as name, location_uuid as uuid, COUNT(*)::int as checks
      FROM public.tipsee_checks
      WHERE location_uuid IS NOT NULL
      GROUP BY location, location_uuid
      ORDER BY location
    `);
    console.log('TipSee Locations:');
    console.log(JSON.stringify(r.rows, null, 2));
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}

main();
