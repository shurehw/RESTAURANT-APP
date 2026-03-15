/**
 * Generate KevaOS PWA icons from SVG template.
 * Uses sharp to render SVG → PNG at 192 and 512 sizes.
 */

import sharp from 'sharp';
import { writeFileSync } from 'fs';

const BRASS = '#D4622B';
const BG = '#1C1917'; // keva-slate-900

function makeSvg(size) {
  // K mark centered with "KevaOS" text below
  // Scale everything relative to size
  const padding = Math.round(size * 0.15);
  const markW = Math.round(size * 0.35);
  const markH = Math.round(markW * 58 / 52);
  const markX = Math.round((size - markW) / 2);
  const markY = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.14);
  const textY = markY + markH + Math.round(size * 0.12);
  const osFontSize = Math.round(fontSize * 0.85);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="${BG}"/>
  <g transform="translate(${markX}, ${markY})">
    <rect x="0" y="0" width="${Math.round(markW * 12/52)}" height="${markH}" rx="${Math.round(markW * 2/52)}" fill="${BRASS}"/>
    <polygon points="${Math.round(markW*12/52)},${Math.round(markH*18/58)} ${markW},0 ${markW},${Math.round(markH*12/58)} ${Math.round(markW*12/52)},${Math.round(markH*30/58)}" fill="${BRASS}"/>
    <polygon points="${Math.round(markW*12/52)},${Math.round(markH*34/58)} ${markW},${Math.round(markH*46/58)} ${markW},${markH} ${Math.round(markW*12/52)},${Math.round(markH*40/58)}" fill="${BRASS}"/>
  </g>
  <text x="${size/2}" y="${textY}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="${fontSize}" fill="#F5F1EB" font-weight="600" letter-spacing="0.02em">Keva<tspan fill="rgba(245,241,235,0.55)" font-weight="400" font-size="${osFontSize}" letter-spacing="0.04em">OS</tspan></text>
</svg>`;
}

async function generate() {
  for (const size of [192, 512]) {
    const svg = makeSvg(size);
    const pngBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();
    const outPath = `public/icons/kevaos-${size}.png`;
    writeFileSync(outPath, pngBuffer);
    console.log(`✓ ${outPath} (${pngBuffer.length} bytes)`);
  }
}

generate().catch(console.error);
