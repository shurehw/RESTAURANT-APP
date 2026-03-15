/**
 * lib/database/comp-trends.ts
 * Queries tipsee_nightly_cache for multi-day comp trends.
 * Used by the nightly narrator to flag recurring problem items.
 */

import { getServiceClient } from '@/lib/supabase/service';

export interface CompItemTrend {
  itemName: string;        // e.g. "Bavette Steak"
  compCount: number;       // times comped in window
  totalNights: number;     // nights it appeared comped
  totalAmount: number;     // total $ comped
  compRate: number;        // % of nights with this item comped vs nights venue was open
  topReasons: string[];    // most common comp reasons for this item
}

export interface CompTrendSummary {
  windowDays: number;          // how many days of data we looked at
  activeDays: number;          // days venue had data
  avgDailyCompPct: number;     // average comp % over the window
  avgDailyCompTotal: number;   // average daily comp $
  problemItems: CompItemTrend[]; // items with elevated comp rates (sorted by compCount desc)
  topReasons: Array<{ reason: string; totalAmount: number; occurrences: number }>;
}

/**
 * Fetch 14-day comp trends for a venue from tipsee_nightly_cache.
 * Returns null if insufficient data (<3 days).
 */
export async function fetchCompTrends(
  venueId: string,
  businessDate: string,
  windowDays: number = 14
): Promise<CompTrendSummary | null> {
  const supabase = getServiceClient();

  // Calculate date range (exclude current date — we're looking at history)
  const endDate = businessDate;
  const startDate = subtractDays(businessDate, windowDays);

  const { data: rows, error } = await (supabase as any)
    .from('tipsee_nightly_cache')
    .select('business_date, report_data')
    .eq('venue_id', venueId)
    .gte('business_date', startDate)
    .lt('business_date', endDate)
    .order('business_date', { ascending: false });

  if (error || !rows || rows.length < 3) return null;

  const activeDays = rows.length;
  let totalComps = 0;
  let totalSales = 0;

  // Track item-level comp occurrences
  const itemMap = new Map<string, {
    count: number;
    nights: Set<string>;
    amount: number;
    reasons: Map<string, number>;
  }>();

  // Track reason-level aggregates
  const reasonMap = new Map<string, { amount: number; occurrences: number }>();

  for (const row of rows) {
    const report = row.report_data;
    if (!report?.summary) continue;

    const daySales = report.summary.net_sales || 0;
    const dayComps = report.summary.total_comps || 0;
    totalSales += daySales;
    totalComps += dayComps;

    // Aggregate discount reasons
    for (const disc of (report.discounts || [])) {
      if (!disc.reason || disc.amount <= 0) continue;
      const existing = reasonMap.get(disc.reason) || { amount: 0, occurrences: 0 };
      existing.amount += disc.amount;
      existing.occurrences += disc.qty || 1;
      reasonMap.set(disc.reason, existing);
    }

    // Extract comped items from detailedComps
    for (const comp of (report.detailedComps || [])) {
      const items = comp.comped_items || comp.items || [];
      const reason = comp.reason || 'Unknown';

      for (const rawItem of items) {
        // Normalize: strip price suffix like "Bavette Steak ($62.00)"
        const itemName = normalizeItemName(rawItem);
        if (!itemName) continue;

        const entry = itemMap.get(itemName) || {
          count: 0,
          nights: new Set<string>(),
          amount: 0,
          reasons: new Map<string, number>(),
        };
        entry.count++;
        entry.nights.add(row.business_date);
        entry.amount += comp.comp_total / Math.max(items.length, 1); // apportion
        entry.reasons.set(reason, (entry.reasons.get(reason) || 0) + 1);
        itemMap.set(itemName, entry);
      }
    }
  }

  // Build problem items: items comped 3+ times or on 2+ nights
  const problemItems: CompItemTrend[] = [];
  for (const [itemName, data] of itemMap) {
    if (data.count < 3 && data.nights.size < 2) continue;

    const topReasons = [...data.reasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([r]) => r);

    problemItems.push({
      itemName,
      compCount: data.count,
      totalNights: data.nights.size,
      totalAmount: Math.round(data.amount),
      compRate: Math.round((data.nights.size / activeDays) * 1000) / 10, // e.g. 35.7%
      topReasons,
    });
  }

  // Sort by comp count descending, take top 8
  problemItems.sort((a, b) => b.compCount - a.compCount);
  const topProblemItems = problemItems.slice(0, 8);

  // Build top reasons
  const topReasons = [...reasonMap.entries()]
    .map(([reason, data]) => ({
      reason,
      totalAmount: Math.round(data.amount),
      occurrences: data.occurrences,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 5);

  const avgDailyCompPct = totalSales > 0
    ? Math.round((totalComps / totalSales) * 1000) / 10
    : 0;

  return {
    windowDays,
    activeDays,
    avgDailyCompPct,
    avgDailyCompTotal: Math.round(totalComps / activeDays),
    problemItems: topProblemItems,
    topReasons,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function normalizeItemName(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  // Strip price suffix: "Bavette Steak ($62.00)" → "Bavette Steak"
  let name = raw.replace(/\s*\(\$[\d,.]+\)\s*$/, '').trim();
  // Strip quantity prefix: "2x Cocktail" → "Cocktail"
  name = name.replace(/^\d+x?\s+/i, '').trim();
  return name.length > 1 ? name : null;
}
