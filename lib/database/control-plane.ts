/**
 * Control Plane - Manager Action Tracking
 * Enforces accountability for AI-generated recommendations
 */

import { getServiceClient } from '@/lib/supabase/service';
import type { CompReviewRecommendation } from '@/lib/ai/comp-reviewer';

export interface ManagerAction {
  id?: string;
  venue_id: string;
  business_date: string;
  source_report: string;
  source_type: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  category: 'violation' | 'training' | 'process' | 'policy' | 'positive';
  title: string;
  description: string;
  action: string;
  assigned_to?: string;
  assigned_role?: string;
  related_checks?: string[];
  related_employees?: string[];
  metadata?: Record<string, any>;
  status?: string;
  expires_at?: string;
}

/**
 * Save AI comp review recommendations as manager actions
 */
export async function saveCompReviewActions(
  venueId: string,
  businessDate: string,
  venueName: string,
  recommendations: CompReviewRecommendation[]
): Promise<{ success: boolean; actionsCreated: number; errors?: string[] }> {
  const supabase = getServiceClient();
  const errors: string[] = [];
  let actionsCreated = 0;

  for (const rec of recommendations) {
    try {
      // Extract assigned_to from action text if possible
      const assignedTo = extractAssignedTo(rec.action);

      // Determine expiry (low priority items expire after 30 days)
      const expiresAt = rec.priority === 'low'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const action: ManagerAction = {
        venue_id: venueId,
        business_date: businessDate,
        source_report: `nightly_${businessDate}`,
        source_type: 'ai_comp_review',
        priority: rec.priority,
        category: rec.category,
        title: rec.title,
        description: rec.description,
        action: rec.action,
        assigned_to: assignedTo,
        related_checks: rec.relatedComps || [],
        related_employees: extractEmployeeNames(rec.description),
        metadata: {
          venue_name: venueName,
          ai_generated: true,
        },
        status: 'pending',
        expires_at: expiresAt || undefined,
      };

      const { error } = await (supabase as any)
        .from('manager_actions')
        .insert(action);

      if (error) {
        errors.push(`Failed to save action "${rec.title}": ${error.message}`);
      } else {
        actionsCreated++;
      }
    } catch (err: any) {
      errors.push(`Error processing recommendation "${rec.title}": ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    actionsCreated,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Extract manager/employee name from action text
 * Examples:
 * - "Manager John should review..." → "John"
 * - "Schedule training for Server Sarah..." → "Sarah"
 * - "GM approval required..." → null
 */
function extractAssignedTo(actionText: string): string | undefined {
  // Match "Manager [Name]" or "Server [Name]"
  const managerMatch = actionText.match(/Manager\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (managerMatch) {
    return managerMatch[1];
  }

  const serverMatch = actionText.match(/Server\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (serverMatch) {
    return serverMatch[1];
  }

  return undefined;
}

/**
 * Extract all employee names mentioned in description
 */
function extractEmployeeNames(description: string): string[] {
  const names: string[] = [];

  // Match "Server [Name]" or "Manager [Name]"
  const matches = description.matchAll(/(Server|Manager)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g);

  for (const match of matches) {
    names.push(match[2]);
  }

  return [...new Set(names)]; // Remove duplicates
}

/**
 * Get active actions for a venue
 */
export async function getActiveActions(
  venueId: string,
  assignedTo?: string
): Promise<ManagerAction[]> {
  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('active_manager_actions')
    .select('*')
    .eq('venue_id', venueId);

  if (assignedTo) {
    query = query.eq('assigned_to', assignedTo);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch active actions:', error);
    return [];
  }

  return data || [];
}

/**
 * Mark an action as completed
 */
export async function completeAction(
  actionId: string,
  completedBy: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('manager_actions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: completedBy,
      completion_notes: notes,
    })
    .eq('id', actionId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Dismiss an action (mark as not needed)
 */
export async function dismissAction(
  actionId: string,
  dismissedBy: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('manager_actions')
    .update({
      status: 'dismissed',
      completed_at: new Date().toISOString(),
      completed_by: dismissedBy,
      completion_notes: reason,
    })
    .eq('id', actionId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Escalate an action to higher management
 */
export async function escalateAction(
  actionId: string,
  escalatedTo: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('manager_actions')
    .update({
      status: 'escalated',
      escalated_at: new Date().toISOString(),
      escalated_to: escalatedTo,
      escalation_reason: reason,
    })
    .eq('id', actionId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
