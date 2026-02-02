/**
 * Analyze remaining unmatched lines to identify potential duplicates vs truly new items.
 */
import { readFileSync } from 'fs';

type Group = {
  vendorId: string;
  vendorName: string;
  exampleDescription: string;
  count: number;
  suggestions: Array<{
    itemId: string;
    name: string;
    score: number;
  }>;
};

const data = JSON.parse(readFileSync('dev-output.unmatched-lines.grouped.json', 'utf8'));
const groups: Group[] = data.groups;

console.log('='.repeat(100));
console.log('ANALYSIS OF REMAINING UNMATCHED LINES');
console.log('='.repeat(100));
console.log(`\nTotal: ${data.totals.unmatched_lines_considered} lines in ${groups.length} groups\n`);

// Categorize by best suggestion score
const buckets = {
  likely_match: [] as Group[],    // 50-69% - probably should map
  maybe_match: [] as Group[],     // 30-49% - review needed
  probably_new: [] as Group[],    // 1-29% - likely new item
  definitely_new: [] as Group[],  // 0% or no suggestion
};

for (const g of groups) {
  const score = g.suggestions[0]?.score || 0;
  if (score >= 0.5) buckets.likely_match.push(g);
  else if (score >= 0.3) buckets.maybe_match.push(g);
  else if (score > 0) buckets.probably_new.push(g);
  else buckets.definitely_new.push(g);
}

const lineCount = (arr: Group[]) => arr.reduce((sum, g) => sum + g.count, 0);

console.log('SUMMARY BY MATCH CONFIDENCE:\n');
console.log(`  Likely matches (50-69%):    ${buckets.likely_match.length} groups, ${lineCount(buckets.likely_match)} lines`);
console.log(`  Maybe matches (30-49%):     ${buckets.maybe_match.length} groups, ${lineCount(buckets.maybe_match)} lines`);
console.log(`  Probably new items (<30%):  ${buckets.probably_new.length} groups, ${lineCount(buckets.probably_new)} lines`);
console.log(`  Definitely new (no match):  ${buckets.definitely_new.length} groups, ${lineCount(buckets.definitely_new)} lines`);

// Show samples of "likely match" - these are the ones we should review
if (buckets.likely_match.length > 0) {
  console.log('\n' + '='.repeat(100));
  console.log('LIKELY MATCHES (50-69%) - REVIEW THESE FOR MAPPING:');
  console.log('='.repeat(100) + '\n');

  for (const g of buckets.likely_match.slice(0, 30)) {
    const s = g.suggestions[0];
    const scoreStr = Math.round(s.score * 100) + '%';
    console.log(`[${scoreStr}] "${g.exampleDescription}"`);
    console.log(`     => "${s.name}"`);
    console.log(`     Count: ${g.count} | Vendor: ${g.vendorName}`);
    console.log('');
  }
  if (buckets.likely_match.length > 30) {
    console.log(`... and ${buckets.likely_match.length - 30} more likely matches\n`);
  }
}

// Show samples of "maybe match" - worth a quick look
if (buckets.maybe_match.length > 0) {
  console.log('\n' + '='.repeat(100));
  console.log('MAYBE MATCHES (30-49%) - QUICK REVIEW:');
  console.log('='.repeat(100) + '\n');

  for (const g of buckets.maybe_match.slice(0, 20)) {
    const s = g.suggestions[0];
    const scoreStr = Math.round(s.score * 100) + '%';
    console.log(`[${scoreStr}] "${g.exampleDescription}"`);
    console.log(`     => "${s.name}"`);
    console.log(`     Count: ${g.count} | Vendor: ${g.vendorName}`);
    console.log('');
  }
  if (buckets.maybe_match.length > 20) {
    console.log(`... and ${buckets.maybe_match.length - 20} more maybe matches\n`);
  }
}

// Show samples of "definitely new"
if (buckets.definitely_new.length > 0) {
  console.log('\n' + '='.repeat(100));
  console.log('DEFINITELY NEW (no suggestions):');
  console.log('='.repeat(100) + '\n');

  for (const g of buckets.definitely_new.slice(0, 15)) {
    console.log(`"${g.exampleDescription}"`);
    console.log(`     Count: ${g.count} | Vendor: ${g.vendorName}`);
    console.log('');
  }
  if (buckets.definitely_new.length > 15) {
    console.log(`... and ${buckets.definitely_new.length - 15} more with no suggestions\n`);
  }
}

console.log('\n' + '='.repeat(100));
console.log('RECOMMENDATION:');
console.log('='.repeat(100));
console.log(`\n1. Review the ${buckets.likely_match.length} "likely match" groups (${lineCount(buckets.likely_match)} lines) - many are probably correct`);
console.log(`2. Spot-check the ${buckets.maybe_match.length} "maybe match" groups (${lineCount(buckets.maybe_match)} lines)`);
console.log(`3. The ${buckets.probably_new.length + buckets.definitely_new.length} remaining groups (${lineCount(buckets.probably_new) + lineCount(buckets.definitely_new)} lines) likely need new items\n`);
