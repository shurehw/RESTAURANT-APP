/**
 * app/api/r365/export/route.ts
 * API route for generating R365 AP export batch.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateR365APExport } from '@/lib/integrations/r365';

export async function POST() {
  try {
    const supabase = await createClient();

    // Generate export
    const path = await generateR365APExport(supabase);

    return NextResponse.json({
      success: true,
      message: 'R365 export generated successfully',
      path,
    });
  } catch (err: any) {
    console.error('R365 export error:', err);

    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Export failed',
      },
      { status: 500 }
    );
  }
}
