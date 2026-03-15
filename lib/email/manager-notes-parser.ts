/**
 * lib/email/manager-notes-parser.ts
 * Parses manager notes from Lightspeed Daily Digest and Wynn DAILY SHIFT REPORT emails.
 * Ported from JBS-Life consolidator_current.py.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface ParsedManagerNotes {
  format: 'lightspeed' | 'wynn';
  venueName: string;
  sections: Record<string, string>;
}

// ── Venue Name Mapping ─────────────────────────────────────────────

const VENUE_ALIASES: Record<string, string> = {
  'delilah hollywood': 'Delilah LA',
  'delilah los angeles': 'Delilah LA',
  'delilah la': 'Delilah LA',
  'delilah miami': 'Delilah Miami',
  'delilah vegas': 'Delilah Las Vegas',
  'delilah las vegas': 'Delilah Las Vegas',
  'delilah lv': 'Delilah Las Vegas',
  'nice guy': 'Nice Guy LA',
  'the nice guy': 'Nice Guy LA',
  'bird streets club': 'Bird Streets Club',
  'bsc': 'Bird Streets Club',
  'poppy': 'Poppy',
  'keys': 'Keys',
  'harriets west hollywood': 'Harriets West Hollywood',
  'harriets weho': 'Harriets West Hollywood',
  'harriets nashville': 'Harriets Nashville',
  'didi': 'Didi Events',
};

/**
 * Resolve an email venue name to a KevaOS venue name.
 */
export function resolveVenueName(emailName: string): string | null {
  const normalized = emailName.trim().toLowerCase();
  return VENUE_ALIASES[normalized] || null;
}

// ── HTML Helpers ───────────────────────────────────────────────────

function stripHtml(html: string): string {
  // Replace <br>, <br/>, </div>, </p>, </tr> with newlines
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(?:div|p|tr|td|li)>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#x27;/g, "'");
  // Normalize curly quotes to ASCII (U+2018/2019 → ', U+201C/201D → ")
  text = text.replace(/[\u2018\u2019\u2032]/g, "'");
  text = text.replace(/[\u201C\u201D]/g, '"');
  return text;
}

/**
 * Detect staff/manager signature names in section text.
 * Lightspeed emails put the manager name at the end of each section line,
 * separated from content by 2+ spaces (adjacent HTML table cells).
 * Multi-shift venues have one name per shift per section.
 * Returns the set of detected staff names.
 */
/**
 * Detect staff signature names with high confidence (2+ spaces before name).
 */
function detectStaffSignatures(lines: string[]): Set<string> {
  const names = new Set<string>();
  const nameWord = `[A-Z][a-z']+|[A-Z]{2,3}`;
  const namePattern = new RegExp(`^(?:${nameWord})(?:\\s+(?:${nameWord}))+$`);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Case 1: entire line is just a name (standalone signature)
    if (namePattern.test(trimmed) && trimmed.split(/\s+/).length <= 3) {
      names.add(trimmed);
      continue;
    }

    // Case 2: name at end of line after 2+ spaces (Lightspeed table cell pattern)
    const trailingRe = new RegExp(`\\s{2,}((?:${nameWord})(?:\\s+(?:${nameWord})){1,2})\\s*$`);
    const trailingMatch = trimmed.match(trailingRe);
    if (trailingMatch) {
      names.add(trailingMatch[1]);
    }
  }
  return names;
}

/**
 * Detect possible staff names at end of lines (even after single space).
 * Collects both 2-word and 3-word trailing name candidates.
 * Only confirmed as staff if they appear in multiple sections.
 */
function detectPossibleStaffNames(lines: string[]): Set<string> {
  const names = new Set<string>();
  const nameWord = `[A-Z][a-z']+|[A-Z]{2,3}`;

  // Try both 2-word (most common) and 3-word trailing names
  const twoWordRe = new RegExp(`\\s((?:${nameWord})\\s+(?:${nameWord}))\\s*$`);
  const threeWordRe = new RegExp(`\\s((?:${nameWord})(?:\\s+(?:${nameWord})){2})\\s*$`);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 10) continue;

    const match2 = trimmed.match(twoWordRe);
    if (match2) names.add(match2[1]);

    const match3 = trimmed.match(threeWordRe);
    if (match3) names.add(match3[1]);
  }
  return names;
}

function cleanNotes(text: string, staffNames?: Set<string>): string {
  // Remove leading "NA", normalize whitespace
  let cleaned = text.replace(/^NA\s+/i, '').trim();
  if (cleaned.toUpperCase() === 'NA' || cleaned.length <= 3) return '';

  // Split into lines to detect and remove staff signatures
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);

  // Use provided staff names or detect from this section
  const signatures = staffNames || detectStaffSignatures(lines);

  // Remove lines that are just a staff signature
  const contentLines = lines.filter((line) => !signatures.has(line));

  // Strip staff names from lines — handles both:
  // 1. Name at end after 2+ spaces: "Emmanuel Acho.   Gabriel Coble"
  // 2. Name glued at end with 1 space: "Smooth service. Tony Harth"
  const result = contentLines
    .map((line) => {
      for (const name of signatures) {
        const escaped = escapeRegex(name);
        // First try: name after 2+ spaces (Lightspeed table cell join)
        const multiSpace = new RegExp(`\\s{2,}${escaped}\\s*$`);
        if (multiSpace.test(line)) {
          line = line.replace(multiSpace, '').trim();
          continue;
        }
        // Second try: name at end with single space/period
        const suffix = new RegExp(`[\\s.]+${escaped}\\s*$`, 'i');
        if (suffix.test(line)) {
          line = line.replace(suffix, '').trim();
        }
      }
      return line;
    })
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return result;
}

/**
 * Strip server check detail blocks from cover_count section.
 * Lightspeed embeds "Notable Guests" with server-attributed checks:
 *   "Visa Cardholder Demi Pinkus Server | 9 Covers | $1,643.33 Payment | 38% Tip | ..."
 * We keep only the leading cover number and any text before "Notable Guests".
 */
function stripServerCheckDetails(raw: string): string {
  // Split at "Notable Guests" — everything after is server check data
  const notableIdx = raw.search(/Notable Guests/i);
  if (notableIdx >= 0) {
    raw = raw.substring(0, notableIdx).trim();
  }

  // Also strip any remaining "Name Server | X Covers | ..." patterns
  raw = raw.replace(/(?:Visa Cardholder|Valued Customer|Customer \d+|[A-Z][a-z]+ [A-Z][a-z]+)\s+\w[\w\s]*?Server\s*\|[\s\S]*?(?=\n[A-Z]|\n\n|$)/gi, '');

  return raw.trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Lightspeed Parser ──────────────────────────────────────────────

/**
 * Extract property name from Lightspeed email subject.
 * "Daily Digest for Delilah Hollywood for Thursday, March 13, 2026"
 */
function parsePropertyName(subject: string): string {
  const match = subject.match(/Daily Digest for (.+?) for/i);
  if (match) return match[1].trim();

  const match2 = subject.match(/Summary for (.+?) -/i);
  if (match2) return match2[1].trim();

  // End of Day format
  const match3 = subject.match(/End of Day.*?for (.+?)(?:\s+for|\s*$)/i);
  if (match3) return match3[1].trim();

  return '';
}

/**
 * Parse a Lightspeed Daily Digest or End of Day email.
 * Extracts manager notes sections.
 */
export function parseLightspeedDigest(
  html: string,
  subject: string
): ParsedManagerNotes | null {
  const venueName = parsePropertyName(subject);
  if (!venueName) return null;

  const text = stripHtml(html);
  const sections: Record<string, string> = {};

  // Section headers and their stop patterns
  const sectionDefs: Array<{ key: string; patterns: RegExp[] }> = [
    {
      key: 'cover_count',
      patterns: [/COVER COUNT:?\s*\n+([\s\S]*?)(?=PEOPLE WE KNOW|OPERATIONAL? NOTES|SPENDERS OVER|KITCHEN NOTES|OTHER NOTES|See server|See menu|See all|Need Help|Last 5|Quantity|Discounts|Labor|$)/i],
    },
    {
      key: 'people_we_know',
      patterns: [/PEOPLE WE KNOW:?\s*\n+([\s\S]*?)(?=OPERATIONAL? NOTES|SPENDERS OVER|KITCHEN NOTES|OTHER NOTES|See server|See menu|See all|Need Help|Last 5|Quantity|Discounts|Labor|$)/i],
    },
    {
      key: 'operational_notes',
      patterns: [
        /OPERATIONAL NOTES:?\s*\n+([\s\S]*?)(?=SPENDERS OVER|KITCHEN NOTES|OTHER NOTES|See server|See menu|See all|Need Help|Last 5|Quantity|Discounts|Labor|$)/i,
        /OPERATION NOTES:?\s*\n+([\s\S]*?)(?=SPENDERS OVER|KITCHEN NOTES|OTHER NOTES|See server|See menu|See all|Need Help|Last 5|Quantity|Discounts|Labor|$)/i,
      ],
    },
    {
      key: 'spenders_over_5k',
      patterns: [/SPENDERS OVER 5K:?\s*\n+([\s\S]*?)(?=SPENDERS OVER 3K|PEOPLE WE KNOW|KITCHEN NOTES|OTHER NOTES|See server|See menu|See all|Need Help|$)/i],
    },
    {
      key: 'spenders_over_3k',
      patterns: [/SPENDERS OVER 3K:?\s*\n+([\s\S]*?)(?=SPENDERS OVER 2K|PEOPLE WE KNOW|KITCHEN NOTES|OTHER NOTES|See server|See menu|See all|Need Help|$)/i],
    },
    {
      key: 'spenders_over_2k',
      patterns: [/SPENDERS OVER 2K:?\s*\n+([\s\S]*?)(?=PEOPLE WE KNOW|KITCHEN NOTES|OTHER NOTES|See server|See menu|See all|Need Help|$)/i],
    },
    {
      key: 'kitchen_notes',
      patterns: [/KITCHEN NOTES:?\s*\n+([\s\S]*?)(?=OTHER NOTES|See server|See menu|See all|Need Help|Last 5|Quantity|$)/i],
    },
    {
      key: 'other_notes',
      patterns: [/OTHER NOTES:?\s*\n+([\s\S]*?)(?=See server|See menu|See all|Need Help|Last 5|Quantity|$)/i],
    },
  ];

  // First pass: extract raw text for each section to detect staff signatures
  const rawExtracts: Array<{ key: string; raw: string }> = [];
  for (const def of sectionDefs) {
    for (const pattern of def.patterns) {
      const match = text.match(pattern);
      if (match) {
        rawExtracts.push({ key: def.key, raw: match[1] });
        break;
      }
    }
  }

  // Detect staff names across all sections
  const allLines = rawExtracts.flatMap((e) =>
    e.raw.split('\n').map((l) => l.trim()).filter(Boolean)
  );

  // High-confidence detections (2+ spaces or standalone line)
  const staffNames = detectStaffSignatures(allLines);

  // Lower-confidence: names at end of lines (even single space)
  // Only confirmed if they appear in 2+ sections
  const possibleNames = detectPossibleStaffNames(allLines);

  // Count how many sections each name appears in
  const nameCountMap = new Map<string, number>();
  const allCandidates = new Set([...staffNames, ...possibleNames]);
  for (const name of allCandidates) {
    let count = 0;
    for (const e of rawExtracts) {
      if (e.raw.includes(name)) count++;
    }
    nameCountMap.set(name, count);
  }

  // Confirmed staff: high-confidence names in 2+ sections,
  // OR possible names in 3+ sections
  const confirmedStaff = new Set<string>();
  for (const [name, count] of nameCountMap) {
    if (staffNames.has(name) && count >= 2) confirmedStaff.add(name);
    else if (possibleNames.has(name) && count >= 3) confirmedStaff.add(name);
  }
  // If no multi-section names found, fall back to high-confidence signatures
  const staffToStrip = confirmedStaff.size > 0 ? confirmedStaff : staffNames;

  // Second pass: clean each section with staff names removed
  for (const { key, raw } of rawExtracts) {
    let processedRaw = raw;

    // For cover_count: strip the "Notable Guests" server check detail block.
    // This block contains lines like "ServerName Server | X Covers | $Y Payment | Z% Tip | ..."
    // and item listings like "Don Julio 1942, Casamigos Reposado (+7)".
    // Keep only the leading cover number and any non-check text.
    if (key === 'cover_count') {
      processedRaw = stripServerCheckDetails(raw);
    }

    // For spenders_over_* and other_notes: strip "N/A" entries with staff names
    // The pattern is typically "N/A ServerName1, ServerName2, ServerName3"
    if (key.startsWith('spenders_over_') || key === 'other_notes') {
      // Remove "SPENDERS OVER XK N/A ..." blocks that leaked into other_notes
      processedRaw = processedRaw.replace(/SPENDERS OVER \d+K\s*N\/?A\s*[\w\s,]*/gi, '').trim();
      // If starts with N/A, it means no notable spenders — just staff names filling the field
      if (/^\s*N\/?A\b/i.test(processedRaw)) {
        continue; // Skip this section entirely
      }
    }

    const cleaned = cleanNotes(processedRaw, staffToStrip);
    if (cleaned) {
      sections[key] = cleaned;
    }
  }

  if (Object.keys(sections).length === 0) return null;

  return {
    format: 'lightspeed',
    venueName,
    sections,
  };
}

// ── Wynn / Delilah Vegas Parser ────────────────────────────────────

/**
 * Parse a Wynn DAILY SHIFT REPORT email (Delilah Vegas format).
 * Different structure: Notes, VIPs, Manager name.
 */
export function parseWynnShiftReport(
  html: string,
  subject: string
): ParsedManagerNotes | null {
  const isBrunch = /BRUNCH/i.test(subject);
  const text = stripHtml(html);
  const sections: Record<string, string> = {};

  // Revenue
  let revenueMatch = text.match(/Today.?s Revenue:?\s*\$([0-9,]+)/i);
  if (!revenueMatch) {
    revenueMatch = text.match(/TODAY.?S REVENUE\s*\n\s*\$([0-9,]+)/);
  }
  if (revenueMatch) {
    sections.revenue = `$${revenueMatch[1]}`;
  }

  // Covers
  let coversMatch = text.match(/Covers:?\s*(\d+)/i);
  if (!coversMatch) {
    coversMatch = text.match(/COVERS\s*\n\s*(\d+)/);
  }
  if (coversMatch) {
    sections.covers = coversMatch[1];
  }

  // Notes
  const notesMatch = text.match(
    /Notes:\s*([\s\S]*?)(?=VIPS?:|Best,|[A-Z\s]+\nMgr\s*-|$)/i
  );
  if (notesMatch) {
    const cleaned = notesMatch[1].trim().replace(/\s+/g, ' ');
    if (cleaned.length > 10) {
      sections[isBrunch ? 'brunch_notes' : 'operational_notes'] = cleaned;
    }
  }

  // VIPs — stop at Notes:, Best, manager signature, or OPERATIONAL
  const vipsMatch = text.match(
    /VIPS?:\s*([\s\S]*?)(?=Notes:|OPERATIONAL|Best,|[A-Z\s]+\nMgr\s*-|WYNN|$)/i
  );
  if (vipsMatch) {
    let vips = vipsMatch[1].trim().replace(/\s+/g, ' ');
    // Remove trailing manager name if captured
    vips = vips.replace(/\s+([A-Z]{2,}\s+[A-Z]{2,})\s*$/, '');
    if (vips.length > 3) {
      sections.people_we_know = vips;
    }
  }

  // Manager name
  const managerMatch = text.match(
    /Best,\s*\n+([A-Z\s]+)\s*\n+Mgr/s
  );
  if (managerMatch) {
    sections.manager = managerMatch[1].trim().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, ' ');
  }

  if (Object.keys(sections).length === 0) return null;

  return {
    format: 'wynn',
    venueName: isBrunch ? 'Delilah Las Vegas' : 'Delilah Las Vegas',
    sections,
  };
}
