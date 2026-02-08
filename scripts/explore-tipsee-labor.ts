/**
 * Explore TipSee Labor Data
 * Queries TipSee database to find labor-related tables and data
 */

import { getTipseePool } from '../lib/database/tipsee';

async function exploreTipSeeLaborData() {
  const pool = getTipseePool();

  try {
    console.log('🔍 Exploring TipSee database for labor data...\n');

    // 1. Find all tables that might contain labor data
    console.log('📋 Finding labor-related tables...');
    const tablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND (
          table_name ILIKE '%labor%' OR
          table_name ILIKE '%shift%' OR
          table_name ILIKE '%punch%' OR
          table_name ILIKE '%time%' OR
          table_name ILIKE '%clock%' OR
          table_name ILIKE '%employee%' OR
          table_name ILIKE '%payroll%' OR
          table_name ILIKE '%schedule%'
        )
      ORDER BY table_name;
    `;
    const tablesResult = await pool.query(tablesQuery);

    console.log(`\nFound ${tablesResult.rows.length} potential labor tables:`);
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    // 2. For each table, show structure and sample data
    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;
      console.log(`\n${'='.repeat(80)}`);
      console.log(`📊 Table: ${tableName}`);
      console.log('='.repeat(80));

      // Get column info
      const columnsQuery = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position;
      `;
      const columnsResult = await pool.query(columnsQuery, [tableName]);

      console.log('\nColumns:');
      columnsResult.rows.forEach(col => {
        console.log(`  ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });

      // Get row count
      const countQuery = `SELECT COUNT(*) as count FROM "${tableName}";`;
      const countResult = await pool.query(countQuery);
      console.log(`\nTotal rows: ${countResult.rows[0].count}`);

      // Get sample data (if table has data)
      if (Number(countResult.rows[0].count) > 0) {
        const sampleQuery = `SELECT * FROM "${tableName}" LIMIT 3;`;
        const sampleResult = await pool.query(sampleQuery);

        console.log('\nSample data (first 3 rows):');
        console.log(JSON.stringify(sampleResult.rows, null, 2));
      }
    }

    // 3. Also check for views
    console.log('\n\n📋 Finding labor-related views...');
    const viewsQuery = `
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND (
          table_name ILIKE '%labor%' OR
          table_name ILIKE '%shift%' OR
          table_name ILIKE '%punch%' OR
          table_name ILIKE '%time%' OR
          table_name ILIKE '%employee%'
        )
      ORDER BY table_name;
    `;
    const viewsResult = await pool.query(viewsQuery);

    console.log(`\nFound ${viewsResult.rows.length} potential labor views:`);
    viewsResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

  } catch (error) {
    console.error('Error exploring TipSee labor data:', error);
  } finally {
    await pool.end();
  }
}

exploreTipSeeLaborData();
