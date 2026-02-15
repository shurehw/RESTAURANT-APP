/**
 * Integration helpers for existing enforcement sources
 * Shows how to migrate comp exceptions, sales pace, etc. to unified control plane
 */

import { createViolation, createActionsFromTemplates } from '@/lib/database/enforcement';

// ============================================================================
// Comp Exception Integration
// ============================================================================

export interface CompException {
  id: string;
  venue_id: string;
  business_date: string;
  comp_amount: number;
  server_name: string;
  comp_reason: string;
  approved: boolean;
  manager_name?: string;
}

/**
 * Convert comp exception to unified violation
 */
export async function reportCompViolation(
  orgId: string,
  exception: CompException
): Promise<void> {
  const severity = exception.comp_amount > 200 ? 'critical' : 'warning';

  const violation = await createViolation({
    org_id: orgId,
    venue_id: exception.venue_id,
    violation_type: 'comp_exception',
    severity,
    title: `Unauthorized comp: $${exception.comp_amount.toFixed(2)}`,
    description: `${exception.server_name} comped $${exception.comp_amount.toFixed(2)} (${exception.comp_reason})${!exception.approved ? ' without approval' : ''}`,
    metadata: {
      comp_id: exception.id,
      server_name: exception.server_name,
      comp_amount: exception.comp_amount,
      comp_reason: exception.comp_reason,
      approved: exception.approved,
      manager_name: exception.manager_name,
    },
    source_table: 'comp_exceptions',
    source_id: exception.id,
    business_date: exception.business_date,
    shift_period: 'dinner', // Could be derived from time
  });

  // Auto-create actions from templates (e.g., alert GM, block server)
  await createActionsFromTemplates(violation);
}

// ============================================================================
// Sales Pace Integration
// ============================================================================

export interface SalesPaceStatus {
  venue_id: string;
  business_date: string;
  current_revenue: number;
  projected_revenue: number;
  forecast_revenue: number;
  variance_percent: number;
  pace_status: 'on_pace' | 'warning' | 'critical';
}

/**
 * Report sales pace violation
 */
export async function reportSalesPaceViolation(
  orgId: string,
  status: SalesPaceStatus
): Promise<void> {
  if (status.pace_status === 'on_pace') {
    return; // No violation
  }

  const severity = status.pace_status === 'critical' ? 'critical' : 'warning';

  const violation = await createViolation({
    org_id: orgId,
    venue_id: status.venue_id,
    violation_type: 'sales_pace',
    severity,
    title: `Sales ${status.variance_percent.toFixed(0)}% ${status.variance_percent < 0 ? 'below' : 'above'} forecast`,
    description: `Projected EOD: $${status.projected_revenue.toFixed(0)} vs forecast $${status.forecast_revenue.toFixed(0)} (${Math.abs(status.variance_percent).toFixed(1)}% variance)`,
    metadata: {
      current_revenue: status.current_revenue,
      projected_revenue: status.projected_revenue,
      forecast_revenue: status.forecast_revenue,
      variance_percent: status.variance_percent,
      pace_status: status.pace_status,
    },
    source_table: 'sales_snapshots',
    source_id: `${status.venue_id}_${status.business_date}`,
    business_date: status.business_date,
    shift_period: 'dinner',
  });

  await createActionsFromTemplates(violation);
}

// ============================================================================
// Greeting Delay Integration
// ============================================================================

export interface GreetingDelay {
  id: string;
  venue_id: string;
  business_date: string;
  table_number: string;
  seated_at: string;
  greeted_at?: string;
  delay_seconds: number;
  threshold_seconds: number;
}

/**
 * Report greeting delay violation
 */
export async function reportGreetingViolation(
  orgId: string,
  delay: GreetingDelay
): Promise<void> {
  const severity = delay.delay_seconds > delay.threshold_seconds * 1.5 ? 'critical' : 'warning';

  const violation = await createViolation({
    org_id: orgId,
    venue_id: delay.venue_id,
    violation_type: 'greeting_delay',
    severity,
    title: `Table ${delay.table_number} greeting delayed`,
    description: `${Math.floor(delay.delay_seconds / 60)}min ${delay.delay_seconds % 60}sec delay (threshold: ${Math.floor(delay.threshold_seconds / 60)}min)`,
    metadata: {
      table_number: delay.table_number,
      seated_at: delay.seated_at,
      greeted_at: delay.greeted_at,
      delay_seconds: delay.delay_seconds,
      threshold_seconds: delay.threshold_seconds,
    },
    source_table: 'greeting_metrics',
    source_id: delay.id,
    business_date: delay.business_date,
  });

  await createActionsFromTemplates(violation);
}

// ============================================================================
// Staffing Gap Integration (Future)
// ============================================================================

export interface StaffingGap {
  venue_id: string;
  position: string;
  current_fte: number;
  required_fte: number;
  gap_fte: number;
  projected_fte_2week: number;
}

/**
 * Report staffing gap violation
 */
export async function reportStaffingViolation(
  orgId: string,
  gap: StaffingGap,
  businessDate: string
): Promise<void> {
  const severity = gap.gap_fte >= 1.0 ? 'critical' : 'warning';

  const violation = await createViolation({
    org_id: orgId,
    venue_id: gap.venue_id,
    violation_type: 'staffing_gap',
    severity,
    title: `${gap.position} position ${gap.gap_fte.toFixed(1)} FTE below minimum`,
    description: `Current: ${gap.current_fte.toFixed(1)} FTE, Required: ${gap.required_fte.toFixed(1)} FTE, Projected (2wk): ${gap.projected_fte_2week.toFixed(1)} FTE`,
    metadata: {
      position: gap.position,
      current_fte: gap.current_fte,
      required_fte: gap.required_fte,
      gap_fte: gap.gap_fte,
      projected_fte_2week: gap.projected_fte_2week,
    },
    source_table: 'staffing_metrics',
    source_id: `${gap.venue_id}_${gap.position}`,
    business_date: businessDate,
    shift_period: 'week',
  });

  await createActionsFromTemplates(violation);
}
