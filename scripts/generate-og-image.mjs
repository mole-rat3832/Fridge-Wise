// Generates the social sharing image (Open Graph / Twitter card), 1200x630:
//
//   npm run og
//
// Writes public/og-image.png from fridgewise-logo.png. The result is committed, so builds do not
// depend on the fonts installed on the build machine (text is rendered with Inter if present,
// otherwise the system sans-serif).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const logoPath = ['fridgewise-logo.png', 'public/fridgewise-logo.png'].map((p) => path.join(ROOT, p)).find((p) => fs.existsSync(p));
if (!logoPath) {
  console.error('fridgewise-logo.png not found in the repo root.');
  process.exit(1);
}

const W = 1200;
const H = 630;
const TILE = 380;
const TILE_X = 72;
const TILE_Y = (H - TILE) / 2;

const font = "Inter, 'Inter Display', 'DejaVu Sans', Arial, sans-serif";
const background = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#545454"/>
      <stop offset="1" stop-color="#3E4346"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${TILE_X}" y="${TILE_Y}" width="${TILE}" height="${TILE}" rx="64" fill="#CBFF4D"/>
  <rect x="0" y="${H - 14}" width="${W}" height="14" fill="#6BAA75"/>
  <text x="506" y="272" font-family="${font}" font-size="92" font-weight="800" fill="#FFFFFF" letter-spacing="-2">FridgeWise</text>
  <text x="508" y="340" font-family="${font}" font-size="34" font-weight="600" fill="#CBFF4D">Use your food before it goes bad.</text>
  <text x="508" y="402" font-family="${font}" font-size="26" font-weight="500" fill="#EEF1EC">Scan receipts · Get reminders · Cook what you have</text>
</svg>`;

const logo = await sharp(fs.readFileSync(logoPath)).ensureAlpha().trim().resize(Math.round(TILE * 0.86), Math.round(TILE * 0.86), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const meta = await sharp(logo).metadata();

const out = path.join(ROOT, 'public', 'og-image.png');
await sharp(Buffer.from(background))
  .composite([{ input: logo, left: Math.round(TILE_X + (TILE - meta.width) / 2), top: Math.round(TILE_Y + (TILE - meta.height) / 2) }])
  .flatten({ background: '#545454' })
  .png({ compressionLevel: 9, palette: true, quality: 90 })
  .toFile(out);

console.log(`Wrote ${path.relative(ROOT, out)} (${W}x${H}).`);
