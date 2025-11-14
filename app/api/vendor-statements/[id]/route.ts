import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/vendor-statements/[id]
 * Fetch vendor statement with all lines and match details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const { id } = await params;

    const supabase = await createClient();

    // Get statement header
    const { data: statement, error: statementError } = await supabase
      .from('vendor_statements')
      .select(`
        *,
        vendors (
          id,
          name,
          vendor_code
        )
      `)
      .eq('id', id)
      .single();

    if (statementError || !statement) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Vendor statement not found' };
    }

    assertVenueAccess(statement.venue_id, venueIds);

    // Get three-way match view for all lines
    const { data: matches, error: matchesError } = await supabase
      .from('three_way_match')
      .select('*')
      .eq('vendor_statement_id', id)
      .order('line_date', { ascending: false });

    if (matchesError) throw matchesError;

    // Calculate summary stats
    const totalLines = matches?.length || 0;
    const matchedLines = matches?.filter(m => m.matched).length || 0;
    const unmatchedLines = totalLines - matchedLines;
    const reviewRequired = matches?.filter(m => m.requires_review).length || 0;
    const totalVariance = matches?.reduce((sum, m) => sum + (m.abs_variance || 0), 0) || 0;

    return NextResponse.json({
      statement: {
        ...statement,
        vendor: (statement.vendors as any),
      },
      lines: matches,
      summary: {
        total_lines: totalLines,
        matched_lines: matchedLines,
        unmatched_lines: unmatchedLines,
        review_required: reviewRequired,
        match_rate: totalLines > 0 ? ((matchedLines / totalLines) * 100).toFixed(1) : 0,
        total_variance: totalVariance.toFixed(2),
      },
    });
  });
}
