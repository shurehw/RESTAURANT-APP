import * as fs from 'fs';
const lines = fs.readFileSync('R365_VENDOR_ITEMS.csv','utf-8').split('\n').slice(1).filter(l=>l.trim());
let empty=0, filled=0;
lines.forEach(l=>{
  const m = l.match(/^"[^"]*","([^"]*)"/);
  if(m && m[1]==='') empty++;
  else filled++;
});
console.log('With vendor name:', filled, '(' + ((filled/lines.length)*100).toFixed(1) + '%)');
console.log('Empty vendor name:', empty, '(' + ((empty/lines.length)*100).toFixed(1) + '%)');
console.log('Total:', lines.length);
