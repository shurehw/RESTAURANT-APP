/**
 * Procurement Anomaly Agent
 *
 * Detects ordering/consumption anomalies and surfaces them as action items.
 * Wraps lib/ai/procurement-anomaly-detector.ts into the agent registry contract.
 */

import { registerAgent, type AgentContext, type AgentResult, type ActionResult } from './registry';

const SEVERITY_MAP: Record<string, 'urgent' | 'high' | 'medium' | 'low'> = {
  critical: 'high',
  warning: 'medium',
  info: 'low',
};

async function run(ctx: AgentContext): Promise<AgentResult> {
  const { detectConsumptionAnomalies } = await import('@/lib/ai/procurement-anomaly-detector');

  const anomalies = await detectConsumptionAnomalies(ctx.venueId, ctx.orgId);
  if (anomalies.length === 0) {
    return { agentId: 'procurement-anomaly', actions: [] };
  }

  const actions: ActionResult[] = anomalies.map((a) => ({
    source_type: 'ai_procurement_anomaly',
    priority: SEVERITY_MAP[a.severity] || 'medium',
    category: 'process',
    title: `${a.anomaly_type.replace(/_/g, ' ')}: ${a.item_name}`,
    description: a.explanation,
    action: a.anomaly_type === 'price_anomaly'
      ? `Review vendor pricing for ${a.item_name}. Current: $${a.current_value.toFixed(2)} vs baseline $${a.baseline_value.toFixed(2)} (${a.deviation_pct.toFixed(0)}% deviation).`
      : a.anomaly_type === 'consumption_spike'
      ? `Investigate ${a.item_name} consumption spike. Check for waste, theft, or recipe change.`
      : `Review ordering pattern for ${a.item_name}.`,
    metadata: {
      anomaly_type: a.anomaly_type,
      item_id: a.item_id,
      current_value: a.current_value,
      baseline_value: a.baseline_value,
      deviation_pct: a.deviation_pct,
    },
    expires_in_days: a.severity === 'critical' ? null : 14,
  }));

  return {
    agentId: 'procurement-anomaly',
    actions,
    summary: `${anomalies.length} anomalies detected`,
  };
}

registerAgent({
  id: 'procurement-anomaly',
  name: 'Procurement Anomaly Agent',
  description: 'Detects consumption spikes, price anomalies, and ordering pattern deviations',
  sourceType: 'ai_procurement_anomaly',
  drillSections: [],
  requires: [],
  trigger: 'nightly',
  run,
});
