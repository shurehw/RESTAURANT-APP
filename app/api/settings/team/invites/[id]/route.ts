/**
 * Team Invite Detail API
 *
 * POST   — Resend invite email (extends expiry by 7 days)
 * DELETE — Revoke invite
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { revokeInvite, extendInviteExpiry, getPendingInvites } from '@/lib/database/team';
import { getResendClient, FROM_EMAIL } from '@/lib/email/resend';
import { renderInviteEmail } from '@/lib/email/invite-template';
import { getServiceClient } from '@/lib/supabase/service';
import { ROLE_LABELS } from '@/lib/nav/role-permissions';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    rateLimit(request, ':team-invites');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);
    const { id: inviteId } = await params;

    if (!['owner', 'admin', 'director'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners, admins, and directors can manage invites',
      };
    }

    // Find the invite
    const invites = await getPendingInvites(orgId);
    const invite = invites.find((i) => i.id === inviteId);
    if (!invite) {
      throw {
        status: 404,
        code: 'INVITE_NOT_FOUND',
        message: 'Invite not found or already expired/revoked',
      };
    }

    // Extend expiry
    await extendInviteExpiry(inviteId, orgId);

    // Re-send the email
    const supabase = getServiceClient();
    const { data: org } = await (supabase as any)
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    const { data: inviterData } = await supabase.auth.admin.getUserById(user.id);
    const inviterName =
      inviterData?.user?.user_metadata?.full_name ||
      inviterData?.user?.email ||
      'A team member';

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const inviteUrl = `${appUrl}/accept-invite?token=${invite.token}`;
    const roleName = ROLE_LABELS[invite.role as keyof typeof ROLE_LABELS] || invite.role;

    const html = renderInviteEmail({
      orgName: org?.name || 'your organization',
      roleName,
      inviterName,
      inviteUrl,
      expiresInDays: 7,
    });

    try {
      const resend = getResendClient();
      await resend.emails.send({
        from: FROM_EMAIL,
        to: invite.email,
        subject: `Reminder: You're invited to join ${org?.name || 'OpSOS'}`,
        html,
      });
    } catch (emailError) {
      console.error('[team-invites] Failed to resend invite email:', emailError);
    }

    return NextResponse.json({ success: true });
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    rateLimit(request, ':team-invites');
    const user = await requireUser();
    const { orgId, role } = await getUserOrgAndVenues(user.id);
    const { id: inviteId } = await params;

    if (!['owner', 'admin', 'director'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only owners, admins, and directors can manage invites',
      };
    }

    await revokeInvite(inviteId, orgId);

    return NextResponse.json({ success: true });
  });
}
