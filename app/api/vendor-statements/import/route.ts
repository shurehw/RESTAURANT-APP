import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';

interface VendorStatementLine {
  line_number?: number;
  line_date: string;
  invoice_number?: string;
  reference_number?: string;
  description: string;
  amount: number;
}

interface VendorStatementImport {
  vendor_id: string;
  venue_id: string;
  statement_number?: string;
  statement_period_start: string;
  statement_period_end: string;
  statement_total: number;
  lines: VendorStatementLine[];
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    await rateLimit(request, ':vendor-statement-import');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const body: VendorStatementImport = await request.json();
    const { vendor_id, venue_id, statement_number, statement_period_start, statement_period_end, statement_total, lines } = body;

    // Validate required fields
    if (!vendor_id) throw { status: 400, code: 'NO_VENDOR', message: 'vendor_id is required' };
    if (!venue_id) throw { status: 400, code: 'NO_VENUE', message: 'venue_id is required' };
    if (!statement_period_start) throw { status: 400, code: 'NO_START', message: 'statement_period_start is required' };
    if (!statement_period_end) throw { status: 400, code: 'NO_END', message: 'statement_period_end is required' };
    if (statement_total === undefined || statement_total === null) {
      throw { status: 400, code: 'NO_TOTAL', message: 'statement_total is required' };
    }
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      throw { status: 400, code: 'NO_LINES', message: 'lines array is required and cannot be empty' };
    }

    assertVenueAccess(venue_id, venueIds);

    const supabase = await createClient();

    // Use transactional SQL function for atomic import
    const { data, error } = await supabase
      .rpc('import_vendor_statement', {
        p_vendor_id: vendor_id,
        p_venue_id: venue_id,
        p_statement_number: statement_number,
        p_statement_period_start: statement_period_start,
        p_statement_period_end: statement_period_end,
        p_statement_total: statement_total,
        p_lines: JSON.stringify(lines),
        p_imported_by: user.id,
      })
      .single();

    if (error) {
      // Check for duplicate constraint violation
      if (error.code === '23505' || error.message?.includes('duplicate')) {
        throw { status: 409, code: 'DUPLICATE_STATEMENT', message: 'Statement for this period already exists' };
      }
      throw error;
    }

    const { statement_id, total_lines, matched_lines, unmatched_lines, review_required } = data;

    return NextResponse.json({
      success: true,
      statement_id,
      total_lines,
      matched_lines,
      unmatched_lines,
      review_required,
      match_rate: total_lines > 0
        ? ((matched_lines / total_lines) * 100).toFixed(1)
        : '0',
      review_url: `/vendor-statements/${statement_id}`,
    });
  });
}
