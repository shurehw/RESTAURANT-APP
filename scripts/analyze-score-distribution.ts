import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('dev-output.unmatched-lines.grouped.json', 'utf8'));
const scores = data.groups.map((g: any) => g.suggestions?.[0]?.score || 0).sort((a: number, b: number) => b - a);
const buckets: Record<string, number> = { '0.9+': 0, '0.8-0.9': 0, '0.7-0.8': 0, '0.6-0.7': 0, '0.5-0.6': 0, '<0.5': 0, 'no_suggestions': 0 };
for (const s of scores) {
  if (s === 0) buckets['no_suggestions']++;
  else if (s >= 0.9) buckets['0.9+']++;
  else if (s >= 0.8) buckets['0.8-0.9']++;
  else if (s >= 0.7) buckets['0.7-0.8']++;
  else if (s >= 0.6) buckets['0.6-0.7']++;
  else if (s >= 0.5) buckets['0.5-0.6']++;
  else buckets['<0.5']++;
}
console.log('Top-1 suggestion score distribution:');
console.log(JSON.stringify(buckets, null, 2));
console.log('Total groups:', scores.length);
console.log('Groups with score >= 0.7:', buckets['0.9+'] + buckets['0.8-0.9'] + buckets['0.7-0.8']);
console.log('Groups with score >= 0.8:', buckets['0.9+'] + buckets['0.8-0.9']);

// Show high-score examples
console.log('\nGroups with score >= 0.6:');
const highScore = data.groups.filter((g: any) => g.suggestions?.[0]?.score >= 0.6);
for (const g of highScore) {
  console.log(`---`);
  console.log(`Line: ${g.exampleDescription}`);
  console.log(`Best match: ${g.suggestions[0].name} (score: ${g.suggestions[0].score})`);
  console.log(`Count: ${g.count}`);
}
