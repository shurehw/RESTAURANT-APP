/**
 * lib/email/nightly-report-template.ts
 * HTML email template for nightly location reports.
 *
 * Pure TypeScript string template with inline CSS for maximum
 * email client compatibility. No React/JSX dependency.
 */

import type { NightlyReportData } from '@/lib/database/tipsee';

// ── Types ────────────────────────────────────────────────────────

export interface VenueReport {
  venueName: string;
  venueId: string;
  report: NightlyReportData;
  laborData?: {
    labor_cost: number;
    labor_pct: number;
    total_hours: number;
    employee_count: number;
    foh_cost: number;
    boh_cost: number;
  } | null;
}

export interface NightlyEmailParams {
  orgName: string;
  businessDate: string;
  venues: VenueReport[];
  appUrl: string;
  logoUrl?: string | null;
  aiSummaries?: Map<string, string>;
  venuesWithNoNotes?: Set<string>;
}

// ── Deep-link builder ────────────────────────────────────────────

/**
 * Builds a URL to the nightly report page with drill-down params.
 * Recipients tap a specific callout in the email → land on the
 * filtered detail view in the app.
 */
function drillUrl(
  appUrl: string,
  date: string,
  params: Record<string, string> = {}
): string {
  const qs = new URLSearchParams({ date, ...params });
  return `${appUrl}/reports/nightly?${qs.toString()}`;
}

function linkStyle(color?: string): string {
  const c = color || '#D4622B';
  return `color: ${c}; text-decoration: none; border-bottom: 1px solid ${c};`;
}

// ── Helpers ──────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDecimal(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toFixed(1)}%`;
}

function num(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/**
 * Format an attestation closing_narrative into structured HTML.
 * Detects section headers (e.g. "REVENUE & COMPS", "LABOR", "ACTION ITEMS")
 * and bullet markers (•) to produce a readable layout.
 */
function formatNarrative(raw: string): string {
  // Strip the leading header line if present (e.g. "NIGHTLY OPERATING REPORT Delilah Dallas — ...")
  let text = raw.replace(/^NIGHTLY OPERATING REPORT[^\n]*\n?/i, '').trim();

  // Strip the multi-line KPI header block (Revenue: $X ... --- )
  text = text.replace(/^Delilah[^\n]*\n?/i, '').trim();
  text = text.replace(/^Revenue:[\s\S]*?---\s*/i, '').trim();

  // Strip markdown heading markers (e.g. "# REVENUE & COMPS" → "REVENUE & COMPS")
  text = text.replace(/^#{1,3}\s*/gm, '');

  // Known section headers
  const sectionPattern = /\b(REVENUE\s*&\s*COMPS|LABOR|GUEST|KITCHEN|TEAM|COACHING|ENTERTAINMENT|CULINARY|ACTION\s*ITEMS|INCIDENTS?)\b/g;

  // Split into sections by detecting uppercase headers
  const parts: { heading?: string; body: string }[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(text)) !== null) {
    // Push text before this section
    const before = text.slice(lastIdx, match.index).trim();
    if (before && parts.length > 0) {
      parts[parts.length - 1].body = before;
    } else if (before) {
      parts.push({ body: before });
    }
    parts.push({ heading: match[1], body: '' });
    lastIdx = match.index + match[0].length;
  }
  // Remaining text
  const remaining = text.slice(lastIdx).trim();
  if (remaining && parts.length > 0) {
    parts[parts.length - 1].body = remaining;
  } else if (remaining) {
    parts.push({ body: remaining });
  }

  // If no sections detected, just clean up the text
  if (parts.length === 0) {
    return text.replace(/•/g, '<br/>&#8226;').replace(/\n/g, '<br/>');
  }

  // Render sections
  return parts
    .map((p) => {
      let body = p.body.trim();

      // Format bullet points (• markers)
      if (body.includes('•')) {
        const bullets = body.split('•').filter(Boolean);
        body = '<ul style="margin: 4px 0 0 0; padding-left: 16px; list-style: disc;">' +
          bullets.map((b) => `<li style="margin-bottom: 2px; font-size: 11px; color: ${COLORS.textMuted};">${b.trim()}</li>`).join('') +
          '</ul>';
      } else {
        // Convert newlines to <br/> so action items on separate lines render correctly
        body = `<span style="font-size: 11px; color: ${COLORS.textMuted};">${body.replace(/\n/g, '<br/>')}</span>`;
      }

      if (p.heading) {
        return `<div style="margin-top: 6px;">
          <span style="font-size: 10px; font-weight: 600; color: ${COLORS.dark}; text-transform: uppercase; letter-spacing: 0.5px;">${p.heading}</span><br/>
          ${body}
        </div>`;
      }
      return `<div style="margin-top: 4px;">${body}</div>`;
    })
    .join('');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Styles ───────────────────────────────────────────────────────

const COLORS = {
  bg: '#FAF8F5',
  white: '#FFFEFB',
  dark: '#1C1917',
  accent: '#D4622B',
  accentLight: '#FDF5EF',
  text: '#1C1917',
  textMuted: '#8B7E6F',
  border: '#E8E2DA',
  headerBg: '#1C1917',
  headerText: '#ffffff',
  positive: '#5C6B4F',
  negative: '#dc2626',
};

const TABLE_STYLE = `
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-bottom: 16px;
`;

const TH_STYLE = `
  text-align: left;
  padding: 8px 12px;
  background-color: ${COLORS.accentLight};
  color: ${COLORS.dark};
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 2px solid ${COLORS.accent};
`;

const TH_RIGHT = `${TH_STYLE} text-align: right;`;

const TD_STYLE = `
  padding: 8px 12px;
  border-bottom: 1px solid ${COLORS.border};
  color: ${COLORS.text};
`;

const TD_RIGHT = `${TD_STYLE} text-align: right; font-variant-numeric: tabular-nums;`;

// ── Link context (passed to section renderers for deep-linking) ──

interface LinkCtx {
  appUrl: string;
  date: string;
  venueId: string;
}

// ── Section Renderers ────────────────────────────────────────────

function renderSummaryKPIs(report: NightlyReportData, labor?: VenueReport['laborData'], ctx?: LinkCtx): string {
  const s = report.summary;
  const avgCheck = s.total_checks > 0 ? s.net_sales / s.total_checks : 0;
  const compPct = s.net_sales > 0 ? (s.total_comps / (s.net_sales + s.total_comps)) * 100 : 0;

  const kpis: Array<{ label: string; value: string; href?: string }> = [
    { label: 'Net Sales', value: fmt(s.net_sales) },
    { label: 'Checks', value: num(s.total_checks) },
    { label: 'Covers', value: num(s.total_covers) },
    { label: 'Avg Check', value: fmtDecimal(avgCheck) },
    { label: 'Comps', value: fmt(s.total_comps), href: ctx ? drillUrl(ctx.appUrl, ctx.date, { section: 'comps', venue: ctx.venueId }) : undefined },
    { label: 'Comp %', value: pct(compPct), href: ctx ? drillUrl(ctx.appUrl, ctx.date, { section: 'comps', venue: ctx.venueId }) : undefined },
  ];

  if (labor) {
    kpis.push(
      { label: 'Labor Cost', value: fmt(labor.labor_cost), href: ctx ? drillUrl(ctx.appUrl, ctx.date, { section: 'labor', venue: ctx.venueId }) : undefined },
      { label: 'Labor %', value: pct(labor.labor_pct), href: ctx ? drillUrl(ctx.appUrl, ctx.date, { section: 'labor', venue: ctx.venueId }) : undefined }
    );
  }

  const kpiCards = kpis
    .map(
      (k) => {
        const valueHtml = k.href
          ? `<a href="${k.href}" style="${linkStyle(COLORS.dark)} font-size: 18px; font-weight: 700;">${k.value}</a>`
          : k.value;
        return `
      <td style="padding: 8px; text-align: center; width: ${100 / kpis.length}%;">
        <div style="font-size: 11px; color: ${COLORS.textMuted}; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          ${k.label}
        </div>
        <div style="font-size: 18px; font-weight: 700; color: ${COLORS.dark};">
          ${valueHtml}
        </div>
      </td>`;
      }
    )
    .join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>${kpiCards}</tr>
    </table>`;
}

function renderCategoryBreakdown(categories: NightlyReportData['salesByCategory'], ctx?: LinkCtx): string {
  if (!categories || categories.length === 0) return '';

  const rows = categories
    .map(
      (c) => `
      <tr>
        <td style="${TD_STYLE}">${c.category}</td>
        <td style="${TD_RIGHT}">${fmt(c.gross_sales)}</td>
        <td style="${TD_RIGHT}">${fmt(c.comps)}</td>
        <td style="${TD_RIGHT}">${fmt(c.net_sales)}</td>
      </tr>`
    )
    .join('');

  const headerLink = ctx
    ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'categories', venue: ctx.venueId })}" style="${linkStyle(COLORS.dark)}">Sales by Category</a>`
    : 'Sales by Category';

  return `
    <h3 style="font-size: 14px; font-weight: 600; color: ${COLORS.dark}; margin: 16px 0 8px;">${headerLink}</h3>
    <table style="${TABLE_STYLE}">
      <thead>
        <tr>
          <th style="${TH_STYLE}">Category</th>
          <th style="${TH_RIGHT}">Gross</th>
          <th style="${TH_RIGHT}">Comps</th>
          <th style="${TH_RIGHT}">Net</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderServers(servers: NightlyReportData['servers'], ctx?: LinkCtx): string {
  if (!servers || servers.length === 0) return '';

  const top10 = [...servers]
    .sort((a, b) => b.net_sales - a.net_sales)
    .slice(0, 10);

  const rows = top10
    .map((s) => {
      const nameCell = ctx
        ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'servers', server: s.employee_name, venue: ctx.venueId })}" style="${linkStyle(COLORS.dark)}">${s.employee_name}</a>`
        : s.employee_name;
      return `
      <tr>
        <td style="${TD_STYLE}">${nameCell}</td>
        <td style="${TD_RIGHT}">${num(s.tickets)}</td>
        <td style="${TD_RIGHT}">${num(s.covers)}</td>
        <td style="${TD_RIGHT}">${fmt(s.net_sales)}</td>
        <td style="${TD_RIGHT}">${fmtDecimal(s.avg_ticket)}</td>
        <td style="${TD_RIGHT}">${s.tip_pct != null ? pct(s.tip_pct) : '—'}</td>
      </tr>`;
    })
    .join('');

  const headerLink = ctx
    ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'servers', venue: ctx.venueId })}" style="${linkStyle(COLORS.dark)}">Top Servers</a>`
    : 'Top Servers';

  return `
    <h3 style="font-size: 14px; font-weight: 600; color: ${COLORS.dark}; margin: 16px 0 8px;">${headerLink}</h3>
    <table style="${TABLE_STYLE}">
      <thead>
        <tr>
          <th style="${TH_STYLE}">Server</th>
          <th style="${TH_RIGHT}">Tickets</th>
          <th style="${TH_RIGHT}">Covers</th>
          <th style="${TH_RIGHT}">Net Sales</th>
          <th style="${TH_RIGHT}">Avg Ticket</th>
          <th style="${TH_RIGHT}">Tip %</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderMenuItems(items: NightlyReportData['menuItems'], ctx?: LinkCtx): string {
  if (!items || items.length === 0) return '';

  const top10 = [...items]
    .sort((a, b) => b.net_total - a.net_total)
    .slice(0, 10);

  const rows = top10
    .map(
      (item) => `
      <tr>
        <td style="${TD_STYLE}">${item.name}</td>
        <td style="${TD_STYLE} color: ${COLORS.textMuted};">${item.parent_category}</td>
        <td style="${TD_RIGHT}">${num(item.qty)}</td>
        <td style="${TD_RIGHT}">${fmt(item.net_total)}</td>
      </tr>`
    )
    .join('');

  const headerLink = ctx
    ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'items', venue: ctx.venueId })}" style="${linkStyle(COLORS.dark)}">Top Menu Items</a>`
    : 'Top Menu Items';

  return `
    <h3 style="font-size: 14px; font-weight: 600; color: ${COLORS.dark}; margin: 16px 0 8px;">${headerLink}</h3>
    <table style="${TABLE_STYLE}">
      <thead>
        <tr>
          <th style="${TH_STYLE}">Item</th>
          <th style="${TH_STYLE}">Category</th>
          <th style="${TH_RIGHT}">Qty</th>
          <th style="${TH_RIGHT}">Revenue</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderComps(discounts: NightlyReportData['discounts'], ctx?: LinkCtx): string {
  if (!discounts || discounts.length === 0) return '';

  const rows = discounts
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((d) => {
      const reason = d.reason || 'Unspecified';
      const reasonCell = ctx
        ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'comps', reason, venue: ctx.venueId })}" style="${linkStyle(COLORS.dark)}">${reason}</a>`
        : reason;
      return `
      <tr>
        <td style="${TD_STYLE}">${reasonCell}</td>
        <td style="${TD_RIGHT}">${num(d.qty)}</td>
        <td style="${TD_RIGHT}">${fmt(d.amount)}</td>
      </tr>`;
    })
    .join('');

  const headerLink = ctx
    ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'comps', venue: ctx.venueId })}" style="${linkStyle(COLORS.dark)}">Comps &amp; Discounts</a>`
    : 'Comps &amp; Discounts';

  return `
    <h3 style="font-size: 14px; font-weight: 600; color: ${COLORS.dark}; margin: 16px 0 8px;">${headerLink}</h3>
    <table style="${TABLE_STYLE}">
      <thead>
        <tr>
          <th style="${TH_STYLE}">Reason</th>
          <th style="${TH_RIGHT}">Count</th>
          <th style="${TH_RIGHT}">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderVIPGuests(guests: NightlyReportData['notableGuests'], ctx?: LinkCtx): string {
  if (!guests || guests.length === 0) return '';

  const rows = guests
    .slice(0, 5)
    .map((g) => {
      const serverCell = ctx && g.server
        ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'servers', server: g.server, venue: ctx.venueId })}" style="${linkStyle(COLORS.dark)}">${g.server}</a>`
        : g.server;
      return `
      <tr>
        <td style="${TD_STYLE}">${g.cardholder_name || 'Anonymous'}</td>
        <td style="${TD_STYLE}">${serverCell}</td>
        <td style="${TD_RIGHT}">${num(g.covers)}</td>
        <td style="${TD_RIGHT}">${fmt(g.payment)}</td>
        <td style="${TD_RIGHT}">${g.tip_percent != null ? pct(g.tip_percent) : '—'}</td>
      </tr>`;
    })
    .join('');

  return `
    <h3 style="font-size: 14px; font-weight: 600; color: ${COLORS.dark}; margin: 16px 0 8px;">Notable Guests</h3>
    <table style="${TABLE_STYLE}">
      <thead>
        <tr>
          <th style="${TH_STYLE}">Guest</th>
          <th style="${TH_STYLE}">Server</th>
          <th style="${TH_RIGHT}">Covers</th>
          <th style="${TH_RIGHT}">Spend</th>
          <th style="${TH_RIGHT}">Tip %</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderLaborSummary(labor: VenueReport['laborData'], ctx?: LinkCtx): string {
  if (!labor) return '';

  const headerLink = ctx
    ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'labor', venue: ctx.venueId })}" style="${linkStyle(COLORS.dark)}">Labor Summary</a>`
    : 'Labor Summary';

  return `
    <h3 style="font-size: 14px; font-weight: 600; color: ${COLORS.dark}; margin: 16px 0 8px;">${headerLink}</h3>
    <table style="${TABLE_STYLE}">
      <thead>
        <tr>
          <th style="${TH_STYLE}">Metric</th>
          <th style="${TH_RIGHT}">Value</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="${TD_STYLE}">Total Labor Cost</td>
          <td style="${TD_RIGHT}">${fmt(labor.labor_cost)}</td>
        </tr>
        <tr>
          <td style="${TD_STYLE}">Labor %</td>
          <td style="${TD_RIGHT}">${pct(labor.labor_pct)}</td>
        </tr>
        <tr>
          <td style="${TD_STYLE}">Total Hours</td>
          <td style="${TD_RIGHT}">${labor.total_hours.toFixed(1)}</td>
        </tr>
        <tr>
          <td style="${TD_STYLE}">Employees</td>
          <td style="${TD_RIGHT}">${num(labor.employee_count)}</td>
        </tr>
        <tr>
          <td style="${TD_STYLE}">FOH Cost</td>
          <td style="${TD_RIGHT}">${fmt(labor.foh_cost)}</td>
        </tr>
        <tr>
          <td style="${TD_STYLE}">BOH Cost</td>
          <td style="${TD_RIGHT}">${fmt(labor.boh_cost)}</td>
        </tr>
      </tbody>
    </table>`;
}

// ── Venue Section ────────────────────────────────────────────────

function renderVenueSection(venue: VenueReport, isMultiVenue: boolean, ctx?: Omit<LinkCtx, 'venueId'>): string {
  const linkCtx: LinkCtx | undefined = ctx ? { ...ctx, venueId: venue.venueId } : undefined;

  const header = isMultiVenue
    ? `<h2 style="font-size: 18px; font-weight: 700; color: ${COLORS.dark}; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 2px solid ${COLORS.accent};">
        ${venue.venueName}
      </h2>`
    : '';

  // Multi-venue: compact view (KPIs + categories only)
  // Single-venue: full detail
  if (isMultiVenue) {
    return `
      ${header}
      ${renderSummaryKPIs(venue.report, venue.laborData, linkCtx)}
      ${renderCategoryBreakdown(venue.report.salesByCategory, linkCtx)}
    `;
  }

  return `
    ${header}
    ${renderSummaryKPIs(venue.report, venue.laborData, linkCtx)}
    ${renderCategoryBreakdown(venue.report.salesByCategory, linkCtx)}
    ${renderServers(venue.report.servers, linkCtx)}
    ${renderMenuItems(venue.report.menuItems, linkCtx)}
    ${renderComps(venue.report.discounts, linkCtx)}
    ${renderVIPGuests(venue.report.notableGuests, linkCtx)}
    ${renderLaborSummary(venue.laborData, linkCtx)}
  `;
}

// ── Narrative Linkification ──────────────────────────────────────

/**
 * Replace first occurrence of `pattern` in text segments only (skips HTML tags).
 */
function replaceFirstOutsideTags(
  html: string,
  pattern: RegExp,
  makeLink: (match: string) => string
): string {
  const parts = html.split(/(<[^>]+>)/);
  let done = false;
  return parts
    .map((part, i) => {
      // Odd indices are HTML tags — leave them alone
      if (done || i % 2 === 1) return part;
      return part.replace(pattern, (m) => {
        if (done) return m;
        done = true;
        return makeLink(m);
      });
    })
    .join('');
}

/**
 * Inject drill-through links into narrative text for known entities.
 * Matches comp reason names, server names, and generic labor/comp mentions
 * so that prose callouts like "BOH mistakes totaling $333" become tappable.
 */
function linkifyNarrative(
  html: string,
  ctx: LinkCtx,
  venue: VenueReport
): string {
  let result = html;

  // 1. Link known comp reason names (longest first to avoid partial matches)
  const reasonList = (venue.report.discounts || [])
    .map((d) => d.reason)
    .filter((r): r is string => !!r && r.length > 2);
  const reasons = Array.from(new Set<string>(reasonList)).sort(
    (a, b) => b.length - a.length
  );

  for (const reason of reasons) {
    const escaped = reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = replaceFirstOutsideTags(
      result,
      new RegExp(escaped, 'i'),
      (m) =>
        `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'comps', reason, venue: ctx.venueId })}" style="${linkStyle()}">${m}</a>`
    );
  }

  // 2. Link known server names
  const nameList = (venue.report.servers || [])
    .map((s) => s.employee_name)
    .filter((n): n is string => !!n && n.length > 2);
  const serverNames = Array.from(new Set<string>(nameList)).sort(
    (a, b) => b.length - a.length
  );

  for (const name of serverNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = replaceFirstOutsideTags(
      result,
      new RegExp(`\\b${escaped}\\b`, 'i'),
      (m) =>
        `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'servers', server: name, venue: ctx.venueId })}" style="${linkStyle()}">${m}</a>`
    );
  }

  // 3. Link first "labor" mention
  if (!result.includes('section=labor')) {
    result = replaceFirstOutsideTags(
      result,
      /\blabor\b/i,
      (m) =>
        `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'labor', venue: ctx.venueId })}" style="${linkStyle()}">${m}</a>`
    );
  }

  // 4. Link generic "comp"/"comps" if no specific reason was already linked
  if (!result.includes('section=comps')) {
    result = replaceFirstOutsideTags(
      result,
      /\bcomps?\b/i,
      (m) =>
        `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'comps', venue: ctx.venueId })}" style="${linkStyle()}">${m}</a>`
    );
  }

  // 5. Link beverage/food category mentions
  if (!result.includes('section=categories')) {
    result = replaceFirstOutsideTags(
      result,
      /\b(beverage|bev(?:erage)?\s+(?:mix|sales|%|percent|ratio)|food\s+(?:sales|mix|%))\b/i,
      (m) =>
        `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'categories', venue: ctx.venueId })}" style="${linkStyle()}">${m}</a>`
    );
  }

  return result;
}

// ── Consolidated Summary ─────────────────────────────────────────

function renderConsolidatedSummary(venues: VenueReport[], aiSummaries?: Map<string, string>, ctx?: Omit<LinkCtx, 'venueId'>, venuesWithNoNotes?: Set<string>): string {
  if (venues.length <= 1) return '';

  const COL_COUNT = 8;

  const totals = venues.reduce(
    (acc, v) => {
      acc.net_sales += v.report.summary.net_sales;
      acc.checks += v.report.summary.total_checks;
      acc.covers += v.report.summary.total_covers;
      acc.comps += v.report.summary.total_comps;
      if (v.laborData) {
        acc.labor_cost += v.laborData.labor_cost;
      }
      return acc;
    },
    { net_sales: 0, checks: 0, covers: 0, comps: 0, labor_cost: 0 }
  );

  const totalAvgCheck = totals.checks > 0 ? totals.net_sales / totals.checks : 0;
  const totalCompPct = totals.net_sales > 0 ? (totals.comps / (totals.net_sales + totals.comps)) * 100 : 0;
  const totalLaborPct = totals.net_sales > 0 ? (totals.labor_cost / totals.net_sales) * 100 : 0;

  // Sort venues by net sales descending
  const sorted = [...venues].sort(
    (a, b) => b.report.summary.net_sales - a.report.summary.net_sales
  );

  const rows = sorted
    .map((v) => {
      const s = v.report.summary;
      const avgCheck = s.total_checks > 0 ? s.net_sales / s.total_checks : 0;
      const compPct = s.net_sales > 0 ? (s.total_comps / (s.net_sales + s.total_comps)) * 100 : 0;
      const summary = aiSummaries?.get(v.venueId);
      const noManagerNotes = venuesWithNoNotes?.has(v.venueId);
      const isLongNarrative = summary && summary.length > 200;
      // Build linkified narrative: render first, then inject drill-through links
      let renderedNarrative = '';
      if (summary) {
        renderedNarrative = isLongNarrative ? formatNarrative(summary) : summary;
        if (ctx) {
          renderedNarrative = linkifyNarrative(renderedNarrative, { ...ctx, venueId: v.venueId }, v);
        }
      }
      const noNotesTag = noManagerNotes
        ? `<span style="font-size: 11px; color: ${COLORS.textMuted}; font-style: italic;">No manager notes provided.</span>`
        : '';
      const narrativeContent = [noNotesTag, renderedNarrative].filter(Boolean).join(renderedNarrative && isLongNarrative ? '<br/>' : ' ');
      const summaryRow = narrativeContent
        ? `<tr>
            <td colspan="${COL_COUNT}" style="padding: ${isLongNarrative ? '8px 12px 14px' : '4px 12px 12px'}; ${isLongNarrative ? '' : 'font-size: 12px; color: ' + COLORS.textMuted + '; font-style: italic;'} border-bottom: 1px solid ${COLORS.border};">
              ${narrativeContent}
            </td>
          </tr>`
        : '';

      // Deep-link venue name → full venue report; comps → comp detail
      const venueNameCell = ctx
        ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { venue: v.venueId })}" style="${linkStyle(COLORS.dark)}">${v.venueName}</a>`
        : v.venueName;
      const compsCell = ctx && s.total_comps > 0
        ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'comps', venue: v.venueId })}" style="${linkStyle(COLORS.negative)}">${fmt(s.total_comps)}</a>`
        : fmt(s.total_comps);
      const laborCell = ctx && v.laborData
        ? `<a href="${drillUrl(ctx.appUrl, ctx.date, { section: 'labor', venue: v.venueId })}" style="${linkStyle(COLORS.dark)}">${pct(v.laborData.labor_pct)}</a>`
        : (v.laborData ? pct(v.laborData.labor_pct) : '—');

      return `
      <tr>
        <td style="${TD_STYLE} font-weight: 600;">${venueNameCell}</td>
        <td style="${TD_RIGHT}">${fmt(s.net_sales)}</td>
        <td style="${TD_RIGHT}">${num(s.total_checks)}</td>
        <td style="${TD_RIGHT}">${num(s.total_covers)}</td>
        <td style="${TD_RIGHT}">${fmtDecimal(avgCheck)}</td>
        <td style="${TD_RIGHT}">${compsCell}</td>
        <td style="${TD_RIGHT}">${pct(compPct)}</td>
        <td style="${TD_RIGHT}">${laborCell}</td>
      </tr>${summaryRow}`;
    })
    .join('');

  const totalsRow = `
    <tr style="background-color: ${COLORS.accentLight}; font-weight: 700;">
      <td style="${TD_STYLE} font-weight: 700; border-top: 2px solid ${COLORS.accent};">TOTAL</td>
      <td style="${TD_RIGHT} font-weight: 700; border-top: 2px solid ${COLORS.accent};">${fmt(totals.net_sales)}</td>
      <td style="${TD_RIGHT} font-weight: 700; border-top: 2px solid ${COLORS.accent};">${num(totals.checks)}</td>
      <td style="${TD_RIGHT} font-weight: 700; border-top: 2px solid ${COLORS.accent};">${num(totals.covers)}</td>
      <td style="${TD_RIGHT} font-weight: 700; border-top: 2px solid ${COLORS.accent};">${fmtDecimal(totalAvgCheck)}</td>
      <td style="${TD_RIGHT} font-weight: 700; border-top: 2px solid ${COLORS.accent};">${fmt(totals.comps)}</td>
      <td style="${TD_RIGHT} font-weight: 700; border-top: 2px solid ${COLORS.accent};">${pct(totalCompPct)}</td>
      <td style="${TD_RIGHT} font-weight: 700; border-top: 2px solid ${COLORS.accent};">${pct(totalLaborPct)}</td>
    </tr>`;

  return `
    <div style="margin-bottom: 32px;">
      <h2 style="font-size: 18px; font-weight: 700; color: ${COLORS.dark}; margin: 0 0 16px; padding-bottom: 8px; border-bottom: 2px solid ${COLORS.accent};">Portfolio Summary</h2>
      <table style="${TABLE_STYLE} margin-bottom: 0;">
        <thead>
          <tr>
            <th style="${TH_STYLE}">Venue</th>
            <th style="${TH_RIGHT}">Net Sales</th>
            <th style="${TH_RIGHT}">Checks</th>
            <th style="${TH_RIGHT}">Covers</th>
            <th style="${TH_RIGHT}">Avg Check</th>
            <th style="${TH_RIGHT}">Comps</th>
            <th style="${TH_RIGHT}">Comp %</th>
            <th style="${TH_RIGHT}">Labor %</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          ${totalsRow}
        </tbody>
      </table>
    </div>`;
}

// ── Main Renderer ────────────────────────────────────────────────

export function renderNightlyReportEmail(params: NightlyEmailParams): string {
  const { orgName, businessDate, venues, appUrl, logoUrl, aiSummaries, venuesWithNoNotes } = params;
  const isMultiVenue = venues.length > 1;
  const dateDisplay = formatDate(businessDate);

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${orgName}" style="height: 32px; margin-right: 12px;" />`
    : '';

  const baseCtx: Omit<LinkCtx, 'venueId'> = { appUrl, date: businessDate };

  const venuesSections = venues
    .map((v) => renderVenueSection(v, isMultiVenue, baseCtx))
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nightly Report — ${dateDisplay}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.bg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 20px 0;" align="center">
        <table role="presentation" style="width: 100%; max-width: 700px; border-collapse: collapse;">

          <!-- Header -->
          <tr>
            <td style="background-color: ${COLORS.headerBg}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
              <table style="width: 100%;">
                <tr>
                  <td>
                    ${logoHtml}
                    <span style="font-size: 20px; font-weight: 700; color: ${COLORS.headerText};">
                      ${orgName}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 8px;">
                    <span style="font-size: 14px; color: #a0a0b0;">
                      Nightly Report — ${dateDisplay}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 24px 32px;">
              ${isMultiVenue ? renderConsolidatedSummary(venues, aiSummaries, baseCtx, venuesWithNoNotes) : venuesSections}
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="background-color: ${COLORS.white}; padding: 0 32px 24px;" align="center">
              <a href="${drillUrl(appUrl, businessDate)}"
                 style="display: inline-block; padding: 12px 32px; background-color: ${COLORS.accent}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                View Full Report in KevaOS
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${COLORS.bg}; padding: 16px 32px; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="font-size: 12px; color: ${COLORS.textMuted}; margin: 0;">
                This automated report was generated by KevaOS.
                To manage your subscription, visit
                <a href="${appUrl}/admin/settings" style="color: ${COLORS.accent};">Organization Settings</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
