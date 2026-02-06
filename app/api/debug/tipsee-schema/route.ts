/**
 * Debug: TipSee Schema Explorer
 * Queries TipSee database to find labor-related tables
 */

import { NextResponse } from 'next/server';
import { getTipseePool } from '@/lib/database/tipsee';

export async function GET() {
  const pool = getTipseePool();

  try {
    // Find all tables that might contain labor data
    const tablesQuery = `
      SELECT
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
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

    const tables = [];

    // For each table, get columns and sample data
    for (const tableRow of tablesResult.rows) {
      const tableName = tableRow.table_name;

      // Get column info
      const columnsQuery = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
        ORDER BY ordinal_position;
      `;
      const columnsResult = await pool.query(columnsQuery, [tableName]);

      // Get row count
      const countQuery = `SELECT COUNT(*) as count FROM "${tableName}";`;
      const countResult = await pool.query(countQuery);

      // Get sample data (if table has data)
      let sampleData = null;
      if (Number(countResult.rows[0].count) > 0) {
        const sampleQuery = `SELECT * FROM "${tableName}" LIMIT 2;`;
        const sampleResult = await pool.query(sampleQuery);
        sampleData = sampleResult.rows;
      }

      tables.push({
        name: tableName,
        columns: columnsResult.rows,
        row_count: Number(countResult.rows[0].count),
        sample_data: sampleData,
      });
    }

    // Also check what employee/time-related columns exist in existing tables
    const knownTablesQuery = `
      SELECT
        c.table_name,
        c.column_name,
        c.data_type
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name IN ('tipsee_checks', 'tipsee_check_items')
        AND (
          c.column_name ILIKE '%employee%' OR
          c.column_name ILIKE '%time%' OR
          c.column_name ILIKE '%clock%' OR
          c.column_name ILIKE '%shift%'
        )
      ORDER BY c.table_name, c.ordinal_position;
    `;
    const knownColumnsResult = await pool.query(knownTablesQuery);

    return NextResponse.json({
      success: true,
      labor_tables: tables,
      time_columns_in_known_tables: knownColumnsResult.rows,
    });
  } catch (error: any) {
    console.error('TipSee schema exploration error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
