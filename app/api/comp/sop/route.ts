/**
 * Comp SOP Generation API
 * Generates a Standard Operating Procedure document based on organization's comp settings
 *
 * GET /api/comp/sop?org_id=xxx [&format=markdown|html|json]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getActiveCompSettings, type CompSettings } from '@/lib/database/comp-settings';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('org_id');
    const format = searchParams.get('format') || 'markdown';

    if (!orgId) {
      return NextResponse.json(
        { error: 'org_id is required' },
        { status: 400 }
      );
    }

    const settings = await getActiveCompSettings(orgId);

    if (!settings) {
      return NextResponse.json(
        { error: 'No comp settings found for this organization' },
        { status: 404 }
      );
    }

    // Fetch organization details (including logo)
    const { getServiceClient } = await import('@/lib/supabase/service');
    const supabase = getServiceClient();
    const { data: org } = await (supabase as any)
      .from('organizations')
      .select('name, logo_url')
      .eq('id', orgId)
      .single();

    const sop = generateSOP(settings, format as 'markdown' | 'html' | 'json', org);

    if (format === 'json') {
      return NextResponse.json(sop);
    }

    // Return as plain text for markdown/html
    return new NextResponse(sop as string, {
      headers: {
        'Content-Type': format === 'html' ? 'text/html' : 'text/markdown',
      },
    });
  } catch (error: any) {
    console.error('Comp SOP generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate SOP document in requested format
 */
function generateSOP(
  settings: CompSettings,
  format: 'markdown' | 'html' | 'json',
  org?: { name: string; logo_url?: string | null }
): string | object {
  if (format === 'json') {
    return generateSOPJson(settings, org);
  }

  const markdown = generateSOPMarkdown(settings, org);

  if (format === 'html') {
    return markdownToBasicHtml(markdown, org);
  }

  return markdown;
}

/**
 * Generate SOP as structured JSON
 */
function generateSOPJson(
  settings: CompSettings,
  org?: { name: string; logo_url?: string | null }
): object {
  return {
    title: 'Comp Policy - Standard Operating Procedure',
    organization: org?.name || 'Organization',
    logo_url: org?.logo_url || null,
    version: settings.version,
    effective_date: settings.effective_from,
    sections: [
      {
        title: 'Approved Comp Reasons',
        items: settings.approved_reasons.map(r => ({
          name: r.name,
          max_amount: r.max_amount,
          requires_manager_approval: r.requires_manager_approval,
        })),
      },
      {
        title: 'Thresholds',
        items: [
          { name: 'High Value Comp', value: `$${settings.high_value_comp_threshold}+` },
          { name: 'High Comp % of Check', value: `>${settings.high_comp_pct_threshold}%` },
          { name: 'Daily Comp % Warning', value: `${settings.daily_comp_pct_warning}%` },
          { name: 'Daily Comp % Critical', value: `${settings.daily_comp_pct_critical}%` },
        ],
      },
      {
        title: 'Authority Levels',
        items: [
          {
            name: 'Server Maximum (Without Manager Approval)',
            value: `$${settings.server_max_comp_amount}`,
          },
          {
            name: 'Manager Authority Required',
            value: `$${settings.manager_min_for_high_value}+`,
          },
          {
            name: 'Manager Roles',
            value: settings.manager_roles.join(', '),
          },
        ],
      },
    ],
  };
}

/**
 * Generate SOP as Markdown
 */
function generateSOPMarkdown(
  settings: CompSettings,
  org?: { name: string; logo_url?: string | null }
): string {
  const date = settings.effective_from
    ? new Date(settings.effective_from).toLocaleDateString()
    : new Date().toLocaleDateString();

  const orgName = org?.name || 'Organization';
  const logoLine = org?.logo_url ? `![${orgName} Logo](${org.logo_url})\n\n` : '';

  return `${logoLine}# ${orgName}
## Comp Policy - Standard Operating Procedure

**Version:** ${settings.version}
**Effective Date:** ${date}
**Powered by:** OpSOS Enforcement Engine

---

## 1. Approved Comp Reasons

The following comp reasons are approved for use in our system. Any comp using an unapproved reason will be flagged for review.

${settings.approved_reasons
  .map((r, i) => {
    let line = `${i + 1}. **${r.name}**`;
    const notes: string[] = [];

    if (r.max_amount !== null) {
      notes.push(`Max: $${r.max_amount}`);
    }

    if (r.requires_manager_approval) {
      notes.push('Requires Manager Approval');
    }

    if (notes.length > 0) {
      line += `  \n   *${notes.join(' • ')}*`;
    }

    return line;
  })
  .join('\n')}

---

## 2. Comp Thresholds

These thresholds determine when comps require additional scrutiny or approval:

### High Value Comp
- **Threshold:** $${settings.high_value_comp_threshold}+
- **Action:** Requires manager-level authority and detailed documentation
- **Review:** All high-value comps are flagged for AI review

### High Comp Percentage of Check
- **Threshold:** >${settings.high_comp_pct_threshold}% of check total
- **Action:** Requires justification and manager awareness
- **Review:** May indicate potential abuse or policy violation

### Daily Comp Budget (% of Net Sales)
- **Warning Level:** ${settings.daily_comp_pct_warning}%
- **Critical Level:** ${settings.daily_comp_pct_critical}%
- **Action:** Managers receive alerts when thresholds are exceeded

---

## 3. Authority Levels

### Server Authority
- **Maximum Comp Amount:** $${settings.server_max_comp_amount}
- **Requirements:**
  - Must use approved comp reason
  - Must document reason clearly
  - Cannot exceed single-comp limit without manager approval

### Manager Authority
- **Required For:** Comps of $${settings.manager_min_for_high_value} or more
- **Manager Roles:** ${settings.manager_roles.join(', ')}
- **Requirements:**
  - Must approve high-value comps in POS
  - Must document business justification
  - Subject to AI review and audit trail

---

## 4. Documentation Requirements

All comps must include:
1. **Reason Code:** Selected from approved list
2. **Detailed Notes:** Explanation of why comp was issued
3. **Items Comped:** Clear itemization in POS
4. **Manager Approval:** For amounts exceeding authority limits

---

## 5. Enforcement & Review

### Automated Monitoring
- **AI Review:** All comp activity is analyzed daily by AI
- **Exception Detection:** Policy violations are automatically flagged
- **Control Plane:** Actionable recommendations sent to managers

### Audit Trail
- All comp settings changes are versioned and logged
- Historical comp reviews maintain original policy context
- Full transparency for CFO-level auditing

---

## 6. Policy Updates

This policy is version-controlled. Any changes to thresholds, approved reasons, or authority levels will:
- Create a new policy version
- Preserve historical versions for audit purposes
- Take effect immediately upon approval
- Be communicated to all staff

---

**Questions?** Contact your General Manager or Operations team.

**System Version:** ${settings.version} | **AI Model:** ${settings.ai_model}
`;
}

/**
 * Convert markdown to basic HTML (simple implementation)
 */
function markdownToBasicHtml(
  markdown: string,
  org?: { name: string; logo_url?: string | null }
): string {
  let html = markdown
    // Images (must come before other replacements)
    .replace(/!\[([^\]]+)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="org-logo">')
    // Headers
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr>')
    // Line breaks
    .replace(/  $/gm, '<br>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    // Lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>');

  const orgName = org?.name || 'Organization';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${orgName} - Comp Policy SOP</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      line-height: 1.6;
      color: #333;
    }
    .org-logo {
      max-width: 200px;
      max-height: 80px;
      margin-bottom: 20px;
      display: block;
    }
    h1 {
      color: #1a1a1a;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 10px;
      margin-top: 0;
    }
    h2 {
      color: #2a2a2a;
      margin-top: 30px;
      border-bottom: 1px solid #e0e0e0;
      padding-bottom: 5px;
    }
    h3 { color: #3a3a3a; margin-top: 20px; }
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 30px 0; }
    li { margin: 5px 0; }
    strong { color: #1a1a1a; }
    em { color: #666; }
    @media print {
      .org-logo { max-width: 150px; }
      body { margin: 20px; }
    }
  </style>
</head>
<body>
  <p>${html}</p>
</body>
</html>`;
}
