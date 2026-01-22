const testCases = [
  "750ml",
  "700ml",
  "6 x 750ml",
  "24 x 8.4fl.oz",
  "0.5 x 1gal",
  "24 x 7.2fl.oz",
  "10fl.oz",
  "2.5gal",
  "1200each",
  "400each",
  "5 x 1(LB)"
];

for (const packSize of testCases) {
  // Match case format
  const packMatch = packSize.match(/^(\d+\.?\d*)\s*x\s*(\d+\.?\d*)(ml|l|oz|fl\.oz|gal|lb|kg|g|each|case|pack|quart)$/i);
  // Match single unit
  const singleMatch = packSize.match(/^(\d+\.?\d*)(ml|l|oz|fl\.oz|gal|lb|kg|g|each|case|pack|quart)$/i);

  if (packMatch) {
    console.log(`✓ "${packSize}" -> Pack: ${packMatch[1]} x ${packMatch[2]}${packMatch[3]}`);
  } else if (singleMatch) {
    console.log(`✓ "${packSize}" -> Single: ${singleMatch[1]}${singleMatch[2]}`);
  } else {
    console.log(`✗ "${packSize}" -> NO MATCH`);
  }
}
