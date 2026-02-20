/**
 * Query TipSee for labor-related tables using postgres.js
 */

import postgres from 'postgres';
import { TIPSEE_CONFIG } from './_config.mjs';

const sql = postgres({
  host: TIPSEE_CONFIG.host,
  username: TIPSEE_CONFIG.user,
  password: TIPSEE_CONFIG.password,
  database: TIPSEE_CONFIG.database,
  port: TIPSEE_CONFIG.port,
  ssl: 'require',
});

try {
  console.log('Searching TipSee for labor-related tables...\n');

  // Find ALL tables (labor naming might differ in TipSee)
  const allTables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  console.log(`All tables in TipSee (${allTables.length}):`);
  allTables.forEach(t => console.log(`  ${t.table_name}`));

  // Filter for labor-like tables
  const laborTables = allTables.filter(t => {
    const n = t.table_name.toLowerCase();
    return n.includes('labor') || n.includes('shift') || n.includes('punch') ||
           n.includes('time') || n.includes('clock') || n.includes('employee') ||
           n.includes('payroll') || n.includes('schedule') || n.includes('staff') ||
           n.includes('wage') || n.includes('hour') || n.includes('role') ||
           n.includes('position');
  });

  console.log(`\nLabor-related tables (${laborTables.length}):`);
  laborTables.forEach(t => console.log(`  >> ${t.table_name}`));

  // For each labor table, show columns and sample data
  for (const tableRow of laborTables) {
    const tableName = tableRow.table_name;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`TABLE: ${tableName}`);
    console.log('='.repeat(70));

    const cols = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
      ORDER BY ordinal_position
    `;
    console.log('\nColumns:');
    cols.forEach(c => console.log(`  ${c.column_name.padEnd(40)} ${c.data_type}`));

    const count = await sql.unsafe(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
    console.log(`\nRows: ${count[0].cnt}`);

    if (Number(count[0].cnt) > 0) {
      const sample = await sql.unsafe(`SELECT * FROM "${tableName}" LIMIT 2`);
      console.log('\nSample:');
      console.log(JSON.stringify(sample, null, 2));
    }
  }

  // Also check tipsee_checks columns for employee/time info
  console.log(`\n${'='.repeat(70)}`);
  console.log('EMPLOYEE COLUMNS IN tipsee_checks:');
  console.log('='.repeat(70));
  const checkCols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tipsee_checks'
    ORDER BY ordinal_position
  `;
  checkCols.forEach(c => console.log(`  ${c.column_name.padEnd(40)} ${c.data_type}`));

  await sql.end();
} catch (err) {
  console.error('Error:', err.message);
  await sql.end();
  process.exit(1);
}
