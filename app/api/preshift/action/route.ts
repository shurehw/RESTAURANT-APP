/**
 * Preshift Item Action API
 *
 * POST /api/preshift/action
 * Body: { source_table, source_id, action, notes? }
 *
 * Polymorphic dispatch — routes to the correct handler based on source_table:
 *   - manager_action → completeAction / dismissAction / escalateAction
 *   - feedback_object → updateFeedbackStatus
 *
 * This lets the preshift UI treat items from both pipelines uniformly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  completeAction,
  dismissAction,
  escalateAction,
} from '@/lib/database/control-plane';
import { updateFeedbackStatus } from '@/lib/feedback/feedback-generator';

type ItemAction = 'complete' | 'dismiss' | 'acknowledge' | 'resolve' | 'escalate';

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    const body = await request.json();
    const {
      source_table,
      source_id,
      action,
      notes,
    }: {
      source_table: 'manager_action' | 'feedback_object';
      source_id: string;
      action: ItemAction;
      notes?: string;
    } = body;

    if (!source_table || !source_id || !action) {
      return NextResponse.json(
        { error: 'source_table, source_id, and action are required' },
        { status: 400 }
      );
    }

    const userId = user.id;
    const userName = user.email || user.id;

    // Route to correct handler
    if (source_table === 'manager_action') {
      let result: { success: boolean; error?: string };

      switch (action) {
        case 'complete':
          result = await completeAction(source_id, userName, notes);
          break;
        case 'dismiss':
          result = await dismissAction(source_id, userName, notes);
          break;
        case 'escalate':
          result = await escalateAction(
            source_id,
            'GM',
            notes || 'Manually escalated from preshift briefing'
          );
          break;
        default:
          return NextResponse.json(
            { error: `Invalid action "${action}" for manager_action. Use: complete, dismiss, escalate` },
            { status: 400 }
          );
      }

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (source_table === 'feedback_object') {
      switch (action) {
        case 'acknowledge':
          await updateFeedbackStatus(source_id, 'acknowledged', userId);
          break;
        case 'resolve':
          await updateFeedbackStatus(
            source_id,
            'resolved',
            userId,
            notes || 'Resolved via preshift briefing'
          );
          break;
        case 'dismiss':
          await updateFeedbackStatus(source_id, 'suppressed', userId, notes);
          break;
        case 'escalate':
          await updateFeedbackStatus(source_id, 'escalated', userId, notes);
          break;
        default:
          return NextResponse.json(
            { error: `Invalid action "${action}" for feedback_object. Use: acknowledge, resolve, dismiss, escalate` },
            { status: 400 }
          );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: `Invalid source_table "${source_table}". Use: manager_action, feedback_object` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('[Preshift Action]', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}
