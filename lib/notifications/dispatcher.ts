/**
 * Notification Dispatcher
 *
 * Channel-agnostic dispatcher for enforcement notifications.
 * Creates in-app notification records and sends Slack webhook messages.
 *
 * Channels:
 *   - in_app: always — inserts into enforcement_notifications table
 *   - slack:  if org has notify_slack=true + slack_webhook_url configured
 *   - email:  future — add as new channel with zero dispatch changes
 */

import { getServiceClient } from '@/lib/supabase/service';
import { resolveRecipients } from './recipients';

// ── Types ──────────────────────────────────────────────────────

export type NotificationType =
  | 'attestation_reminder'
  | 'attestation_late'
  | 'escalation'
  | 'feedback_critical'
  | 'verification_failed';

export interface SendNotificationParams {
  orgId: string;
  venueId?: string;
  userId: string;
  type: NotificationType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  actionUrl?: string;
  sourceTable?: string;
  sourceId?: string;
}

export interface BroadcastNotificationParams {
  orgId: string;
  venueId: string;
  targetRole: string;
  type: NotificationType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  actionUrl?: string;
  sourceTable?: string;
  sourceId?: string;
}

interface OrgNotificationSettings {
  notifySlack: boolean;
  slackWebhookUrl: string | null;
}

// ── Core Dispatch ──────────────────────────────────────────────

/**
 * Send a notification to a single user.
 * Creates an in-app record and optionally sends a Slack message.
 */
export async function sendNotification(params: SendNotificationParams): Promise<void> {
  const supabase = getServiceClient();

  // 1. Insert in-app notification
  const { error } = await (supabase as any)
    .from('enforcement_notifications')
    .insert({
      org_id: params.orgId,
      venue_id: params.venueId || null,
      user_id: params.userId,
      notification_type: params.type,
      severity: params.severity,
      channel: 'in_app',
      title: params.title,
      body: params.body,
      action_url: params.actionUrl || null,
      source_table: params.sourceTable || null,
      source_id: params.sourceId || null,
      delivery_status: 'sent',
    });

  if (error) {
    console.error('[Dispatcher] Failed to insert notification:', error.message);
  }
}

/**
 * Send a Slack webhook notification for the org (one per org, not per user).
 */
async function sendSlackNotification(params: {
  webhookUrl: string;
  title: string;
  body: string;
  severity: string;
  actionUrl?: string;
  venueName?: string;
}): Promise<void> {
  const severityEmoji: Record<string, string> = {
    critical: ':rotating_light:',
    warning: ':warning:',
    info: ':information_source:',
  };

  const emoji = severityEmoji[params.severity] || ':bell:';

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${params.title}*${params.venueName ? ` — ${params.venueName}` : ''}`,
      },
    },
  ];

  if (params.body) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: params.body,
      },
    });
  }

  if (params.actionUrl) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View in OpSOS' },
          url: params.actionUrl,
          style: params.severity === 'critical' ? 'danger' : 'primary',
        },
      ],
    });
  }

  try {
    const response = await fetch(params.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      console.error(
        '[Dispatcher] Slack webhook failed:',
        response.status,
        await response.text()
      );

      // Record Slack delivery failure
      const supabase = getServiceClient();
      await (supabase as any).from('enforcement_notifications').insert({
        org_id: '', // filled by caller if needed
        user_id: '00000000-0000-0000-0000-000000000000',
        notification_type: 'escalation',
        severity: params.severity,
        channel: 'slack',
        title: params.title,
        body: params.body,
        delivery_status: 'failed',
        error_message: `HTTP ${response.status}`,
      });
    }
  } catch (err: any) {
    console.error('[Dispatcher] Slack webhook error:', err.message);
  }
}

/**
 * Fetch org notification settings (Slack config).
 */
async function getOrgNotificationSettings(
  orgId: string
): Promise<OrgNotificationSettings> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('organization_settings')
    .select('notify_slack, slack_webhook_url')
    .eq('organization_id', orgId)
    .maybeSingle();

  return {
    notifySlack: data?.notify_slack ?? false,
    slackWebhookUrl: data?.slack_webhook_url ?? null,
  };
}

/**
 * Resolve venue name for Slack messages.
 */
async function getVenueName(venueId: string): Promise<string> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('venues')
    .select('name')
    .eq('id', venueId)
    .maybeSingle();

  return data?.name || 'Unknown Venue';
}

// ── Broadcast ──────────────────────────────────────────────────

/**
 * Send notification to all users matching a role for a venue.
 * Also sends one Slack message per org if configured.
 */
export async function broadcastNotification(
  params: BroadcastNotificationParams
): Promise<{ sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;

  // 1. Resolve recipients
  const recipients = await resolveRecipients(params.orgId, params.venueId, params.targetRole);

  // 2. Send in-app notification to each recipient
  for (const recipient of recipients) {
    try {
      await sendNotification({
        orgId: params.orgId,
        venueId: params.venueId,
        userId: recipient.userId,
        type: params.type,
        severity: params.severity,
        title: params.title,
        body: params.body,
        actionUrl: params.actionUrl,
        sourceTable: params.sourceTable,
        sourceId: params.sourceId,
      });
      sent++;
    } catch (err: any) {
      errors.push(`Failed to notify user ${recipient.userId}: ${err.message}`);
    }
  }

  // 3. Send one Slack message per org (not per user)
  try {
    const settings = await getOrgNotificationSettings(params.orgId);
    if (settings.notifySlack && settings.slackWebhookUrl) {
      const venueName = await getVenueName(params.venueId);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
      await sendSlackNotification({
        webhookUrl: settings.slackWebhookUrl,
        title: params.title,
        body: params.body,
        severity: params.severity,
        actionUrl: params.actionUrl ? `${baseUrl}${params.actionUrl}` : undefined,
        venueName,
      });
    }
  } catch (err: any) {
    errors.push(`Slack delivery failed: ${err.message}`);
  }

  return { sent, errors };
}
