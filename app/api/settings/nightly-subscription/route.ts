/**
 * Self-service nightly report subscription API
 *
 * GET  — Check if current user is subscribed
 * POST — Toggle subscription on/off (creates with 'auto' scope if none exists)
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':nightly-subscription');
    const user = await requireUser();
    const { orgId } = await getUserOrgAndVenues(user.id);

    const supabase = getServiceClient();
    const { data } = await (supabase as any)
      .from('nightly_report_subscribers')
      .select('id, is_active')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      subscribed: data?.is_active ?? false,
      exists: !!data,
    });
  });
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':nightly-subscription');
    const user = await requireUser();
    const { orgId } = await getUserOrgAndVenues(user.id);

    const supabase = getServiceClient();

    // Check for existing subscription
    const { data: existing } = await (supabase as any)
      .from('nightly_report_subscribers')
      .select('id, is_active')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      // Toggle is_active
      const { error } = await (supabase as any)
        .from('nightly_report_subscribers')
        .update({ is_active: !existing.is_active })
        .eq('id', existing.id);

      if (error) throw error;

      return NextResponse.json({
        success: true,
        subscribed: !existing.is_active,
      });
    }

    // Create new subscription with 'auto' scope
    const { error } = await (supabase as any)
      .from('nightly_report_subscribers')
      .insert({
        org_id: orgId,
        user_id: user.id,
        email: user.email,
        venue_scope: 'auto',
        created_by: user.id,
      });

    if (error) throw error;

    return NextResponse.json({ success: true, subscribed: true });
  });
}
