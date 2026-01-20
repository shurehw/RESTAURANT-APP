import { Pool } from 'pg';
import { readFileSync } from 'fs';

async function applyMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const sql = readFileSync('supabase/migrations/119_fix_gl_suggestion_ambiguity.sql', 'utf-8');

  console.log('🔧 Applying migration 119...\n');
  console.log('SQL length:', sql.length, 'characters\n');

  try {
    const result = await pool.query(sql);
    console.log('✅ Migration executed successfully');
    console.log('Command:', result.command);
    console.log('Rows:', result.rowCount);
  } catch (error: any) {
    console.error('❌ Migration failed:');
    console.error('Code:', error.code);
    console.error('Message:', error.message);
    if (error.position) console.error('Position:', error.position);
    if (error.detail) console.error('Detail:', error.detail);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  } finally {
    await pool.end();
  }

  console.log('\n✅ Done!\n');
}

applyMigration();
