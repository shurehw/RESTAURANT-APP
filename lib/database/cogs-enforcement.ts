/**
 * COGS Enforcement — Action Center integration for all COGS alerts.
 * Routes waste, COGS variance, menu price, and supplier violations
 * through the unified control_plane_violations system.
 */

import { getServiceClient } from '@/lib/supabase/service';
import { getDailyWasteTotal } from './waste-tracking';

// ── Violation Types ────────────────────────────────────────────────────

type COGSViolationType =
  | 'waste_threshold'
  | 'waste_theft'
  | 'cogs_variance'
  | 'menu_price_breach'
  | 'supplier_accuracy'
  | 'supplier_late'
  | 'recipe_cost_spike'
  | 'ingredient_stockout';

// ── Core: Create Violation → Action Center ─────────────────────────────

async function createCOGSViolation(params: {
  orgId: string;
  venueId: string;
  violationType: COGSViolationType;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metadata: Record<string, any>;
  sourceTable: string;
  sourceId?: string;
  businessDate: string;
}): Promise<string> {
  const supabase = getServiceClient();
  const dedupeKey = buildViolationDedupeKey(params);
  const metadata = { ...params.metadata, dedupe_key: dedupeKey };

  // Idempotency: avoid creating duplicate open/acknowledged violations for the same signal.
  const { data: existing } = await (supabase as any)
    .from('control_plane_violations')
    .select('id, metadata')
    .eq('org_id', params.orgId)
    .eq('venue_id', params.venueId)
    .eq('violation_type', params.violationType)
    .eq('business_date', params.businessDate)
    .in('status', ['open', 'acknowledged'])
    .order('created_at', { ascending: false })
    .limit(200);

  const match = (existing || []).find((v: any) => v?.metadata?.dedupe_key === dedupeKey);
  if (match?.id) return match.id;

  const { data, error } = await (supabase as any)
    .from('control_plane_violations')
    .insert({
      org_id: params.orgId,
      venue_id: params.venueId,
      violation_type: params.violationType,
      severity: params.severity,
      title: params.title,
      description: params.description,
      metadata,
      source_table: params.sourceTable,
      source_id: params.sourceId,
      business_date: params.businessDate,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create COGS violation: ${error.message}`);

  // Auto-create actions from templates
  const { data: templates } = await (supabase as any)
    .from('control_plane_action_templates')
    .select('*')
    .eq('org_id', params.orgId)
    .eq('violation_type', params.violationType)
    .eq('severity', params.severity)
    .eq('enabled', true);

  for (const template of templates || []) {
    await (supabase as any)
      .from('control_plane_actions')
      .insert({
        violation_id: data.id,
        action_type: template.action_type,
        action_target: template.action_target,
        message: interpolateTemplate(template.message_template, {
          ...metadata,
          title: params.title,
        }),
      });
  }

  return data.id;
}

function interpolateTemplate(template: string, vars: Record<string, any>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
    const parts = key.split('.');
    let val: any = vars;
    for (const p of parts) {
      val = val?.[p];
    }
    return val?.toString() ?? '';
  });
}

function buildViolationDedupeKey(params: {
  violationType: COGSViolationType;
  severity: 'info' | 'warning' | 'critical';
  businessDate: string;
  sourceTable: string;
  sourceId?: string;
  metadata: Record<string, any>;
}): string {
  const m = params.metadata || {};
  const identity = [
    m.vendor_id,
    m.recipe_id,
    m.item_id,
    m.cogs_category,
    m.reason_code,
    m.sale_date,
    m.first_need_date,
  ]
    .filter((x) => x !== undefined && x !== null && String(x).length > 0)
    .map(String)
    .join(':');

  return [
    params.violationType,
    params.severity,
    params.businessDate,
    params.sourceTable,
    params.sourceId || '',
    identity,
  ].join('|');
}

// ── Waste Enforcement ──────────────────────────────────────────────────

export async function enforceWasteThresholds(
  venueId: string,
  orgId: string,
  businessDate: string,
  settings: {
    waste_daily_warning_dollars: number;
    waste_daily_critical_dollars: number;
    waste_theft_auto_escalate: boolean;
  }
): Promise<string[]> {
  const violations: string[] = [];
  const waste = await getDailyWasteTotal(venueId, businessDate);

  // Daily dollar threshold
  if (waste.total_cost >= settings.waste_daily_critical_dollars) {
    const id = await createCOGSViolation({
      orgId,
      venueId,
      violationType: 'waste_threshold',
      severity: 'critical',
      title: `Daily waste $${waste.total_cost.toFixed(0)} exceeds critical threshold`,
      description: `${waste.log_count} waste events totaling $${waste.total_cost.toFixed(2)} on ${businessDate}. Critical threshold: $${settings.waste_daily_critical_dollars}.`,
      metadata: { total_cost: waste.total_cost, log_count: waste.log_count, threshold: settings.waste_daily_critical_dollars },
      sourceTable: 'waste_logs',
      businessDate,
    });
    violations.push(id);
  } else if (waste.total_cost >= settings.waste_daily_warning_dollars) {
    const id = await createCOGSViolation({
      orgId,
      venueId,
      violationType: 'waste_threshold',
      severity: 'warning',
      title: `Daily waste $${waste.total_cost.toFixed(0)} above warning level`,
      description: `${waste.log_count} waste events totaling $${waste.total_cost.toFixed(2)} on ${businessDate}. Warning threshold: $${settings.waste_daily_warning_dollars}.`,
      metadata: { total_cost: waste.total_cost, log_count: waste.log_count, threshold: settings.waste_daily_warning_dollars },
      sourceTable: 'waste_logs',
      businessDate,
    });
    violations.push(id);
  }

  // Theft auto-escalate
  if (settings.waste_theft_auto_escalate && waste.theft_count > 0) {
    const id = await createCOGSViolation({
      orgId,
      venueId,
      violationType: 'waste_theft',
      severity: 'critical',
      title: `${waste.theft_count} suspected theft event(s) logged`,
      description: `Suspected theft was logged on ${businessDate}. Immediate review required.`,
      metadata: { theft_count: waste.theft_count },
      sourceTable: 'waste_logs',
      businessDate,
    });
    violations.push(id);
  }

  return violations;
}

// ── COGS Variance Enforcement ──────────────────────────────────────────

export async function enforceCOGSVariance(
  venueId: string,
  orgId: string,
  businessDate: string,
  settings: {
    cogs_variance_warning_pct: number;
    cogs_variance_critical_pct: number;
    cogs_source: string;
  }
): Promise<string[]> {
  const supabase = getServiceClient();
  const violations: string[] = [];

  const viewName = settings.cogs_source === 'gl' ? 'v_food_cost_variance_gl' : 'v_food_cost_variance';
  const { data: variances } = await (supabase as any)
    .from(viewName)
    .select('*')
    .eq('venue_id', venueId)
    .eq('sale_date', businessDate);

  for (const v of variances || []) {
    if (v.variance_pct === null) continue;
    const absPct = Math.abs(v.variance_pct);

    if (absPct >= settings.cogs_variance_critical_pct) {
      const id = await createCOGSViolation({
        orgId,
        venueId,
        violationType: 'cogs_variance',
        severity: 'critical',
        title: `COGS variance ${v.variance_pct > 0 ? '+' : ''}${v.variance_pct}% (${v.cogs_category || 'total'})`,
        description: `Theoretical: $${v.theoretical_cost?.toFixed(2)}, Actual: $${v.actual_cost?.toFixed(2)}. Variance: $${v.variance_dollars?.toFixed(2)} (${v.variance_pct}%).`,
        metadata: { ...v },
        sourceTable: viewName,
        businessDate,
      });
      violations.push(id);
    } else if (absPct >= settings.cogs_variance_warning_pct) {
      const id = await createCOGSViolation({
        orgId,
        venueId,
        violationType: 'cogs_variance',
        severity: 'warning',
        title: `COGS variance ${v.variance_pct > 0 ? '+' : ''}${v.variance_pct}% (${v.cogs_category || 'total'})`,
        description: `Theoretical: $${v.theoretical_cost?.toFixed(2)}, Actual: $${v.actual_cost?.toFixed(2)}. Variance: $${v.variance_dollars?.toFixed(2)}.`,
        metadata: { ...v },
        sourceTable: viewName,
        businessDate,
      });
      violations.push(id);
    }
  }

  return violations;
}

// ── Menu Price Enforcement ─────────────────────────────────────────────

export async function enforceMenuPriceTargets(
  venueId: string,
  orgId: string,
  businessDate: string,
  settings: {
    menu_price_alert_enabled: boolean;
    menu_price_warning_threshold_pct: number;
    menu_price_critical_threshold_pct: number;
    menu_price_alert_min_price: number;
  }
): Promise<string[]> {
  if (!settings.menu_price_alert_enabled) return [];

  const supabase = getServiceClient();
  const violations: string[] = [];

  const { data: recipes } = await (supabase as any)
    .from('v_menu_margin_health')
    .select('*')
    .eq('venue_id', venueId)
    .in('margin_status', ['warning', 'critical'])
    .gt('menu_price', settings.menu_price_alert_min_price);

  for (const r of recipes || []) {
    const severity = r.margin_status === 'critical' ? 'critical' : 'warning';

    // Avoid duplicating menu_price_alert rows for the same recipe/day while still open.
    const { data: openAlert } = await (supabase as any)
      .from('menu_price_alerts')
      .select('id')
      .eq('venue_id', venueId)
      .eq('recipe_id', r.recipe_id)
      .eq('business_date', businessDate)
      .eq('status', 'open')
      .maybeSingle();

    // Create menu_price_alerts record
    if (!openAlert) {
      await (supabase as any)
        .from('menu_price_alerts')
        .insert({
          venue_id: venueId,
          recipe_id: r.recipe_id,
          recipe_name: r.recipe_name,
          current_menu_price: r.menu_price,
          current_cost_per_unit: r.cost_per_unit,
          current_food_cost_pct: r.actual_food_cost_pct,
          target_food_cost_pct: r.food_cost_target,
          breach_pct: r.breach_pct,
          suggested_price: r.suggested_price,
          price_increase_needed: r.price_increase_needed,
          severity,
          business_date: businessDate,
        });
    }

    // Also route to Action Center
    const id = await createCOGSViolation({
      orgId,
      venueId,
      violationType: 'menu_price_breach',
      severity,
      title: `${r.recipe_name}: food cost ${r.actual_food_cost_pct}% vs ${r.food_cost_target}% target`,
      description: `Menu price $${r.menu_price}, cost $${r.cost_per_unit}. ${r.breach_pct}pt above target. Suggested price: $${r.suggested_price}.`,
      metadata: {
        recipe_id: r.recipe_id,
        recipe_name: r.recipe_name,
        menu_price: r.menu_price,
        cost_per_unit: r.cost_per_unit,
        actual_pct: r.actual_food_cost_pct,
        target_pct: r.food_cost_target,
        suggested_price: r.suggested_price,
      },
      sourceTable: 'menu_price_alerts',
      businessDate,
    });
    violations.push(id);
  }

  return violations;
}

// ── Supplier Enforcement ───────────────────────────────────────────────

export async function enforceSupplierScores(
  venueId: string,
  orgId: string,
  businessDate: string,
  settings: {
    supplier_scorecard_enabled: boolean;
    supplier_accuracy_warning_pct: number;
    supplier_accuracy_critical_pct: number;
    supplier_ontime_warning_pct: number;
    supplier_ontime_critical_pct: number;
  }
): Promise<string[]> {
  if (!settings.supplier_scorecard_enabled) return [];

  const supabase = getServiceClient();
  const violations: string[] = [];

  const { data: scores } = await (supabase as any)
    .from('v_supplier_scorecard')
    .select('*')
    .eq('venue_id', venueId);

  for (const s of scores || []) {
    // Accuracy violations
    if (s.accuracy_pct !== null && s.accuracy_pct < settings.supplier_accuracy_critical_pct) {
      const id = await createCOGSViolation({
        orgId,
        venueId,
        violationType: 'supplier_accuracy',
        severity: 'critical',
        title: `${s.vendor_name}: ${s.accuracy_pct}% delivery accuracy (critical)`,
        description: `${s.total_short} short deliveries, ${s.total_rejected} rejected items in last 90 days. Shortage value: $${s.total_shortage_value?.toFixed(2)}.`,
        metadata: { ...s },
        sourceTable: 'delivery_receipts',
        businessDate,
      });
      violations.push(id);
    } else if (s.accuracy_pct !== null && s.accuracy_pct < settings.supplier_accuracy_warning_pct) {
      const id = await createCOGSViolation({
        orgId,
        venueId,
        violationType: 'supplier_accuracy',
        severity: 'warning',
        title: `${s.vendor_name}: ${s.accuracy_pct}% delivery accuracy`,
        description: `${s.total_short} short deliveries in last 90 days.`,
        metadata: { ...s },
        sourceTable: 'delivery_receipts',
        businessDate,
      });
      violations.push(id);
    }

    // On-time violations
    if (s.on_time_pct !== null && s.on_time_pct < settings.supplier_ontime_critical_pct) {
      const id = await createCOGSViolation({
        orgId,
        venueId,
        violationType: 'supplier_late',
        severity: 'critical',
        title: `${s.vendor_name}: ${s.on_time_pct}% on-time delivery rate (critical)`,
        description: `Average ${s.avg_days_late?.toFixed(1)} days late over ${s.total_deliveries} deliveries.`,
        metadata: { ...s },
        sourceTable: 'delivery_receipts',
        businessDate,
      });
      violations.push(id);
    } else if (s.on_time_pct !== null && s.on_time_pct < settings.supplier_ontime_warning_pct) {
      const id = await createCOGSViolation({
        orgId,
        venueId,
        violationType: 'supplier_late',
        severity: 'warning',
        title: `${s.vendor_name}: ${s.on_time_pct}% on-time delivery rate`,
        description: `Average ${s.avg_days_late?.toFixed(1)} days late over ${s.total_deliveries} deliveries.`,
        metadata: { ...s },
        sourceTable: 'delivery_receipts',
        businessDate,
      });
      violations.push(id);
    }
  }

  return violations;
}

export async function enforceRecipeCostSpikes(
  venueId: string,
  orgId: string,
  businessDate: string,
  settings: Record<string, any>,
): Promise<string[]> {
  const supabase = getServiceClient();
  const violations: string[] = [];
  const warningPct = Number(settings.recipe_cost_spike_warning_pct ?? 10);
  const criticalPct = Number(settings.recipe_cost_spike_critical_pct ?? 20);

  const { data: activeRecipes } = await (supabase as any)
    .from('recipes')
    .select('id')
    .eq('venue_id', venueId)
    .is('effective_to', null);

  const recipeIds = (activeRecipes || []).map((r: any) => r.id);
  if (!recipeIds.length) return violations;

  const { data: history } = await (supabase as any)
    .from('v_recipe_version_history')
    .select('*')
    .in('recipe_id', recipeIds)
    .eq('is_current', true)
    .not('cost_change_pct', 'is', null);

  for (const h of history || []) {
    const pct = Number(h.cost_change_pct);
    const absPct = Math.abs(pct);
    if (absPct < warningPct) continue;

    const severity: 'warning' | 'critical' = absPct >= criticalPct ? 'critical' : 'warning';
    const id = await createCOGSViolation({
      orgId,
      venueId,
      violationType: 'recipe_cost_spike',
      severity,
      title: `${h.name}: recipe cost ${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs prior version`,
      description: `Current cost/unit: $${Number(h.cost_per_unit || 0).toFixed(2)} (version ${h.version}).`,
      metadata: {
        recipe_id: h.recipe_id,
        recipe_name: h.name,
        version: h.version,
        cost_per_unit: h.cost_per_unit,
        cost_change_pct: pct,
        cost_delta: h.cost_delta,
      },
      sourceTable: 'v_recipe_version_history',
      businessDate,
    });
    violations.push(id);
  }

  return violations;
}

export async function enforceIngredientStockouts(
  venueId: string,
  orgId: string,
  businessDate: string,
): Promise<string[]> {
  const supabase = getServiceClient();
  const violations: string[] = [];

  const { data: needs } = await (supabase as any)
    .from('v_ingredient_needs_summary')
    .select('*')
    .eq('venue_id', venueId)
    .gt('net_need_qty', 0)
    .in('urgency', ['critical', 'warning']);

  for (const n of needs || []) {
    const severity: 'warning' | 'critical' = n.urgency === 'critical' ? 'critical' : 'warning';
    const id = await createCOGSViolation({
      orgId,
      venueId,
      violationType: 'ingredient_stockout',
      severity,
      title: `${n.item_name}: ${Number(n.net_need_qty).toFixed(2)} ${n.uom || ''} short`,
      description: `On hand ${Number(n.on_hand_qty || 0).toFixed(2)} ${n.uom || ''}, need ${Number(n.total_forecasted_qty || 0).toFixed(2)} by ${n.first_need_date}.`,
      metadata: {
        item_id: n.item_id,
        item_name: n.item_name,
        uom: n.uom,
        on_hand_qty: n.on_hand_qty,
        net_need_qty: n.net_need_qty,
        total_forecasted_qty: n.total_forecasted_qty,
        first_need_date: n.first_need_date,
        last_need_date: n.last_need_date,
        urgency: n.urgency,
      },
      sourceTable: 'v_ingredient_needs_summary',
      businessDate,
    });
    violations.push(id);
  }

  return violations;
}

// ── Run All COGS Enforcement ───────────────────────────────────────────

export async function runAllCOGSEnforcement(
  venueId: string,
  orgId: string,
  businessDate: string
): Promise<{ total_violations: number; by_type: Record<string, number> }> {
  const supabase = getServiceClient();

  // Get settings
  const { data: settings } = await (supabase as any)
    .from('procurement_settings')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (!settings) return { total_violations: 0, by_type: {} };

  const results: Record<string, string[]> = {};

  // Run all enforcement checks in parallel
  const [waste, cogs, menuPrice, supplier, recipeSpikes, stockouts] = await Promise.all([
    enforceWasteThresholds(venueId, orgId, businessDate, settings),
    enforceCOGSVariance(venueId, orgId, businessDate, settings),
    enforceMenuPriceTargets(venueId, orgId, businessDate, settings),
    enforceSupplierScores(venueId, orgId, businessDate, settings),
    enforceRecipeCostSpikes(venueId, orgId, businessDate, settings),
    enforceIngredientStockouts(venueId, orgId, businessDate),
  ]);

  results.waste = waste;
  results.cogs_variance = cogs;
  results.menu_price = menuPrice;
  results.supplier = supplier;
  results.recipe_cost_spike = recipeSpikes;
  results.ingredient_stockout = stockouts;

  const byType: Record<string, number> = {};
  let total = 0;
  for (const [type, ids] of Object.entries(results)) {
    byType[type] = ids.length;
    total += ids.length;
  }

  return { total_violations: total, by_type: byType };
}
