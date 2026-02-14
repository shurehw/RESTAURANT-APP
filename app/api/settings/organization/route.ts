import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, orgSettingsSchema } from '@/lib/validate';

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':settings-org');
    const user = await requireUser();
    const { orgId } = await getUserOrgAndVenues(user.id);

    // Use admin client — auth already validated by requireUser + getUserOrgAndVenues
    const supabase = createAdminClient();

    // Get organization settings
    const { data: settings, error: settingsError } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    if (settingsError) {
      // If no settings exist, create default settings
      const { data: newSettings, error: createError } = await supabase
        .from('organization_settings')
        .insert({
          organization_id: orgId,
        })
        .select()
        .single();

      if (createError) throw createError;

      return NextResponse.json({ success: true, settings: newSettings });
    }

    return NextResponse.json({ success: true, settings });
  });
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':settings-org');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    // Only admins and owners can modify settings
    if (!['owner', 'admin'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners and admins can modify organization settings',
      };
    }

    const body = await request.json();
    const validated = validate(orgSettingsSchema, body);

    // Use admin client — auth already validated by requireUser + getUserOrgAndVenues
    const supabase = createAdminClient();

    // Update settings
    const { error: updateError } = await supabase
      .from('organization_settings')
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  });
}
