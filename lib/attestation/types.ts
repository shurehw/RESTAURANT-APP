// ============================================================================
// Operator Attestation Types & Zod Schemas
// ============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enum values & constant arrays
// ---------------------------------------------------------------------------

export const REVENUE_VARIANCE_REASONS = [
  'weather', 'private_event', 'local_event', 'holiday',
  'competition', 'staffing_shortage', 'marketing_promo',
  'construction_nearby', 'pos_error', 'early_close',
] as const;

export const LABOR_VARIANCE_REASONS = [
  'call_out', 'event_staffing', 'training_shift', 'early_cut',
  'overtime_approved', 'new_hire_overlap', 'weather_slow',
  'scheduling_error', 'pos_error',
] as const;

export const COMP_RESOLUTION_CODES = [
  'legitimate_guest_recovery', 'manager_approved_promo',
  'employee_meal', 'vip_courtesy', 'kitchen_error',
  'service_failure', 'policy_violation', 'needs_investigation',
  'training_required',
] as const;

export const INCIDENT_TYPES = [
  'guest_complaint', 'equipment_failure', 'staff_issue',
  'safety', 'inventory_shortage', 'walkout',
  'theft_fraud', 'health_code',
] as const;

export const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

export const COACHING_TYPES = [
  'recognition', 'correction', 'training', 'follow_up',
] as const;

export const ATTESTATION_STATUSES = ['draft', 'submitted', 'amended'] as const;

// ---------------------------------------------------------------------------
// Revenue Tags (multi-select driver tags — always shown, not gated by trigger)
// ---------------------------------------------------------------------------

export const REVENUE_TAGS = [
  'private_event', 'holiday_special', 'celebrity_vip', 'promoter_event',
  'live_entertainment', 'sports_event', 'walkins_strong', 'reservations_heavy',
  'slow_night', 'no_shows', 'weather_impact', 'seasonal', 'competitor_event',
  'short_staffed', 'kitchen_issue', '86d_items', 'early_close_late_open',
  'new_menu_launch', 'pos_issue',
  'high_comp_night', 'large_discount', 'prix_fixe',
] as const;
export type RevenueTag = typeof REVENUE_TAGS[number];

export const REVENUE_TAG_LABELS: Record<RevenueTag, string> = {
  private_event: 'Private Event / Buyout',
  holiday_special: 'Holiday / Special Occasion',
  celebrity_vip: 'Celebrity / VIP Traffic',
  promoter_event: 'Promoter / Influencer Event',
  live_entertainment: 'Live Entertainment / DJ',
  sports_event: 'Sports Event',
  walkins_strong: 'Walk-ins Strong',
  reservations_heavy: 'Reservations Heavy',
  slow_night: 'Slow Night / Low Demand',
  no_shows: 'No-Shows / Cancellations',
  weather_impact: 'Weather Impact',
  seasonal: 'Seasonal Slowdown',
  competitor_event: 'Competitor Event Nearby',
  short_staffed: 'Short Staffed',
  kitchen_issue: 'Kitchen / Equipment Issue',
  '86d_items': "86'd Menu Items",
  early_close_late_open: 'Early Close / Late Open',
  new_menu_launch: 'New Menu / Special Launch',
  pos_issue: 'POS / System Issue',
  high_comp_night: 'High Comp Night',
  large_discount: 'Large Discount / Promo',
  prix_fixe: 'Prix Fixe / Set Menu',
};

export const REVENUE_TAG_CATEGORIES = ['demand_drivers', 'demand_drags', 'operational', 'financial'] as const;
export type RevenueTagCategory = typeof REVENUE_TAG_CATEGORIES[number];

export const REVENUE_TAG_CATEGORY_LABELS: Record<RevenueTagCategory, string> = {
  demand_drivers: 'Demand Drivers',
  demand_drags: 'Demand Drags',
  operational: 'Operational',
  financial: 'Financial',
};

export const REVENUE_TAG_BY_CATEGORY: Record<RevenueTagCategory, RevenueTag[]> = {
  demand_drivers: ['private_event', 'holiday_special', 'celebrity_vip', 'promoter_event', 'live_entertainment', 'sports_event', 'walkins_strong', 'reservations_heavy'],
  demand_drags: ['slow_night', 'no_shows', 'weather_impact', 'seasonal', 'competitor_event'],
  operational: ['short_staffed', 'kitchen_issue', '86d_items', 'early_close_late_open', 'new_menu_launch', 'pos_issue'],
  financial: ['high_comp_night', 'large_discount', 'prix_fixe'],
};

// ---------------------------------------------------------------------------
// Labor Tags (multi-select driver tags)
// ---------------------------------------------------------------------------

export const LABOR_TAGS = [
  'call_out', 'no_show', 'event_staffing', 'training_night', 'cut_early',
  'held_over', 'double_shift', 'new_hire', 'scheduling_error', 'weather_slow',
] as const;
export type LaborTag = typeof LABOR_TAGS[number];

export const LABOR_TAG_LABELS: Record<LaborTag, string> = {
  call_out: 'Call-out(s)',
  no_show: 'No-show(s)',
  event_staffing: 'Event Staffing',
  training_night: 'Training Night',
  cut_early: 'Cut Early',
  held_over: 'Held Over',
  double_shift: 'Double Shift(s)',
  new_hire: 'New Hire(s) on Floor',
  scheduling_error: 'Scheduling Error',
  weather_slow: 'Weather — Slow Shift',
};

// Human-readable labels for UI
export const REVENUE_VARIANCE_LABELS: Record<RevenueVarianceReason, string> = {
  weather: 'Weather impact',
  private_event: 'Private event / buyout',
  local_event: 'Local event (sports, concert, etc.)',
  holiday: 'Holiday effect',
  competition: 'New / increased competition',
  staffing_shortage: 'Staffing shortage',
  marketing_promo: 'Marketing / promotion',
  construction_nearby: 'Nearby construction',
  pos_error: 'POS / system error',
  early_close: 'Early close',
};

export const LABOR_VARIANCE_LABELS: Record<LaborVarianceReason, string> = {
  call_out: 'Call-out(s)',
  event_staffing: 'Event staffing',
  training_shift: 'Training shift',
  early_cut: 'Early cut',
  overtime_approved: 'Overtime approved',
  new_hire_overlap: 'New hire overlap',
  weather_slow: 'Weather — slow night',
  scheduling_error: 'Scheduling error',
  pos_error: 'POS / system error',
};

export const COMP_RESOLUTION_LABELS: Record<CompResolutionCode, string> = {
  legitimate_guest_recovery: 'Legitimate guest recovery',
  manager_approved_promo: 'Manager-approved promo',
  employee_meal: 'Employee meal',
  vip_courtesy: 'VIP courtesy',
  kitchen_error: 'Kitchen error',
  service_failure: 'Service failure',
  policy_violation: 'Policy violation',
  needs_investigation: 'Needs investigation',
  training_required: 'Training required',
};

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  guest_complaint: 'Guest complaint',
  equipment_failure: 'Equipment failure',
  staff_issue: 'Staff issue',
  safety: 'Safety concern',
  inventory_shortage: 'Inventory shortage',
  walkout: 'Walkout',
  theft_fraud: 'Theft / fraud',
  health_code: 'Health code issue',
};

export const COACHING_TYPE_LABELS: Record<CoachingType, string> = {
  recognition: 'Recognition',
  correction: 'Correction',
  training: 'Training needed',
  follow_up: 'Follow-up required',
};

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------

export type RevenueVarianceReason = typeof REVENUE_VARIANCE_REASONS[number];
export type LaborVarianceReason = typeof LABOR_VARIANCE_REASONS[number];
export type CompResolutionCode = typeof COMP_RESOLUTION_CODES[number];
export type IncidentType = typeof INCIDENT_TYPES[number];
export type Severity = typeof SEVERITY_LEVELS[number];
export type CoachingType = typeof COACHING_TYPES[number];
export type AttestationStatus = typeof ATTESTATION_STATUSES[number];

export interface AttestationThresholds {
  id?: string;
  venue_id: string;
  revenue_variance_pct: number;
  high_comp_amount: number;
  comp_pct_threshold: number;
  labor_variance_pct: number;
  overtime_hours_threshold: number;
  walkout_count_threshold: number;
}

export interface NightlyAttestation {
  id?: string;
  venue_id: string;
  business_date: string;
  submitted_by?: string;
  submitted_at?: string;
  status: AttestationStatus;

  // Revenue
  revenue_confirmed?: boolean;
  revenue_variance_reason?: RevenueVarianceReason;
  revenue_notes?: string;
  revenue_tags?: RevenueTag[];

  // Labor
  labor_confirmed?: boolean;
  labor_variance_reason?: LaborVarianceReason;
  labor_notes?: string;
  labor_tags?: LaborTag[];

  // Lock
  locked_at?: string;
  locked_by?: string;
  amendment_reason?: string;
  amended_at?: string;
  amended_by?: string;

  triggers_snapshot?: TriggerResult;
  created_at?: string;
  updated_at?: string;
}

export interface CompResolution {
  id?: string;
  attestation_id: string;
  venue_id: string;
  business_date: string;
  check_id?: string;
  check_amount?: number;
  comp_amount?: number;
  comp_reason_pos?: string;
  employee_name?: string;
  resolution_code: CompResolutionCode;
  resolution_notes?: string;
  approved_by?: string;
  requires_follow_up: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface NightlyIncident {
  id?: string;
  attestation_id: string;
  venue_id: string;
  business_date: string;
  incident_type: IncidentType;
  severity: Severity;
  description: string;
  resolution?: string;
  resolved: boolean;
  staff_involved: string[];
  follow_up_required: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CoachingAction {
  id?: string;
  attestation_id: string;
  venue_id: string;
  business_date: string;
  employee_name: string;
  coaching_type: CoachingType;
  reason: string;
  action_taken?: string;
  follow_up_date?: string;
  status: 'pending' | 'completed' | 'escalated';
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Trigger engine types
// ---------------------------------------------------------------------------

export interface NightlyReportPayload {
  venue_id: string;
  business_date: string;

  // Revenue
  net_sales: number;
  forecasted_sales: number;
  total_comp_amount: number;
  comp_count: number;
  comps: Array<{
    check_id: string;
    check_amount: number;
    comp_amount: number;
    comp_reason: string;
    employee_name: string;
  }>;

  // Labor
  actual_labor_cost: number;
  scheduled_labor_cost: number;
  overtime_hours: number;

  // Incidents from POS / external
  walkout_count: number;
}

export interface TriggerResult {
  revenue_attestation_required: boolean;
  revenue_triggers: string[];
  comp_resolution_required: boolean;
  flagged_comps: Array<{
    check_id: string;
    check_amount: number;
    comp_amount: number;
    comp_reason: string;
    employee_name: string;
    trigger_reasons: string[];
  }>;
  labor_attestation_required: boolean;
  labor_triggers: string[];
  incident_log_required: boolean;
  incident_triggers: string[];
}

// ---------------------------------------------------------------------------
// Zod schemas (request validation)
// ---------------------------------------------------------------------------

export const attestationThresholdsSchema = z.object({
  revenue_variance_pct: z.number().min(0).max(100).optional(),
  high_comp_amount: z.number().min(0).optional(),
  comp_pct_threshold: z.number().min(0).max(100).optional(),
  labor_variance_pct: z.number().min(0).max(100).optional(),
  overtime_hours_threshold: z.number().min(0).optional(),
  walkout_count_threshold: z.number().int().min(0).optional(),
});

export const updateAttestationSchema = z.object({
  revenue_confirmed: z.boolean().optional(),
  revenue_variance_reason: z.enum(REVENUE_VARIANCE_REASONS).optional().nullable(),
  revenue_notes: z.string().max(500).optional().nullable(),
  revenue_tags: z.array(z.enum(REVENUE_TAGS)).optional().nullable(),
  labor_confirmed: z.boolean().optional(),
  labor_variance_reason: z.enum(LABOR_VARIANCE_REASONS).optional().nullable(),
  labor_notes: z.string().max(500).optional().nullable(),
  labor_tags: z.array(z.enum(LABOR_TAGS)).optional().nullable(),
});

export const submitAttestationSchema = z.object({
  amendment_reason: z.string().max(500).optional(),
});

export const compResolutionSchema = z.object({
  check_id: z.string().optional(),
  check_amount: z.number().optional(),
  comp_amount: z.number().optional(),
  comp_reason_pos: z.string().optional(),
  employee_name: z.string().optional(),
  resolution_code: z.enum(COMP_RESOLUTION_CODES),
  resolution_notes: z.string().max(500).optional().nullable(),
  approved_by: z.string().optional(),
  requires_follow_up: z.boolean().default(false),
});

export const incidentSchema = z.object({
  incident_type: z.enum(INCIDENT_TYPES),
  severity: z.enum(SEVERITY_LEVELS).default('medium'),
  description: z.string().min(10).max(1000),
  resolution: z.string().max(1000).optional().nullable(),
  resolved: z.boolean().default(false),
  staff_involved: z.array(z.string()).default([]),
  follow_up_required: z.boolean().default(false),
});

export const coachingSchema = z.object({
  employee_name: z.string().min(1),
  coaching_type: z.enum(COACHING_TYPES),
  reason: z.string().min(5).max(500),
  action_taken: z.string().max(500).optional().nullable(),
  follow_up_date: z.string().optional().nullable(),
  status: z.enum(['pending', 'completed', 'escalated']).default('pending'),
});
