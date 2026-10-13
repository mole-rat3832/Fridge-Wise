// Generates every app icon from the logo, unchanged: fridgewise-logo.png (1024x1024, transparent).
//
//   npm run icons        (also runs automatically before `npm run build`)
//
// Looks for the logo at ./fridgewise-logo.png or ./public/fridgewise-logo.png.
// Outputs (public/):
//   favicon.ico (16/32/48), icons/favicon-16.png, icons/favicon-32.png
//   icons/apple-touch-icon.png  180x180, solid palette background, safe padding
//   icons/pwa-192.png, icons/pwa-512.png  transparent ("any" purpose)
//   icons/pwa-maskable-512.png  solid palette background, logo inside the 80% safe zone
//   icons/badge-72.png  monochrome notification badge (Android)
//   brand/logo-128.png, brand/logo-512.png  in-app logo
// The solid background is the palette color with the best contrast against the logo,
// or set ICON_BG=#6BAA75 (any palette color) to choose it yourself.
// Without a logo file, neutral placeholder icons are written so the PWA still installs.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public');
const PALETTE = ['#545454', '#69747C', '#6BAA75', '#84DD63', '#CBFF4D'];

const logoPath = ['fridgewise-logo.png', 'public/fridgewise-logo.png'].map((p) => path.join(ROOT, p)).find((p) => fs.existsSync(p));

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="292" y="132" width="440" height="760" rx="72" fill="#545454"/>
  <rect x="292" y="392" width="440" height="22" fill="#FFFFFF" opacity="0.9"/>
  <rect x="362" y="232" width="22" height="96" rx="11" fill="#FFFFFF"/>
  <rect x="362" y="472" width="22" height="150" rx="11" fill="#FFFFFF"/>
  <path d="M612 520c-96 6-150 66-150 150 0 22 4 42 12 60 96-6 150-66 150-150 0-22-4-42-12-60z" fill="#84DD63"/>
</svg>`;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance([r, g, b]) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function loadLogo() {
  const input = logoPath ? fs.readFileSync(logoPath) : Buffer.from(PLACEHOLDER_SVG);
  // Trim transparent edges, then pad back to a square so nothing is distorted.
  const trimmed = await sharp(input, { density: 300 }).ensureAlpha().trim().png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const side = Math.max(meta.width, meta.height);
  return sharp(trimmed)
    .extend({
      top: Math.floor((side - meta.height) / 2),
      bottom: Math.ceil((side - meta.height) / 2),
      left: Math.floor((side - meta.width) / 2),
      right: Math.ceil((side - meta.width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function averageOpaqueColor(png) {
  const { data, info } = await sharp(png).resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] > 160) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [84, 84, 84];
}

/** Logo centred on a canvas with transparent or solid background; `scale` = logo size / canvas size. */
async function compose(logo, size, scale, background) {
  const inner = Math.round(size * scale);
  const resized = await sharp(logo).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const bg = background ? { ...Object.fromEntries(['r', 'g', 'b'].map((k, i) => [k, hexToRgb(background)[i]])), alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 };
  const img = sharp({ create: { width: size, height: size, channels: 4, background: bg } }).composite([{ input: resized, gravity: 'center' }]);
  return (background ? img.flatten({ background }) : img).png({ compressionLevel: 9 }).toBuffer();
}

function writeIco(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

async function main() {
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'brand'), { recursive: true });
  const logo = await loadLogo();

  const avg = await averageOpaqueColor(logo);
  const bg = process.env.ICON_BG && PALETTE.includes(process.env.ICON_BG.toUpperCase().replace(/^#?/, '#'))
    ? process.env.ICON_BG.toUpperCase().replace(/^#?/, '#')
    : PALETTE.reduce((best, c) => (contrast(hexToRgb(c), avg) > contrast(hexToRgb(best), avg) ? c : best), PALETTE[0]);

  const write = (rel, buf) => fs.writeFileSync(path.join(OUT, rel), buf);

  // Transparent icons keep the logo as-is with a little breathing room.
  write('icons/pwa-512.png', await compose(logo, 512, 0.9));
  write('icons/pwa-192.png', await compose(logo, 192, 0.9));
  write('brand/logo-512.png', await compose(logo, 512, 1));
  write('brand/logo-128.png', await compose(logo, 128, 1));
  write('icons/favicon-32.png', await compose(logo, 32, 1));
  write('icons/favicon-16.png', await compose(logo, 16, 1));

  // Solid backgrounds where transparency is not allowed.
  write('icons/apple-touch-icon.png', await compose(logo, 180, 0.76, bg));
  // Maskable: the visible area can be a circle of 80% diameter, so the logo stays within ~56%.
  write('icons/pwa-maskable-512.png', await compose(logo, 512, 0.56, bg));

  // Notification badge: Android uses only the alpha channel, so a white silhouette.
  const alpha = await sharp(await compose(logo, 72, 0.9)).extractChannel(3).toBuffer();
  const white = await sharp({ create: { width: 72, height: 72, channels: 3, background: '#ffffff' } }).joinChannel(alpha).png().toBuffer();
  write('icons/badge-72.png', white);

  const ico = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await compose(logo, size, 1) })));
  write('favicon.ico', writeIco(ico));

  if (logoPath) {
    console.log(`Icons generated from ${path.relative(ROOT, logoPath)} (solid background ${bg}).`);
  } else {
    console.warn('fridgewise-logo.png not found: wrote PLACEHOLDER icons. Add the logo to the repo root and run `npm run icons`.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
