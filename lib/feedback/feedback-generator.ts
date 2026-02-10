/**
 * Feedback Generator - Creates feedback objects from signals
 *
 * This is the "Phase 4: Feedback Object Generation" from the OpsOS flow.
 * Signals → Classification → Suppression → Feedback Objects
 */

import { createClient } from '@supabase/supabase-js';
import type { Signal } from './signal-writer';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type RequiredAction = 'acknowledge' | 'explain' | 'correct' | 'resolve';
export type FeedbackStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'suppressed' | 'escalated' | 'expired';
export type OwnerRole = 'venue_manager' | 'gm' | 'agm' | 'corporate' | 'purchasing' | 'system';

export interface FeedbackObjectInput {
  // Scoping
  orgId: string;
  venueId: string;
  businessDate: string;

  // Classification
  domain: Signal['domain'];

  // Content
  title: string; // Short description
  message: string; // Plain-language explanation

  // Action requirements
  requiredAction?: RequiredAction;
  severity?: Signal['severity'];
  confidence?: number;

  // Ownership
  ownerRole?: OwnerRole;
  assignedTo?: string; // User ID

  // Deadlines
  dueAt?: string; // ISO timestamp

  // Verification
  verificationSpec?: Record<string, any>;

  // Source signals
  signalIds?: string[];

  // Audit
  sourceRunId?: string;
}

export interface FeedbackObject extends FeedbackObjectInput {
  id: string;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a feedback object from signals
 */
export async function createFeedbackObject(
  input: FeedbackObjectInput
): Promise<FeedbackObject> {
  const feedbackData = {
    org_id: input.orgId,
    venue_id: input.venueId,
    business_date: input.businessDate,
    domain: input.domain,
    title: input.title,
    message: input.message,
    required_action: input.requiredAction || 'acknowledge',
    severity: input.severity || 'warning',
    confidence: input.confidence || null,
    owner_role: input.ownerRole || 'venue_manager',
    assigned_to: input.assignedTo || null,
    due_at: input.dueAt || null,
    verification_spec: input.verificationSpec || null,
    source_run_id: input.sourceRunId || null,
    status: 'open',
  };

  // Insert feedback object
  const { data: feedback, error: feedbackError } = await supabase
    .from('feedback_objects')
    .insert([feedbackData])
    .select()
    .single();

  if (feedbackError) {
    throw new Error(`Failed to create feedback object: ${feedbackError.message}`);
  }

  // Link to signals if provided
  if (input.signalIds && input.signalIds.length > 0) {
    const links = input.signalIds.map(signalId => ({
      feedback_object_id: feedback.id,
      signal_id: signalId,
      signal_role: 'primary',
    }));

    const { error: linkError } = await supabase
      .from('feedback_object_signals')
      .insert(links);

    if (linkError) {
      console.error(`Failed to link signals to feedback: ${linkError.message}`);
    }
  }

  return {
    id: feedback.id,
    orgId: feedback.org_id,
    venueId: feedback.venue_id,
    businessDate: feedback.business_date,
    domain: feedback.domain,
    title: feedback.title,
    message: feedback.message,
    requiredAction: feedback.required_action,
    severity: feedback.severity,
    confidence: feedback.confidence,
    ownerRole: feedback.owner_role,
    assignedTo: feedback.assigned_to,
    dueAt: feedback.due_at,
    verificationSpec: feedback.verification_spec,
    sourceRunId: feedback.source_run_id,
    status: feedback.status,
    createdAt: feedback.created_at,
    updatedAt: feedback.updated_at,
  };
}

/**
 * Generate feedback objects from comp signals
 *
 * Groups comp exception signals and creates appropriate feedback objects:
 * - Critical: Unapproved reasons, high-value comps
 * - Warning: High comp % of check
 * - Info: Daily comp budget exceeded
 */
export async function generateCompFeedback(params: {
  orgId: string;
  venueId: string;
  businessDate: string;
  signalIds?: string[];
}): Promise<FeedbackObject[]> {
  // Fetch comp signals for this date
  let query = supabase
    .from('signals')
    .select('*')
    .eq('org_id', params.orgId)
    .eq('venue_id', params.venueId)
    .eq('business_date', params.businessDate)
    .eq('domain', 'revenue')
    .like('signal_type', 'comp_%')
    .order('severity', { ascending: false });

  // Filter to specific signals if provided
  if (params.signalIds && params.signalIds.length > 0) {
    query = query.in('id', params.signalIds);
  }

  const { data: signals, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch comp signals: ${error.message}`);
  }

  if (!signals || signals.length === 0) {
    return [];
  }

  // Group signals by type
  const unapprovedReasons = signals.filter(s => s.signal_type === 'comp_unapproved_reason');
  const highValueComps = signals.filter(s => s.signal_type === 'comp_high_value');
  const highCompPct = signals.filter(s => s.signal_type === 'comp_high_pct_of_check');
  const dailyBudgetExceeded = signals.filter(s => s.signal_type === 'comp_daily_budget_exceeded');

  const feedbackObjects: FeedbackObject[] = [];

  // Critical: Unapproved reasons
  if (unapprovedReasons.length > 0) {
    const totalValue = unapprovedReasons.reduce((sum, s) => sum + (s.impact_value || 0), 0);
    const reasons = [...new Set(unapprovedReasons.map(s => s.payload?.reason || 'Unknown'))];

    feedbackObjects.push(await createFeedbackObject({
      orgId: params.orgId,
      venueId: params.venueId,
      businessDate: params.businessDate,
      domain: 'revenue',
      title: `${unapprovedReasons.length} Unapproved Comp Reasons`,
      message: `Found ${unapprovedReasons.length} comps with unapproved reasons (total: $${totalValue.toFixed(2)}). Reasons used: ${reasons.join(', ')}. Please review and provide explanation or update comp policy.`,
      severity: 'critical',
      requiredAction: 'explain',
      ownerRole: 'venue_manager',
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      signalIds: unapprovedReasons.map(s => s.id),
      verificationSpec: {
        type: 'comp_policy_compliance',
        metric: 'unapproved_comp_count',
        operator: '<=',
        target: 0,
        window_days: 7,
      },
    }));
  }

  // Critical: High-value comps
  if (highValueComps.length > 0) {
    const totalValue = highValueComps.reduce((sum, s) => sum + (s.impact_value || 0), 0);
    const threshold = highValueComps[0]?.payload?.threshold || 200;

    feedbackObjects.push(await createFeedbackObject({
      orgId: params.orgId,
      venueId: params.venueId,
      businessDate: params.businessDate,
      domain: 'revenue',
      title: `${highValueComps.length} High-Value Comps`,
      message: `Found ${highValueComps.length} comps exceeding $${threshold} threshold (total: $${totalValue.toFixed(2)}). These require manager approval and documentation.`,
      severity: 'critical',
      requiredAction: 'explain',
      ownerRole: 'gm',
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      signalIds: highValueComps.map(s => s.id),
    }));
  }

  // Warning: High comp % of check
  if (highCompPct.length > 0) {
    const totalValue = highCompPct.reduce((sum, s) => sum + (s.impact_value || 0), 0);

    feedbackObjects.push(await createFeedbackObject({
      orgId: params.orgId,
      venueId: params.venueId,
      businessDate: params.businessDate,
      domain: 'revenue',
      title: `${highCompPct.length} Checks with High Comp %`,
      message: `Found ${highCompPct.length} checks where comps exceeded 50% of check total (total: $${totalValue.toFixed(2)}). Review for potential errors or policy violations.`,
      severity: 'warning',
      requiredAction: 'acknowledge',
      ownerRole: 'venue_manager',
      signalIds: highCompPct.map(s => s.id),
    }));
  }

  // Warning: Daily budget exceeded
  if (dailyBudgetExceeded.length > 0) {
    const budgetData = dailyBudgetExceeded[0]?.payload;
    const pct = budgetData?.comp_pct || 0;
    const threshold = budgetData?.threshold || 2;

    feedbackObjects.push(await createFeedbackObject({
      orgId: params.orgId,
      venueId: params.venueId,
      businessDate: params.businessDate,
      domain: 'revenue',
      title: `Daily Comp Budget Exceeded`,
      message: `Comps reached ${pct.toFixed(1)}% of net sales, exceeding the ${threshold}% threshold. Monitor comp activity to stay within budget.`,
      severity: pct >= 3 ? 'critical' : 'warning',
      requiredAction: 'acknowledge',
      ownerRole: 'venue_manager',
      signalIds: dailyBudgetExceeded.map(s => s.id),
      verificationSpec: {
        type: 'comp_budget',
        metric: 'daily_comp_pct',
        operator: '<=',
        target: threshold,
        window_days: 7,
      },
    }));
  }

  return feedbackObjects;
}

/**
 * Update feedback object status
 */
export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
  userId?: string,
  resolutionSummary?: string
): Promise<void> {
  const updates: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'resolved') {
    updates.resolved_at = new Date().toISOString();
    updates.resolved_by = userId;
    updates.resolution_summary = resolutionSummary;
  }

  const { error } = await supabase
    .from('feedback_objects')
    .update(updates)
    .eq('id', feedbackId);

  if (error) {
    throw new Error(`Failed to update feedback status: ${error.message}`);
  }
}
