/**
 * Drill Insights Agent
 *
 * Generates pattern insights for each nightly report section.
 * Wraps lib/ai/drill-insights.ts into the agent registry contract.
 * Runs once per section (comps, servers, items, labor, categories).
 */

import { registerAgent, type AgentContext, type AgentResult, type ActionResult } from './registry';
import { generateDrillInsights } from '@/lib/ai/drill-insights';

const SECTIONS = ['comps', 'servers', 'items', 'labor', 'categories'] as const;

const SECTION_CATEGORY: Record<string, string> = {
  comps: 'violation',
  servers: 'training',
  items: 'process',
  labor: 'process',
  categories: 'process',
};

function buildSectionData(section: string, ctx: AgentContext): Record<string, unknown> | null {
  const report = ctx.report;
  if (!report) return null;

  switch (section) {
    case 'comps':
      if (!report.detailedComps?.length && !report.discounts?.length) return null;
      return { discounts: report.discounts, detailedComps: report.detailedComps, summary: report.summary };
    case 'servers':
      if (!report.servers?.length) return null;
      return { servers: report.servers, summary: report.summary };
    case 'items':
      if (!report.menuItems?.length) return null;
      return { menuItems: report.menuItems, summary: report.summary };
    case 'labor':
      if (!ctx.labor) return null;
      return { labor: ctx.labor, summary: report.summary };
    case 'categories':
      if (!report.salesByCategory?.length) return null;
      return { salesByCategory: report.salesByCategory, summary: report.summary };
    default:
      return null;
  }
}

async function run(ctx: AgentContext): Promise<AgentResult> {
  const allActions: ActionResult[] = [];

  for (const section of SECTIONS) {
    const data = buildSectionData(section, ctx);
    if (!data) continue;

    try {
      const insights = await generateDrillInsights({
        section,
        venueName: ctx.venueName,
        date: ctx.businessDate,
        data,
      });

      for (const insight of insights) {
        allActions.push({
          source_type: 'ai_drill_insight',
          priority: insight.severity === 'high' ? 'high' : insight.severity === 'medium' ? 'medium' : 'low',
          category: SECTION_CATEGORY[section] || 'process',
          title: insight.pattern,
          description: insight.detail,
          action: insight.action,
          metadata: { drill_section: section },
          expires_in_days: insight.severity === 'low' ? 14 : insight.severity === 'medium' ? 7 : null,
        });
      }
    } catch (err: any) {
      console.error(`[drill-insights-agent] ${section} failed for ${ctx.venueName}:`, err.message);
    }
  }

  return {
    agentId: 'drill-insights',
    actions: allActions,
    summary: `${allActions.length} insights across ${SECTIONS.length} sections`,
  };
}

registerAgent({
  id: 'drill-insights',
  name: 'Drill Insights Agent',
  description: 'Pattern recognition across all nightly report sections (comps, servers, items, labor, categories)',
  sourceType: 'ai_drill_insight',
  drillSections: ['comps', 'servers', 'items', 'labor', 'categories'],
  requires: ['report'],
  trigger: 'both',
  run,
});
