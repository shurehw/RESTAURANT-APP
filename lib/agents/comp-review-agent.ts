/**
 * Comp Review Agent
 *
 * Analyzes all comp activity for a venue and generates enforcement actions.
 * Wraps lib/ai/comp-reviewer.ts into the agent registry contract.
 */

import { registerAgent, type AgentContext, type AgentResult, type ActionResult } from './registry';
import { reviewComps, type CompReviewInput } from '@/lib/ai/comp-reviewer';
import { getCompSettingsForVenue } from '@/lib/database/comp-settings';

async function run(ctx: AgentContext): Promise<AgentResult> {
  const report = ctx.report;
  if (!report?.detailedComps?.length) {
    return { agentId: 'comp-review', actions: [] };
  }

  const compSettings = await getCompSettingsForVenue(ctx.venueId);

  const reviewInput: CompReviewInput = {
    date: ctx.businessDate,
    venueName: ctx.venueName,
    allComps: (report.detailedComps || []).map((comp: any) => ({
      check_id: comp.check_id,
      table_name: comp.table_name,
      server: comp.server,
      comp_total: comp.comp_total,
      check_total: comp.check_total,
      reason: comp.reason,
      comped_items: (comp.comped_items || []).map((itemStr: any) => {
        if (typeof itemStr === 'string') {
          const amountMatch = itemStr.match(/\(\$([0-9.]+)\)$/);
          const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
          const namePart = amountMatch
            ? itemStr.substring(0, itemStr.lastIndexOf('($')).trim()
            : itemStr;
          const qtyMatch = namePart.match(/^(.+?)\s+x(\d+)$/);
          const name = qtyMatch ? qtyMatch[1].trim() : namePart;
          const quantity = qtyMatch ? parseInt(qtyMatch[2], 10) : 1;
          return { name, quantity, amount };
        }
        return itemStr;
      }),
    })),
    exceptions: {
      summary: {
        date: ctx.businessDate,
        total_comps: report.summary.total_comps,
        net_sales: report.summary.net_sales,
        comp_pct: report.summary.net_sales > 0
          ? (report.summary.total_comps / report.summary.net_sales) * 100 : 0,
        comp_pct_status: 'ok' as const,
        exception_count: 0,
        critical_count: 0,
        warning_count: 0,
      },
      exceptions: [],
    },
    summary: {
      total_comps: report.summary.total_comps,
      net_sales: report.summary.net_sales,
      comp_pct: report.summary.net_sales > 0
        ? (report.summary.total_comps / report.summary.net_sales) * 100 : 0,
      total_checks: report.summary.total_checks,
    },
  };

  // Fetch historical data if TipSee mapping exists
  if (ctx.tipseeUuid) {
    try {
      const { getTipseePool } = await import('@/lib/database/tipsee');
      const pool = getTipseePool();
      const result = await pool.query(
        `SELECT
          AVG(CASE WHEN revenue_total > 0 THEN (comp_total / revenue_total) * 100 ELSE 0 END) as avg_comp_pct,
          AVG(comp_total) as avg_comp_total,
          SUM(comp_total) as total_comps,
          SUM(revenue_total) as total_revenue
        FROM public.tipsee_checks
        WHERE location_uuid = $1
          AND trading_day < $2
          AND trading_day >= (DATE($2) - INTERVAL '7 days')::date`,
        [ctx.tipseeUuid, ctx.businessDate]
      );
      const row = result.rows[0];
      reviewInput.historical = {
        avg_daily_comp_pct: parseFloat(row?.avg_comp_pct || '0'),
        avg_daily_comp_total: parseFloat(row?.avg_comp_total || '0'),
        previous_week_comp_pct: parseFloat(row?.total_revenue || '0') > 0
          ? (parseFloat(row?.total_comps || '0') / parseFloat(row?.total_revenue || '0')) * 100
          : 0,
      };
    } catch {
      reviewInput.historical = { avg_daily_comp_pct: 0, avg_daily_comp_total: 0, previous_week_comp_pct: 0 };
    }
  }

  const review = await reviewComps(reviewInput, compSettings ?? undefined);

  const actions: ActionResult[] = review.recommendations.map((rec) => ({
    source_type: 'ai_comp_review',
    priority: rec.priority,
    category: rec.category,
    title: rec.title,
    description: rec.description,
    action: rec.action,
    related_checks: rec.relatedComps || [],
    expires_in_days: rec.priority === 'low' ? 30 : null,
  }));

  return {
    agentId: 'comp-review',
    actions,
    summary: review.summary.overallAssessment,
  };
}

registerAgent({
  id: 'comp-review',
  name: 'Comp Review Agent',
  description: 'Reviews all comp activity and flags violations, training needs, and patterns',
  sourceType: 'ai_comp_review',
  drillSections: ['comps'],
  requires: ['report'],
  trigger: 'both',
  run,
});
