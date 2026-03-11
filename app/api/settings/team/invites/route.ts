/**
 * Team Invites API
 *
 * GET  — List pending invites for the user's org
 * POST — Create a new invite and send email
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate } from '@/lib/validate';
import {
  getPendingInvites,
  createInvite,
  getTeamMembers,
} from '@/lib/database/team';
import { getResendClient, FROM_EMAIL } from '@/lib/email/resend';
import { renderInviteEmail } from '@/lib/email/invite-template';
import { getServiceClient } from '@/lib/supabase/service';
import { ROLE_LABELS } from '@/lib/nav/role-permissions';
import { z } from 'zod';

const VALID_ROLES = [
  'owner', 'director', 'gm', 'agm', 'manager',
  'exec_chef', 'sous_chef', 'readonly', 'pwa',
  'onboarding',
] as const;

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(VALID_ROLES),
  venue_ids: z.array(z.string().uuid()).nullable().optional(),
});

export async function GET(request: NextRequest) {
  return guard(async () => {
    await rateLimit(request, ':team-invites');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'admin', 'director'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners, admins, and directors can manage invites',
      };
    }

    const invites = await getPendingInvites(orgId);

    return NextResponse.json({ success: true, invites });
  });
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    await rateLimit(request, ':team-invites');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);

    if (!['owner', 'admin', 'director'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners, admins, and directors can manage invites',
      };
    }

    const body = await request.json();
    const validated = validate(createInviteSchema, body);

    // Check if email is already an active member
    const members = await getTeamMembers(orgId);
    const existingMember = members.find(
      (m) => m.email.toLowerCase() === validated.email.toLowerCase() && m.is_active
    );
    if (existingMember) {
      throw {
        status: 409,
        code: 'ALREADY_MEMBER',
        message: 'This email is already an active team member',
      };
    }

    // Create the invite
    const invite = await createInvite({
      orgId,
      email: validated.email,
      role: validated.role,
      venueIds: validated.venue_ids ?? null,
      invitedBy: user.id,
    });

    // Get org name for email
    const supabase = getServiceClient();
    const { data: org } = await (supabase as any)
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    // Get inviter name
    const { data: inviterData } = await supabase.auth.admin.getUserById(user.id);
    const inviterName =
      inviterData?.user?.user_metadata?.full_name ||
      inviterData?.user?.email ||
      'A team member';

    // Build invite URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteUrl = `${appUrl}/accept-invite?token=${invite.token}`;

    // Send email
    const roleName = ROLE_LABELS[validated.role as keyof typeof ROLE_LABELS] || validated.role;
    const html = renderInviteEmail({
      orgName: org?.name || 'your organization',
      roleName,
      inviterName,
      inviteUrl,
      expiresInDays: 7,
    });

    let emailSent = false;
    try {
      const resend = getResendClient();
      await resend.emails.send({
        from: FROM_EMAIL,
        to: validated.email,
        subject: `You're invited to join ${org?.name || 'OpSOS'}`,
        html,
      });
      emailSent = true;
    } catch (emailError) {
      console.error('[team-invites] Failed to send invite email:', emailError);
    }

    return NextResponse.json({
      success: true,
      invite,
      emailSent,
      // Always return the invite URL so UI can show it as fallback
      inviteUrl,
    });
  });
}
