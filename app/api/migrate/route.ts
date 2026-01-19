import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function POST() {
  try {
    const supabase = await createClient();

    // Read the migration file
    const migrationPath = join(process.cwd(), 'supabase', 'migrations', '082_add_space_planning_fields.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    // Execute the migration
    const { error } = await supabase.rpc('exec', { sql });

    if (error) {
      console.error('Migration error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error running migration:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
