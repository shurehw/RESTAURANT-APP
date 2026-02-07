// ============================================================================
// Control Plane Integration for Attestations
// Generates manager_actions from attestation submission data.
// ============================================================================

import { getServiceClient } from '@/lib/supabase/service';
import type {
  NightlyAttestation,
  CompResolution,
  NightlyIncident,
  CoachingAction,
  TriggerResult,
} from './types';

interface AttestationSubmissionData {
  attestation: NightlyAttestation;
  compResolutions: CompResolution[];
  incidents: NightlyIncident[];
  coachingActions: CoachingAction[];
  triggers: TriggerResult;
  venueName: string;
}

interface ActionInsert {
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
  related_employees?: string[];
  metadata?: Record<string, unknown>;
  attestation_id?: string;
  source_data?: Record<string, unknown>;
  status: string;
  expires_at?: string;
}

export async function generateAttestationActions(
  data: AttestationSubmissionData,
): Promise<{ success: boolean; actionsCreated: number; errors?: string[] }> {
  const supabase = getServiceClient();
  const errors: string[] = [];
  const actions: ActionInsert[] = [];

  const { attestation, compResolutions, incidents, coachingActions, venueName } = data;
  const sourceReport = `nightly_${attestation.business_date}`;

  // -----------------------------------------------------------------------
  // Comp resolutions → actions for policy violations & investigations
  // -----------------------------------------------------------------------
  for (const cr of compResolutions) {
    if (cr.resolution_code === 'policy_violation') {
      actions.push({
        venue_id: attestation.venue_id,
        business_date: attestation.business_date,
        source_report: sourceReport,
        source_type: 'attestation_comp',
        priority: 'urgent',
        category: 'violation',
        title: `Comp policy violation — Check #${cr.check_id || 'unknown'}`,
        description: `$${cr.comp_amount?.toFixed(2) || '?'} comp on check #${cr.check_id || '?'} flagged as policy violation by ${cr.approved_by || 'manager'}. Employee: ${cr.employee_name || 'unknown'}.`,
        action: `Review comp policy with ${cr.employee_name || 'employee'}. Determine disciplinary action if warranted.`,
        assigned_to: cr.approved_by,
        assigned_role: 'Manager',
        related_employees: cr.employee_name ? [cr.employee_name] : [],
        attestation_id: attestation.id,
        source_data: { comp_resolution_id: cr.id, check_id: cr.check_id, comp_amount: cr.comp_amount },
        status: 'pending',
      });
    }

    if (cr.resolution_code === 'needs_investigation') {
      actions.push({
        venue_id: attestation.venue_id,
        business_date: attestation.business_date,
        source_report: sourceReport,
        source_type: 'attestation_comp',
        priority: 'high',
        category: 'process',
        title: `Investigate comp — Check #${cr.check_id || 'unknown'}`,
        description: `$${cr.comp_amount?.toFixed(2) || '?'} comp requires investigation. POS reason: "${cr.comp_reason_pos || 'none'}". Employee: ${cr.employee_name || 'unknown'}.`,
        action: `Investigate comp circumstances with ${cr.employee_name || 'employee'}. Report findings by next shift.`,
        assigned_to: cr.approved_by,
        assigned_role: 'Manager',
        related_employees: cr.employee_name ? [cr.employee_name] : [],
        attestation_id: attestation.id,
        source_data: { comp_resolution_id: cr.id, check_id: cr.check_id },
        status: 'pending',
      });
    }

    if (cr.resolution_code === 'training_required') {
      actions.push({
        venue_id: attestation.venue_id,
        business_date: attestation.business_date,
        source_report: sourceReport,
        source_type: 'attestation_comp',
        priority: 'medium',
        category: 'training',
        title: `Comp training needed — ${cr.employee_name || 'employee'}`,
        description: `${cr.employee_name || 'Employee'} needs training on comp procedures. Check #${cr.check_id || '?'}, $${cr.comp_amount?.toFixed(2) || '?'}.`,
        action: `Schedule comp policy training for ${cr.employee_name || 'employee'} within 7 days.`,
        assigned_to: cr.approved_by,
        assigned_role: 'Manager',
        related_employees: cr.employee_name ? [cr.employee_name] : [],
        attestation_id: attestation.id,
        source_data: { comp_resolution_id: cr.id },
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  // -----------------------------------------------------------------------
  // Incidents → actions for high/critical severity or unresolved
  // -----------------------------------------------------------------------
  for (const inc of incidents) {
    if (inc.severity === 'critical') {
      actions.push({
        venue_id: attestation.venue_id,
        business_date: attestation.business_date,
        source_report: sourceReport,
        source_type: 'attestation_incident',
        priority: 'urgent',
        category: inc.incident_type === 'theft_fraud' ? 'violation' : 'process',
        title: `Critical incident: ${inc.incident_type.replace(/_/g, ' ')}`,
        description: inc.description,
        action: inc.resolved
          ? `Verify incident resolution is complete. Document for records.`
          : `Immediate attention required. Incident unresolved from last night.`,
        assigned_role: 'GM',
        related_employees: inc.staff_involved,
        attestation_id: attestation.id,
        source_data: { incident_id: inc.id, incident_type: inc.incident_type, severity: inc.severity },
        status: 'pending',
      });
    } else if (inc.severity === 'high' && !inc.resolved) {
      actions.push({
        venue_id: attestation.venue_id,
        business_date: attestation.business_date,
        source_report: sourceReport,
        source_type: 'attestation_incident',
        priority: 'high',
        category: 'process',
        title: `Unresolved incident: ${inc.incident_type.replace(/_/g, ' ')}`,
        description: inc.description,
        action: `Follow up on unresolved ${inc.incident_type.replace(/_/g, ' ')} from ${attestation.business_date}.`,
        assigned_role: 'Manager',
        related_employees: inc.staff_involved,
        attestation_id: attestation.id,
        source_data: { incident_id: inc.id },
        status: 'pending',
      });
    }

    if (inc.follow_up_required && !inc.resolved) {
      // Only add a separate follow-up action if we didn't already create one above
      const alreadyHasAction = actions.some(
        a => a.source_data && (a.source_data as any).incident_id === inc.id,
      );
      if (!alreadyHasAction) {
        actions.push({
          venue_id: attestation.venue_id,
          business_date: attestation.business_date,
          source_report: sourceReport,
          source_type: 'attestation_incident',
          priority: 'medium',
          category: 'process',
          title: `Follow-up: ${inc.incident_type.replace(/_/g, ' ')}`,
          description: inc.description,
          action: `Complete follow-up on ${inc.incident_type.replace(/_/g, ' ')} incident.`,
          assigned_role: 'Manager',
          related_employees: inc.staff_involved,
          attestation_id: attestation.id,
          source_data: { incident_id: inc.id },
          status: 'pending',
          expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Coaching → escalated items become actions
  // -----------------------------------------------------------------------
  for (const ca of coachingActions) {
    if (ca.status === 'escalated') {
      actions.push({
        venue_id: attestation.venue_id,
        business_date: attestation.business_date,
        source_report: sourceReport,
        source_type: 'attestation_coaching',
        priority: 'high',
        category: ca.coaching_type === 'correction' ? 'violation' : 'training',
        title: `Escalated coaching: ${ca.employee_name}`,
        description: `${ca.coaching_type} for ${ca.employee_name}: ${ca.reason}`,
        action: ca.action_taken || `Review escalated coaching item for ${ca.employee_name}.`,
        assigned_role: 'GM',
        related_employees: [ca.employee_name],
        attestation_id: attestation.id,
        source_data: { coaching_action_id: ca.id, coaching_type: ca.coaching_type },
        status: 'pending',
      });
    }

    // Pending follow-ups with dates → create time-bound actions
    if (ca.follow_up_date && ca.status === 'pending') {
      actions.push({
        venue_id: attestation.venue_id,
        business_date: attestation.business_date,
        source_report: sourceReport,
        source_type: 'attestation_coaching',
        priority: 'medium',
        category: ca.coaching_type === 'recognition' ? 'positive' : 'training',
        title: `Coaching follow-up: ${ca.employee_name}`,
        description: `${ca.coaching_type} follow-up for ${ca.employee_name}: ${ca.reason}`,
        action: ca.action_taken || `Complete coaching follow-up with ${ca.employee_name} by ${ca.follow_up_date}.`,
        assigned_role: 'Manager',
        related_employees: [ca.employee_name],
        attestation_id: attestation.id,
        source_data: { coaching_action_id: ca.id },
        status: 'pending',
        expires_at: new Date(ca.follow_up_date + 'T23:59:59Z').toISOString(),
      });
    }
  }

  // -----------------------------------------------------------------------
  // Bulk insert
  // -----------------------------------------------------------------------
  if (actions.length === 0) {
    return { success: true, actionsCreated: 0 };
  }

  const { error } = await (supabase as any)
    .from('manager_actions')
    .insert(actions);

  if (error) {
    errors.push(`Failed to insert ${actions.length} actions: ${error.message}`);
    return { success: false, actionsCreated: 0, errors };
  }

  return { success: true, actionsCreated: actions.length };
}
