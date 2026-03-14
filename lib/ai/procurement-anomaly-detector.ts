/**
 * Procurement Anomaly Detector
 *
 * Analyzes ordering patterns and consumption signals to detect anomalies:
 * - Consumption spikes (sudden increase vs historical baseline)
 * - Unusual ordering frequency
 * - Price anomalies (vendor charging above expected)
 * - Par level mismatches (consistently over/under ordering)
 */

import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase/service';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Types ──────────────────────────────────────────────────────

export interface ConsumptionAnomaly {
  item_id: string;
  item_name: string;
  anomaly_type: 'consumption_spike' | 'frequency_change' | 'price_anomaly' | 'par_mismatch' | 'waste_pattern';
  severity: 'info' | 'warning' | 'critical';
  explanation: string;
  current_value: number;
  baseline_value: number;
  deviation_pct: number;
}

interface OrderingHistory {
  item_id: string;
  item_name: string;
  recent_orders: number; // orders in last 30 days
  baseline_orders: number; // avg orders per 30-day period (90-day lookback)
  recent_qty: number;
  baseline_qty: number;
  recent_avg_price: number;
  baseline_avg_price: number;
}

// ── Core Detection ──────────────────────────────────────────

/**
 * Detect consumption and ordering anomalies for a venue.
 * Uses statistical analysis first, then AI review for ambiguous cases.
 */
export async function detectConsumptionAnomalies(
  venueId: string,
  orgId: string
): Promise<ConsumptionAnomaly[]> {
  const anomalies: ConsumptionAnomaly[] = [];

  // 1. Get ordering history
  const history = await getOrderingHistory(venueId);
  if (history.length === 0) return [];

  // 2. Statistical anomaly detection
  for (const item of history) {
    // Consumption spike: recent orders significantly above baseline
    if (item.baseline_orders > 0 && item.recent_orders > 0) {
      const orderRatio = item.recent_orders / item.baseline_orders;
      if (orderRatio >= 2.0) {
        anomalies.push({
          item_id: item.item_id,
          item_name: item.item_name,
          anomaly_type: 'consumption_spike',
          severity: orderRatio >= 3.0 ? 'critical' : 'warning',
          explanation: `Ordering frequency ${orderRatio.toFixed(1)}x above 90-day baseline. ${item.recent_orders} orders in last 30 days vs avg ${item.baseline_orders.toFixed(1)}.`,
          current_value: item.recent_orders,
          baseline_value: item.baseline_orders,
          deviation_pct: Math.round((orderRatio - 1) * 100),
        });
      }
    }

    // Quantity spike: ordering more per PO
    if (item.baseline_qty > 0 && item.recent_qty > 0) {
      const qtyRatio = item.recent_qty / item.baseline_qty;
      if (qtyRatio >= 1.5) {
        anomalies.push({
          item_id: item.item_id,
          item_name: item.item_name,
          anomaly_type: 'consumption_spike',
          severity: qtyRatio >= 2.5 ? 'critical' : 'warning',
          explanation: `Order quantity ${qtyRatio.toFixed(1)}x above baseline. Recent avg: ${item.recent_qty.toFixed(0)}, baseline: ${item.baseline_qty.toFixed(0)}.`,
          current_value: item.recent_qty,
          baseline_value: item.baseline_qty,
          deviation_pct: Math.round((qtyRatio - 1) * 100),
        });
      }
    }

    // Price anomaly: vendor charging more than historical
    if (item.baseline_avg_price > 0 && item.recent_avg_price > 0) {
      const priceIncrease =
        ((item.recent_avg_price - item.baseline_avg_price) / item.baseline_avg_price) * 100;
      if (priceIncrease >= 10) {
        anomalies.push({
          item_id: item.item_id,
          item_name: item.item_name,
          anomaly_type: 'price_anomaly',
          severity: priceIncrease >= 20 ? 'critical' : 'warning',
          explanation: `Unit price up ${priceIncrease.toFixed(1)}%. Recent: $${item.recent_avg_price.toFixed(2)}, baseline: $${item.baseline_avg_price.toFixed(2)}.`,
          current_value: item.recent_avg_price,
          baseline_value: item.baseline_avg_price,
          deviation_pct: Math.round(priceIncrease),
        });
      }
    }
  }

  // 3. AI review for ambiguous anomalies (if we found statistical ones)
  if (anomalies.length > 0 && anomalies.length <= 20) {
    try {
      const aiInsights = await aiReviewAnomalies(anomalies, venueId);
      // AI can upgrade/downgrade severity or add context
      for (const insight of aiInsights) {
        const existing = anomalies.find(
          (a) => a.item_id === insight.item_id && a.anomaly_type === insight.anomaly_type
        );
        if (existing && insight.revised_severity) {
          existing.severity = insight.revised_severity;
          existing.explanation = `${existing.explanation} [AI: ${insight.context}]`;
        }
      }
    } catch (err: any) {
      console.warn('[AnomalyDetector] AI review failed, using statistical results only:', err.message);
    }
  }

  return anomalies;
}

// ── Data Gathering ──────────────────────────────────────────

async function getOrderingHistory(venueId: string): Promise<OrderingHistory[]> {
  const supabase = getServiceClient();

  // Get PO items from last 120 days grouped by item
  const { data, error } = await (supabase as any)
    .from('purchase_order_items')
    .select(`
      item_id,
      quantity,
      unit_price,
      purchase_orders!inner(venue_id, order_date, status)
    `)
    .eq('purchase_orders.venue_id', venueId)
    .in('purchase_orders.status', ['pending', 'ordered', 'received'])
    .gte('purchase_orders.order_date', new Date(Date.now() - 120 * 86400000).toISOString().split('T')[0]);

  if (error || !data || data.length === 0) return [];

  // Get item names
  const itemIds = [...new Set(data.map((d: any) => d.item_id))];
  const { data: items } = await (supabase as any)
    .from('items')
    .select('id, name')
    .in('id', itemIds);

  const nameMap = new Map<string, string>();
  for (const item of items || []) {
    nameMap.set(item.id, item.name);
  }

  // Split into recent (last 30 days) vs baseline (30-120 days ago)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const itemStats = new Map<string, {
    recent_orders: number;
    baseline_orders: number;
    recent_qty: number;
    baseline_qty: number;
    recent_prices: number[];
    baseline_prices: number[];
  }>();

  for (const row of data) {
    const itemId = row.item_id;
    if (!itemStats.has(itemId)) {
      itemStats.set(itemId, {
        recent_orders: 0, baseline_orders: 0,
        recent_qty: 0, baseline_qty: 0,
        recent_prices: [], baseline_prices: [],
      });
    }

    const stats = itemStats.get(itemId)!;
    const isRecent = row.purchase_orders.order_date >= thirtyDaysAgo;

    if (isRecent) {
      stats.recent_orders++;
      stats.recent_qty += row.quantity;
      stats.recent_prices.push(row.unit_price);
    } else {
      stats.baseline_orders++;
      stats.baseline_qty += row.quantity;
      stats.baseline_prices.push(row.unit_price);
    }
  }

  // Normalize baseline to per-30-day rate (baseline covers 90 days)
  return Array.from(itemStats.entries()).map(([itemId, stats]) => ({
    item_id: itemId,
    item_name: nameMap.get(itemId) || itemId,
    recent_orders: stats.recent_orders,
    baseline_orders: stats.baseline_orders / 3, // normalize to 30-day rate
    recent_qty: stats.recent_orders > 0 ? stats.recent_qty / stats.recent_orders : 0,
    baseline_qty: stats.baseline_orders > 0 ? stats.baseline_qty / stats.baseline_orders : 0,
    recent_avg_price: stats.recent_prices.length > 0
      ? stats.recent_prices.reduce((a, b) => a + b, 0) / stats.recent_prices.length
      : 0,
    baseline_avg_price: stats.baseline_prices.length > 0
      ? stats.baseline_prices.reduce((a, b) => a + b, 0) / stats.baseline_prices.length
      : 0,
  }));
}

// ── AI Review ──────────────────────────────────────────────

interface AIAnomalyInsight {
  item_id: string;
  anomaly_type: string;
  revised_severity?: 'info' | 'warning' | 'critical';
  context: string;
}

async function aiReviewAnomalies(
  anomalies: ConsumptionAnomaly[],
  venueId: string
): Promise<AIAnomalyInsight[]> {
  const anomalySummary = anomalies
    .map((a) => `- ${a.item_name} (${a.item_id}): ${a.anomaly_type} — ${a.explanation}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: `You are a restaurant procurement analyst reviewing ordering anomalies. For each anomaly, determine if it's likely:
1. A real problem (waste, theft, vendor price gouging) → keep or upgrade severity
2. Explainable by seasonality or business changes → downgrade to "info"
3. Normal variation → suggest removal

Return a JSON array:
[{ "item_id": "...", "anomaly_type": "...", "revised_severity": "info|warning|critical" or null, "context": "brief explanation" }]

Only include items where you have an insight. Return ONLY the JSON array.`,
    messages: [
      {
        role: 'user',
        content: `Review these procurement anomalies for venue ${venueId}:\n\n${anomalySummary}`,
      },
    ],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';
  const cleaned = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned) as AIAnomalyInsight[];
}
