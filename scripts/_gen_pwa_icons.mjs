/**
 * Generate Relay PWA icons from SVG template.
 * Uses sharp to render SVG → PNG at 192 and 512 sizes.
 *
 * Mark: E2 inductor coil — four half-circle bumps between terminals,
 * switch arm with contact point. "Relay" wordmark below.
 */

import sharp from 'sharp';
import { writeFileSync } from 'fs';

const BRASS = '#D4622B';
const BG = '#1C1917'; // keva-slate-900

function makeSvg(size) {
  // E2 inductor coil mark centered with "Relay" text below
  // The mark viewBox is 48x48, scale to fit ~40% of icon size
  const markSize = Math.round(size * 0.40);
  const scale = markSize / 48;
  const markX = Math.round((size - markSize) / 2);
  const markY = Math.round(size * 0.16);
  const fontSize = Math.round(size * 0.13);
  const textY = markY + markSize + Math.round(size * 0.10);
  const sw = (2.5 * scale).toFixed(1); // stroke width scaled
  const r1 = (3.5 * scale).toFixed(1); // terminal radius
  const r2 = (3 * scale).toFixed(1);   // contact radius
  const r3 = (2 * scale).toFixed(1);   // pivot radius

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="${BG}"/>
  <g transform="translate(${markX}, ${markY}) scale(${scale.toFixed(4)})">
    <!-- Top terminal -->
    <circle cx="10" cy="6" r="3.5" fill="${BRASS}"/>
    <!-- Wire to coil -->
    <line x1="10" y1="9.5" x2="10" y2="13" stroke="${BRASS}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Inductor bumps -->
    <path d="M10,13 C16,13 16,19 10,19 C16,19 16,25 10,25 C16,25 16,31 10,31 C16,31 16,37 10,37" fill="none" stroke="${BRASS}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Wire from coil -->
    <line x1="10" y1="37" x2="10" y2="38.5" stroke="${BRASS}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Bottom terminal -->
    <circle cx="10" cy="42" r="3.5" fill="${BRASS}"/>
    <!-- Switch arm -->
    <line x1="26" y1="36" x2="36" y2="14" stroke="${BRASS}" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Pivot -->
    <circle cx="26" cy="36" r="2" fill="${BRASS}" opacity="0.4"/>
    <!-- Contact -->
    <circle cx="37" cy="12" r="3" fill="${BRASS}"/>
  </g>
  <text x="${size/2}" y="${textY}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="${fontSize}" fill="#F5F1EB" font-weight="600" letter-spacing="0.02em">Relay</text>
</svg>`;
}

async function generate() {
  for (const size of [192, 512]) {
    const svg = makeSvg(size);
    const pngBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();
    const outPath = `public/icons/relay-${size}.png`;
    writeFileSync(outPath, pngBuffer);
    console.log(`✓ ${outPath} (${pngBuffer.length} bytes)`);
  }
}

generate().catch(console.error);
