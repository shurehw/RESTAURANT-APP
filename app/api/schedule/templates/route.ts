import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, scheduleTemplateSchema } from '@/lib/validate';
import { z } from 'zod';

// GET /api/schedule/templates - List all templates for venue
export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':templates-list');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = request.nextUrl.searchParams;
    const venueId = searchParams.get('venue_id');

    if (!venueId) {
      throw {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'venue_id required',
      };
    }

    assertVenueAccess(venueId, venueIds);

    const supabase = await createClient();

    const { data: templates, error } = await supabase
      .from('schedule_templates')
      .select('*')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, templates: templates || [] });
  });
}

// POST /api/schedule/templates - Create new template
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':templates-create');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);

    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const validated = validate(scheduleTemplateSchema, body);

    assertVenueAccess(validated.venue_id, venueIds);

    const supabase = await createClient();

    const { data: template, error } = await supabase
      .from('schedule_templates')
      .insert({
        venue_id: validated.venue_id,
        name: validated.name,
        description: validated.description,
        template_type: validated.template_type,
        template_data: validated.template_data,
        created_by: validated.created_by,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, template });
  });
}
