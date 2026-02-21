/**
 * Nightly Enforcement Cron — Detection → Violations → Escalation → Scoring
 *
 * Runs after ETL completes (~5:30 AM). Authenticated via CRON_SECRET.
 *
 * POST /api/cron/enforce?date=YYYY-MM-DD (optional override)
 *
 * Per-org processing:
 * 1. Comp exception detection → violations
 * 2. Labor exception detection → violations
 * 3. Escalation ladder (time, recurrence, cross-venue)
 * 4. Composite scoring (manager + venue)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { fetchCompExceptions } from '@/lib/database/tipsee';
import { detectLaborExceptions, type LaborMetrics } from '@/lib/database/labor-exceptions';
import { getActiveOperationalStandards } from '@/lib/database/operational-standards';
import { getLaborBounds } from '@/lib/database/system-bounds';
import { getActiveCompSettings } from '@/lib/database/comp-settings';
import { runEscalationLadder } from '@/lib/enforcement/escalation';
import { computeEnforcementScores } from '@/lib/enforcement/scoring';
import type { ViolationType, ViolationSeverity } from '@/lib/database/enforcement';

// ============================================================================
// Auth
// ============================================================================

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Determine business date (default: yesterday)
  const searchParams = request.nextUrl?.searchParams;
  const dateParam = searchParams?.get('date');
  let businessDate: string;

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    businessDate = dateParam;
  } else {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    businessDate = d.toISOString().split('T')[0];
  }

  console.log(`[enforce] Starting enforcement for ${businessDate}`);

  const supabase = getServiceClient() as any;

  // Get all active organizations
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('is_active', true);

  if (orgsError || !orgs || orgs.length === 0) {
    console.error('[enforce] No active organizations:', orgsError?.message);
    return NextResponse.json({
      success: false,
      error: 'No active organizations found',
    }, { status: 500 });
  }

  const results: Array<{
    org: string;
    violations_created: number;
    escalation: { time_escalated: number; recurrence_flagged: number; systemic_flagged: number; silence_penalized: number; stall_penalized: number };
    scores: { managers: number; venues: number };
    errors: string[];
  }> = [];

  // Process each org with error isolation
  const orgResults = await Promise.allSettled(
    orgs.map((org: any) => processOrg(supabase, org.id, org.name, businessDate))
  );

  for (let i = 0; i < orgs.length; i++) {
    const orgResult = orgResults[i];
    if (orgResult.status === 'fulfilled') {
      results.push(orgResult.value);
    } else {
      results.push({
        org: orgs[i].name,
        violations_created: 0,
        escalation: { time_escalated: 0, recurrence_flagged: 0, systemic_flagged: 0, silence_penalized: 0, stall_penalized: 0 },
        scores: { managers: 0, venues: 0 },
        errors: [orgResult.reason?.message || 'Unknown error'],
      });
    }
  }

  const totalViolations = results.reduce((s, r) => s + r.violations_created, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
  const elapsed = Date.now() - t0;

  console.log(`[enforce] Done in ${elapsed}ms: ${totalViolations} violations, ${totalErrors} errors`);

  return NextResponse.json({
    success: totalErrors === 0,
    business_date: businessDate,
    elapsed_ms: elapsed,
    orgs_processed: results.length,
    total_violations: totalViolations,
    total_errors: totalErrors,
    results,
  });
}

// ============================================================================
// Per-Org Processing
// ============================================================================

async function processOrg(
  supabase: any,
  orgId: string,
  orgName: string,
  businessDate: string,
) {
  const errors: string[] = [];
  let violationsCreated = 0;

  // Get venues for this org
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  if (!venues || venues.length === 0) {
    return {
      org: orgName,
      violations_created: 0,
      escalation: { time_escalated: 0, recurrence_flagged: 0, systemic_flagged: 0, silence_penalized: 0, stall_penalized: 0 },
      scores: { managers: 0, venues: 0 },
      errors: [],
    };
  }

  // Get org settings for comp + labor detection
  let compSettings;
  try {
    compSettings = await getActiveCompSettings(orgId);
  } catch {
    // Will use defaults
  }

  let operationalStandards;
  try {
    operationalStandards = await getActiveOperationalStandards(orgId);
  } catch {
    // Will use defaults
  }

  let laborBounds;
  try {
    laborBounds = await getLaborBounds();
  } catch {
    // Will skip labor detection
  }

  // Get TipSee location mappings for comp detection
  const { data: tipseeMapping } = await supabase
    .from('venue_tipsee_mapping')
    .select('venue_id, tipsee_location_uuid')
    .eq('is_active', true)
    .in('venue_id', venues.map((v: any) => v.id));

  const locationMap = new Map<string, string>();
  if (tipseeMapping) {
    for (const m of tipseeMapping) {
      locationMap.set(m.venue_id, m.tipsee_location_uuid);
    }
  }

  // Process each venue
  for (const venue of venues) {
    // ── 1. Comp Exception Detection ──
    const locationUuid = locationMap.get(venue.id);
    if (locationUuid) {
      try {
        const result = await fetchCompExceptions(businessDate, locationUuid, compSettings ? {
          approved_reasons: compSettings.approved_reasons,
          high_value_comp_threshold: compSettings.high_value_comp_threshold,
          high_comp_pct_threshold: compSettings.high_comp_pct_threshold,
          daily_comp_pct_warning: compSettings.daily_comp_pct_warning,
          daily_comp_pct_critical: compSettings.daily_comp_pct_critical,
        } : undefined);

        for (const exception of result.exceptions) {
          // Dedup: check if violation already exists for this check + date
          const sourceId = `comp_${exception.check_id}_${businessDate}`;
          const exists = await checkViolationExists(supabase, orgId, sourceId);
          if (exists) continue;

          const severity: ViolationSeverity = exception.severity === 'critical' ? 'critical' : 'warning';

          try {
            const compPctOfCheck = exception.check_total > 0
              ? (exception.comp_total / exception.check_total) * 100
              : 0;

            await createViolationService(supabase, {
              org_id: orgId,
              venue_id: venue.id,
              violation_type: 'comp_exception',
              severity,
              title: exception.message,
              description: exception.details,
              metadata: {
                check_id: exception.check_id,
                server_name: exception.server,
                comp_amount: exception.comp_total,
                comp_reason: exception.reason,
                exception_type: exception.type,
                table_name: exception.table_name,
              },
              source_table: 'tipsee_checks',
              source_id: sourceId,
              business_date: businessDate,
              policy_snapshot: compSettings ? {
                type: 'comp_settings',
                approved_reasons: compSettings.approved_reasons,
                high_value_comp_threshold: compSettings.high_value_comp_threshold,
                high_comp_pct_threshold: compSettings.high_comp_pct_threshold,
                daily_comp_pct_warning: compSettings.daily_comp_pct_warning,
                daily_comp_pct_critical: compSettings.daily_comp_pct_critical,
                captured_at: new Date().toISOString(),
              } : undefined,
              evidence: {
                check_id: exception.check_id,
                comp_total: exception.comp_total,
                comp_reason: exception.reason,
                server: exception.server,
                check_total: exception.check_total,
                table_name: exception.table_name,
              },
              derived_metrics: {
                comp_pct_of_check: Math.round(compPctOfCheck * 100) / 100,
                exception_type: exception.type,
              },
              estimated_impact_usd: exception.comp_total,
              impact_confidence: 'high',
              impact_inputs: {
                method: 'direct_comp_amount',
                comp_total: exception.comp_total,
              },
            });
            violationsCreated++;
          } catch (err: any) {
            errors.push(`Comp violation failed (${venue.name}): ${err.message}`);
          }
        }
      } catch (err: any) {
        errors.push(`Comp detection failed (${venue.name}): ${err.message}`);
      }
    }

    // ── 2. Labor Exception Detection ──
    if (laborBounds && operationalStandards?.labor) {
      try {
        // Fetch labor_day_facts for this venue + date
        const { data: laborFact } = await supabase
          .from('labor_day_facts')
          .select('*')
          .eq('venue_id', venue.id)
          .eq('business_date', businessDate)
          .maybeSingle();

        if (laborFact) {
          const metrics: LaborMetrics = {
            net_sales: parseFloat(laborFact.net_sales) || 0,
            labor_cost: parseFloat(laborFact.labor_cost) || 0,
            labor_hours: parseFloat(laborFact.labor_hours) || 0,
            covers: parseInt(laborFact.covers) || 0,
            ot_hours: parseFloat(laborFact.ot_hours) || 0,
          };

          // Fetch recent exceptions for structural triggers
          const windowStart = subtractDays(businessDate, 14);
          const { data: recentExceptions } = await supabase
            .from('control_plane_violations')
            .select('business_date, severity')
            .eq('org_id', orgId)
            .eq('venue_id', venue.id)
            .eq('violation_type', 'staffing_gap')
            .gte('business_date', windowStart);

          const result = detectLaborExceptions(
            metrics,
            operationalStandards.labor,
            businessDate,
            laborBounds,
            recentExceptions?.map((e: any) => ({
              date: e.business_date,
              severity: e.severity as 'warning' | 'critical',
            })),
          );

          for (const exception of result.exceptions) {
            const sourceId = `labor_${venue.id}_${exception.type}_${businessDate}`;
            const exists = await checkViolationExists(supabase, orgId, sourceId);
            if (exists) continue;

            try {
              // Estimate dollar impact: excess labor % × net sales
              const targetLaborPct = operationalStandards.labor?.target_labor_pct || 30;
              const excessPct = Math.max(0, (result.labor_pct || 0) - targetLaborPct);
              const laborImpactUsd = excessPct > 0
                ? Math.round((excessPct / 100) * metrics.net_sales * 100) / 100
                : undefined;

              await createViolationService(supabase, {
                org_id: orgId,
                venue_id: venue.id,
                violation_type: 'staffing_gap',
                severity: exception.severity as ViolationSeverity,
                title: exception.message,
                description: `${exception.type}: ${exception.message}`,
                metadata: {
                  exception_type: exception.type,
                  labor_pct: result.labor_pct,
                  splh: result.splh,
                  cplh: result.cplh,
                  ot_pct: result.ot_pct,
                  diagnostic: result.diagnostic,
                  structural_review: result.requires_structural_review,
                },
                source_table: 'labor_day_facts',
                source_id: sourceId,
                business_date: businessDate,
                policy_snapshot: {
                  type: 'labor_standards',
                  standards: operationalStandards.labor,
                  bounds: laborBounds,
                  captured_at: new Date().toISOString(),
                },
                evidence: {
                  net_sales: metrics.net_sales,
                  labor_cost: metrics.labor_cost,
                  labor_hours: metrics.labor_hours,
                  covers: metrics.covers,
                  ot_hours: metrics.ot_hours,
                },
                derived_metrics: {
                  labor_pct: result.labor_pct,
                  splh: result.splh,
                  cplh: result.cplh,
                  ot_pct: result.ot_pct,
                  diagnostic: result.diagnostic,
                },
                estimated_impact_usd: laborImpactUsd,
                impact_confidence: laborImpactUsd ? 'medium' : undefined,
                impact_inputs: laborImpactUsd ? {
                  method: 'excess_labor_pct_x_net_sales',
                  actual_labor_pct: result.labor_pct,
                  target_labor_pct: targetLaborPct,
                  excess_pct: excessPct,
                  net_sales: metrics.net_sales,
                } : undefined,
              });
              violationsCreated++;
            } catch (err: any) {
              errors.push(`Labor violation failed (${venue.name}): ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        errors.push(`Labor detection failed (${venue.name}): ${err.message}`);
      }
    }
  }

  // ── 3. Run Escalation Ladder ──
  let escalation = { time_escalated: 0, recurrence_flagged: 0, systemic_flagged: 0, silence_penalized: 0, stall_penalized: 0 };
  try {
    escalation = await runEscalationLadder(orgId);
  } catch (err: any) {
    errors.push(`Escalation failed: ${err.message}`);
  }

  // ── 4. Compute Scores ──
  let scores = { managers: 0, venues: 0 };
  try {
    const scoreResult = await computeEnforcementScores(orgId, businessDate);
    scores = { managers: scoreResult.managers, venues: scoreResult.venues };
    errors.push(...scoreResult.errors);
  } catch (err: any) {
    errors.push(`Scoring failed: ${err.message}`);
  }

  return {
    org: orgName,
    violations_created: violationsCreated,
    escalation,
    scores,
    errors,
  };
}

// ============================================================================
// Service-Role Helpers (bypass session auth)
// ============================================================================

interface CreateViolationServiceInput {
  org_id: string;
  venue_id?: string;
  violation_type: ViolationType | string;
  severity: ViolationSeverity;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  source_table?: string;
  source_id?: string;
  business_date: string;
  shift_period?: string;
  // Evidence + impact fields
  policy_snapshot?: Record<string, any>;
  evidence?: Record<string, any>;
  derived_metrics?: Record<string, any>;
  estimated_impact_usd?: number;
  impact_confidence?: 'high' | 'medium' | 'low';
  impact_inputs?: Record<string, any>;
}

async function createViolationService(
  supabase: any,
  input: CreateViolationServiceInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('control_plane_violations')
    .insert({
      org_id: input.org_id,
      venue_id: input.venue_id || null,
      violation_type: input.violation_type,
      severity: input.severity,
      title: input.title,
      description: input.description || null,
      metadata: input.metadata || {},
      source_table: input.source_table || null,
      source_id: input.source_id || null,
      business_date: input.business_date,
      shift_period: input.shift_period || null,
      status: 'open',
      verification_required: input.severity === 'critical',
      escalation_level: 0,
      recurrence_count: 0,
      policy_snapshot: input.policy_snapshot || null,
      evidence: input.evidence || null,
      derived_metrics: input.derived_metrics || null,
      estimated_impact_usd: input.estimated_impact_usd || null,
      impact_confidence: input.impact_confidence || null,
      impact_inputs: input.impact_inputs || null,
    })
    .select('id')
    .single();

  if (error) throw error;

  // Insert created event
  await supabase.from('violation_events').insert({
    violation_id: data.id,
    event_type: 'created',
    to_status: 'open',
    occurred_at: new Date().toISOString(),
    metadata: {
      violation_type: input.violation_type,
      severity: input.severity,
      has_evidence: !!input.evidence,
      has_impact: !!input.estimated_impact_usd,
    },
  });

  // Auto-create actions from templates
  try {
    await createActionsFromTemplatesService(supabase, {
      id: data.id,
      org_id: input.org_id,
      violation_type: input.violation_type,
      severity: input.severity,
      title: input.title,
      metadata: input.metadata || {},
    });
  } catch (err: any) {
    // Non-fatal: violation created even if template matching fails
    console.warn(`[enforce] Template actions failed for ${data.id}:`, err.message);
  }

  return data;
}

async function createActionsFromTemplatesService(
  supabase: any,
  violation: {
    id: string;
    org_id: string;
    violation_type: string;
    severity: string;
    title: string;
    metadata: Record<string, any>;
  },
): Promise<void> {
  const { data: templates } = await supabase
    .from('control_plane_action_templates')
    .select('*')
    .eq('org_id', violation.org_id)
    .eq('violation_type', violation.violation_type)
    .eq('severity', violation.severity)
    .eq('enabled', true);

  if (!templates || templates.length === 0) return;

  for (const template of templates) {
    // Simple template interpolation
    let message = template.message_template || '';
    message = message.replace(/\{title\}/g, violation.title);
    message = message.replace(/\{severity\}/g, violation.severity);
    message = message.replace(/\{type\}/g, violation.violation_type);

    let target = template.action_target || '';
    target = target.replace(/\{title\}/g, violation.title);

    await supabase
      .from('control_plane_actions')
      .insert({
        violation_id: violation.id,
        action_type: template.action_type,
        action_target: target,
        message,
        action_data: { template_id: template.id },
        scheduled_for: new Date().toISOString(),
        execution_status: 'pending',
      });
  }
}

async function checkViolationExists(
  supabase: any,
  orgId: string,
  sourceId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('control_plane_violations')
    .select('id')
    .eq('org_id', orgId)
    .eq('source_id', sourceId)
    .limit(1);

  return data && data.length > 0;
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
