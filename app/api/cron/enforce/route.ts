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
 * 3. COGS variance detection → violations
 * 4. Inventory exception detection → violations
 * 5. Sales pace detection → violations
 * 6. Escalation ladder (time, recurrence, cross-venue)
 * 7. Composite scoring (manager + venue)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { fetchCompExceptions } from '@/lib/database/tipsee';
import { detectLaborExceptions, type LaborMetrics } from '@/lib/database/labor-exceptions';
import { getActiveOperationalStandards } from '@/lib/database/operational-standards';
import { getLaborBounds } from '@/lib/database/system-bounds';
import { getActiveCompSettings } from '@/lib/database/comp-settings';
import { getActiveProcurementSettings, type ProcurementSettings } from '@/lib/database/procurement-settings';
import { detectAllInventoryExceptions } from '@/lib/database/inventory-exceptions';
import { getSalesPaceSettings, computePaceStatus } from '@/lib/database/sales-pace';
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

  let procurementSettings: ProcurementSettings | undefined;
  try {
    procurementSettings = await getActiveProcurementSettings(orgId);
  } catch {
    // Will use defaults for COGS detection
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

    // ── 3. COGS Variance Detection ──
    if (procurementSettings) {
      try {
        const cogsCount = await detectCogsVariance(
          supabase, orgId, venue.id, venue.name,
          businessDate, procurementSettings, errors,
        );
        violationsCreated += cogsCount;
      } catch (err: any) {
        errors.push(`COGS detection failed (${venue.name}): ${err.message}`);
      }
    }

    // ── 4. Inventory Exception Detection ──
    if (procurementSettings?.inventory_exception_enforcement) {
      try {
        const invCount = await detectAndCreateInventoryViolations(
          supabase, orgId, venue.id, venue.name,
          businessDate, procurementSettings, errors,
        );
        violationsCreated += invCount;
      } catch (err: any) {
        errors.push(`Inventory detection failed (${venue.name}): ${err.message}`);
      }
    }

    // ── 5. Sales Pace Detection ──
    try {
      const paceCount = await detectSalesPaceViolation(
        supabase, orgId, venue.id, venue.name,
        businessDate, errors,
      );
      violationsCreated += paceCount;
    } catch (err: any) {
      errors.push(`Sales pace detection failed (${venue.name}): ${err.message}`);
    }
  }

  // ── 6. Run Escalation Ladder ──
  let escalation = { time_escalated: 0, recurrence_flagged: 0, systemic_flagged: 0, silence_penalized: 0, stall_penalized: 0 };
  try {
    escalation = await runEscalationLadder(orgId);
  } catch (err: any) {
    errors.push(`Escalation failed: ${err.message}`);
  }

  // ── 7. Compute Scores ──
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

// ============================================================================
// COGS Variance Detection
// ============================================================================

async function detectCogsVariance(
  supabase: any,
  orgId: string,
  venueId: string,
  venueName: string,
  businessDate: string,
  settings: ProcurementSettings,
  errors: string[],
): Promise<number> {
  let created = 0;

  // Gate: check mapping coverage — skip if too low to trust
  const { data: coverage } = await supabase
    .from('v_menu_item_mapping_coverage')
    .select('sales_coverage_pct')
    .eq('venue_id', venueId)
    .maybeSingle();

  const salesCoveragePct = parseFloat(coverage?.sales_coverage_pct) || 0;
  if (salesCoveragePct < settings.cogs_min_mapping_coverage_pct) {
    return 0;
  }

  // Query daily_variance for this venue + date
  const { data: variance } = await supabase
    .from('daily_variance')
    .select('actual_cogs_pct, budget_cogs_pct, cogs_variance_pct, cogs_status, actual_sales')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .maybeSingle();

  if (!variance || variance.cogs_status === 'no_budget' || !variance.cogs_variance_pct) {
    return 0;
  }

  // Evaluate against org-level thresholds (override SQL view defaults)
  const variancePct = parseFloat(variance.cogs_variance_pct);
  if (variancePct <= 0) return 0; // Under budget = no violation

  let severity: ViolationSeverity | null = null;
  if (variancePct >= settings.cogs_variance_critical_pct) {
    severity = 'critical';
  } else if (variancePct >= settings.cogs_variance_warning_pct) {
    severity = 'warning';
  }

  if (!severity) return 0;

  // Dedup
  const sourceId = `cogs_variance_${venueId}_${businessDate}`;
  const exists = await checkViolationExists(supabase, orgId, sourceId);
  if (exists) return 0;

  // Dollar impact: excess COGS % × actual sales
  const actualSales = parseFloat(variance.actual_sales) || 0;
  const estimatedImpactUsd = actualSales > 0
    ? Math.round((variancePct / 100) * actualSales * 100) / 100
    : undefined;

  try {
    await createViolationService(supabase, {
      org_id: orgId,
      venue_id: venueId,
      violation_type: 'cogs_variance',
      severity,
      title: `COGS ${variancePct.toFixed(1)}pp over budget`,
      description: `Actual COGS: ${parseFloat(variance.actual_cogs_pct).toFixed(1)}% | Budget: ${parseFloat(variance.budget_cogs_pct).toFixed(1)}% | Variance: +${variancePct.toFixed(1)}pp`,
      metadata: {
        actual_cogs_pct: parseFloat(variance.actual_cogs_pct),
        budget_cogs_pct: parseFloat(variance.budget_cogs_pct),
        cogs_variance_pct: variancePct,
        mapping_coverage_pct: salesCoveragePct,
      },
      source_table: 'daily_variance',
      source_id: sourceId,
      business_date: businessDate,
      policy_snapshot: {
        type: 'cogs_thresholds',
        cogs_variance_warning_pct: settings.cogs_variance_warning_pct,
        cogs_variance_critical_pct: settings.cogs_variance_critical_pct,
        cogs_min_mapping_coverage_pct: settings.cogs_min_mapping_coverage_pct,
        actual_coverage_pct: salesCoveragePct,
        captured_at: new Date().toISOString(),
      },
      evidence: {
        actual_cogs_pct: parseFloat(variance.actual_cogs_pct),
        budget_cogs_pct: parseFloat(variance.budget_cogs_pct),
        cogs_variance_pct: variancePct,
        actual_sales: actualSales,
      },
      derived_metrics: {
        cogs_variance_pp: variancePct,
        sales_coverage_pct: salesCoveragePct,
      },
      estimated_impact_usd: estimatedImpactUsd,
      impact_confidence: salesCoveragePct >= 90 ? 'high' : 'medium',
      impact_inputs: estimatedImpactUsd ? {
        method: 'excess_cogs_pct_x_actual_sales',
        variance_pct: variancePct,
        actual_sales: actualSales,
        mapping_coverage: salesCoveragePct,
      } : undefined,
    });
    created++;
  } catch (err: any) {
    errors.push(`COGS violation failed (${venueName}): ${err.message}`);
  }

  return created;
}

// ============================================================================
// Inventory Exception Detection
// ============================================================================

async function detectAndCreateInventoryViolations(
  supabase: any,
  orgId: string,
  venueId: string,
  venueName: string,
  businessDate: string,
  settings: ProcurementSettings,
  errors: string[],
): Promise<number> {
  let created = 0;

  const results = await detectAllInventoryExceptions(venueId, businessDate, settings);

  // ── Cost Spikes ──
  for (const spike of results.cost_spikes) {
    const sourceId = `inv_cost_spike_${spike.item_id}_${spike.effective_date}`;
    const exists = await checkViolationExists(supabase, orgId, sourceId);
    if (exists) continue;

    const severity: ViolationSeverity = spike.z_score >= 3.0 ? 'critical' : 'warning';

    try {
      await createViolationService(supabase, {
        org_id: orgId,
        venue_id: venueId,
        violation_type: 'inventory_exception',
        severity,
        title: `Cost spike: ${spike.item_name} +${spike.variance_pct.toFixed(0)}%`,
        description: `${spike.item_name} cost jumped from $${spike.avg_cost.toFixed(2)} to $${spike.new_cost.toFixed(2)} (z-score: ${spike.z_score.toFixed(1)})`,
        metadata: {
          exception_type: 'cost_spike',
          item_id: spike.item_id,
          item_name: spike.item_name,
          vendor_id: spike.vendor_id,
          vendor_name: spike.vendor_name,
          z_score: spike.z_score,
          variance_pct: spike.variance_pct,
        },
        source_table: 'item_cost_history',
        source_id: sourceId,
        business_date: businessDate,
        evidence: {
          new_cost: spike.new_cost,
          avg_cost: spike.avg_cost,
          std_dev: spike.std_dev,
          z_score: spike.z_score,
        },
        estimated_impact_usd: Math.abs(spike.new_cost - spike.avg_cost),
        impact_confidence: 'medium',
        impact_inputs: {
          method: 'cost_delta_per_unit',
          new_cost: spike.new_cost,
          avg_cost: spike.avg_cost,
        },
      });
      created++;
    } catch (err: any) {
      errors.push(`Cost spike violation failed (${venueName}, ${spike.item_name}): ${err.message}`);
    }
  }

  // ── Inventory Shrink ──
  for (const shrink of results.shrink_exceptions) {
    const sourceId = `inv_shrink_${shrink.count_id}_${shrink.count_date}`;
    const exists = await checkViolationExists(supabase, orgId, sourceId);
    if (exists) continue;

    const severity: ViolationSeverity =
      shrink.total_shrink_cost >= (settings.shrink_cost_critical || 2000) ? 'critical' : 'warning';

    try {
      await createViolationService(supabase, {
        org_id: orgId,
        venue_id: venueId,
        violation_type: 'inventory_exception',
        severity,
        title: `Inventory shrink: $${shrink.total_shrink_cost.toFixed(0)} (${shrink.shrink_pct.toFixed(1)}%)`,
        description: `Shrink detected on count ${shrink.count_date}: $${shrink.total_shrink_cost.toFixed(2)} / $${shrink.total_counted_value.toFixed(2)} total`,
        metadata: {
          exception_type: 'shrink',
          count_id: shrink.count_id,
          count_date: shrink.count_date,
          top_items: shrink.high_shrink_items.slice(0, 5).map((i) => ({
            name: i.item_name,
            cost: i.shrink_cost,
          })),
        },
        source_table: 'inventory_counts',
        source_id: sourceId,
        business_date: businessDate,
        evidence: {
          total_shrink_cost: shrink.total_shrink_cost,
          total_counted_value: shrink.total_counted_value,
          shrink_pct: shrink.shrink_pct,
          item_count: shrink.high_shrink_items.length,
        },
        estimated_impact_usd: shrink.total_shrink_cost,
        impact_confidence: 'high',
        impact_inputs: {
          method: 'direct_shrink_cost',
          total_shrink_cost: shrink.total_shrink_cost,
        },
      });
      created++;
    } catch (err: any) {
      errors.push(`Shrink violation failed (${venueName}): ${err.message}`);
    }
  }

  // ── Recipe Cost Drift ──
  for (const drift of results.recipe_drift) {
    const sourceId = `inv_recipe_drift_${drift.recipe_id}_${businessDate}`;
    const exists = await checkViolationExists(supabase, orgId, sourceId);
    if (exists) continue;

    const severity: ViolationSeverity =
      Math.abs(drift.drift_pct) >= (settings.recipe_drift_critical_pct || 20) ? 'critical' : 'warning';

    try {
      await createViolationService(supabase, {
        org_id: orgId,
        venue_id: venueId,
        violation_type: 'inventory_exception',
        severity,
        title: `Recipe drift: ${drift.recipe_name} ${drift.drift_pct > 0 ? '+' : ''}${drift.drift_pct.toFixed(0)}%`,
        description: `${drift.recipe_name} cost moved from $${drift.previous_cost.toFixed(2)} to $${drift.current_cost.toFixed(2)} (${drift.drift_pct.toFixed(1)}% drift)`,
        metadata: {
          exception_type: 'recipe_drift',
          recipe_id: drift.recipe_id,
          recipe_name: drift.recipe_name,
          drift_pct: drift.drift_pct,
        },
        source_table: 'recipe_costs',
        source_id: sourceId,
        business_date: businessDate,
        evidence: {
          current_cost: drift.current_cost,
          previous_cost: drift.previous_cost,
          drift_pct: drift.drift_pct,
        },
        estimated_impact_usd: Math.abs(drift.current_cost - drift.previous_cost),
        impact_confidence: 'low',
        impact_inputs: {
          method: 'recipe_cost_delta_per_unit',
          current_cost: drift.current_cost,
          previous_cost: drift.previous_cost,
        },
      });
      created++;
    } catch (err: any) {
      errors.push(`Recipe drift violation failed (${venueName}, ${drift.recipe_name}): ${err.message}`);
    }
  }

  // ── Par Level Violations ──
  for (const par of results.par_violations) {
    const sourceId = `inv_par_${par.item_id}_${businessDate}`;
    const exists = await checkViolationExists(supabase, orgId, sourceId);
    if (exists) continue;

    try {
      await createViolationService(supabase, {
        org_id: orgId,
        venue_id: venueId,
        violation_type: 'inventory_exception',
        severity: 'warning',
        title: `Below par: ${par.item_name} (${par.quantity_on_hand}/${par.par_level})`,
        description: `${par.item_name} on-hand: ${par.quantity_on_hand}, reorder point: ${par.reorder_point}, par: ${par.par_level}. Deficit: ${par.deficit}`,
        metadata: {
          exception_type: 'par_violation',
          item_id: par.item_id,
          item_name: par.item_name,
          sku: par.sku,
        },
        source_table: 'inventory_balances',
        source_id: sourceId,
        business_date: businessDate,
        evidence: {
          quantity_on_hand: par.quantity_on_hand,
          reorder_point: par.reorder_point,
          par_level: par.par_level,
          deficit: par.deficit,
        },
        estimated_impact_usd: par.estimated_order_cost,
        impact_confidence: 'low',
        impact_inputs: {
          method: 'estimated_order_cost',
          estimated_order_cost: par.estimated_order_cost,
        },
      });
      created++;
    } catch (err: any) {
      errors.push(`Par violation failed (${venueName}, ${par.item_name}): ${err.message}`);
    }
  }

  return created;
}

// ============================================================================
// Sales Pace Detection
// ============================================================================

async function detectSalesPaceViolation(
  supabase: any,
  orgId: string,
  venueId: string,
  venueName: string,
  businessDate: string,
  errors: string[],
): Promise<number> {
  // Get venue's sales pace settings — skip if not configured
  const paceSettings = await getSalesPaceSettings(venueId);
  if (!paceSettings || !paceSettings.is_active) return 0;

  // Get the latest snapshot for the business date (end-of-day state)
  const { data: latestSnapshot } = await supabase
    .from('sales_snapshots')
    .select('gross_sales, net_sales, covers_count, checks_count')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestSnapshot) return 0;

  const actualSales = parseFloat(latestSnapshot.gross_sales) || 0;
  if (actualSales <= 0) return 0;

  // Get target: forecast revenue or SDLW gross sales
  let targetSales = 0;

  if (paceSettings.use_forecast) {
    const { data: forecast } = await supabase
      .from('forecasts_with_bias')
      .select('revenue_predicted')
      .eq('venue_id', venueId)
      .eq('business_date', businessDate)
      .order('revenue_predicted', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (forecast) {
      targetSales = parseFloat(forecast.revenue_predicted) || 0;
    }
  }

  // Fallback to SDLW if no forecast or forecast disabled
  if (targetSales <= 0 && paceSettings.use_sdlw) {
    const sdlwDate = subtractDays(businessDate, 7);
    const { data: sdlwFact } = await supabase
      .from('venue_day_facts')
      .select('gross_sales')
      .eq('venue_id', venueId)
      .eq('business_date', sdlwDate)
      .maybeSingle();

    if (sdlwFact) {
      targetSales = parseFloat(sdlwFact.gross_sales) || 0;
    }
  }

  if (targetSales <= 0) return 0; // No target = no enforcement

  // Compute pace status using venue-configured thresholds
  const status = computePaceStatus(actualSales, targetSales, paceSettings);
  if (status === 'on_pace' || status === 'no_target') return 0;

  // Dedup
  const sourceId = `sales_pace_${venueId}_${businessDate}`;
  const exists = await checkViolationExists(supabase, orgId, sourceId);
  if (exists) return 0;

  const variancePct = ((actualSales - targetSales) / targetSales) * 100;
  const severity: ViolationSeverity = status === 'critical' ? 'critical' : 'warning';
  const shortfallUsd = Math.max(0, targetSales - actualSales);

  try {
    await createViolationService(supabase, {
      org_id: orgId,
      venue_id: venueId,
      violation_type: 'sales_pace',
      severity,
      title: `Sales ${Math.abs(variancePct).toFixed(0)}% below target`,
      description: `Actual: $${actualSales.toFixed(0)} | Target: $${targetSales.toFixed(0)} | Shortfall: $${shortfallUsd.toFixed(0)} (${Math.abs(variancePct).toFixed(1)}%)`,
      metadata: {
        actual_sales: actualSales,
        target_sales: targetSales,
        variance_pct: variancePct,
        pace_status: status,
        target_source: paceSettings.use_forecast && targetSales > 0 ? 'forecast' : 'sdlw',
        covers_count: parseInt(latestSnapshot.covers_count) || 0,
        checks_count: parseInt(latestSnapshot.checks_count) || 0,
      },
      source_table: 'sales_snapshots',
      source_id: sourceId,
      business_date: businessDate,
      shift_period: 'dinner',
      policy_snapshot: {
        type: 'sales_pace_settings',
        pace_warning_pct: paceSettings.pace_warning_pct,
        pace_critical_pct: paceSettings.pace_critical_pct,
        use_forecast: paceSettings.use_forecast,
        use_sdlw: paceSettings.use_sdlw,
        captured_at: new Date().toISOString(),
      },
      evidence: {
        actual_sales: actualSales,
        target_sales: targetSales,
        variance_pct: variancePct,
        covers_count: parseInt(latestSnapshot.covers_count) || 0,
      },
      derived_metrics: {
        shortfall_usd: shortfallUsd,
        variance_pct: variancePct,
        target_source: paceSettings.use_forecast && targetSales > 0 ? 'forecast' : 'sdlw',
      },
      estimated_impact_usd: shortfallUsd,
      impact_confidence: 'high',
      impact_inputs: {
        method: 'sales_shortfall',
        actual_sales: actualSales,
        target_sales: targetSales,
      },
    });
    return 1;
  } catch (err: any) {
    errors.push(`Sales pace violation failed (${venueName}): ${err.message}`);
    return 0;
  }
}
