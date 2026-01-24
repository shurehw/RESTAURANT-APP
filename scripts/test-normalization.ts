function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,\.']/g, '') // Remove commas, periods, and apostrophes
    .replace(/\s+/g, ' ')
    .trim();
}

const testNames = [
  "Spec's Wine, Spirits & Finer Foods",
  "Southern Glazer's of TX",
  "Spec's Liquors",
];

console.log('Normalization test:\n');
testNames.forEach(name => {
  const normalized = normalizeVendorName(name);
  console.log(`"${name}"`);
  console.log(`  → "${normalized}"\n`);
});
