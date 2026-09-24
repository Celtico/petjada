// Genera icones PWA, favicon, cover i splash iOS a partir de apps/web/public/logo.svg.
// Ús: node scripts/generate-assets.mjs  (o `pnpm icons` des de l'arrel)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'apps/web/public');

const BG = '#F7F9F8';
// Fons de nit (tema per defecte de l'app) per als splash d'iOS.
const SPLASH_BG = '#0B1714';
const PRIMARY = '#1F8A70';

const logoSvg = await readFile(path.join(PUBLIC, 'logo.svg'), 'utf8');
const coverSvg = await readFile(path.join(PUBLIC, 'cover.svg'), 'utf8');

// Variant clara del logo per als maskable (petjada blanca sobre verd).
const maskableSvg = logoSvg
  .replaceAll('stop-color="#1F8A70"', 'stop-color="#FFFFFF"')
  .replaceAll('stop-color="#146B56"', 'stop-color="#E6F4F0"')
  .replaceAll('fill="#E6F4F0"', 'fill="#1F8A70"')
  .replaceAll('fill="#146B56"', 'fill="#FFFFFF"');

const generated = [];

async function out(rel, pipeline) {
  const file = path.join(PUBLIC, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await pipeline.toFile(file);
  const meta = await sharp(file).metadata();
  generated.push(`${rel} (${meta.width}×${meta.height})`);
}

function svgBuffer(svg, size) {
  return sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer();
}

async function logoOnBackground(rel, size, { svg = logoSvg, bg = BG, scale = 0.88, alpha = false } = {}) {
  const logoSize = Math.round(size * scale);
  const logo = await svgBuffer(svg, logoSize);
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: alpha ? { r: 0, g: 0, b: 0, alpha: 0 } : bg,
    },
  }).composite([{ input: logo, gravity: 'centre' }]);
  await out(rel, alpha ? base.png() : base.flatten({ background: bg }).png());
}

// Icones estàndard
await logoOnBackground('icons/icon-192.png', 192);
await logoOnBackground('icons/icon-512.png', 512);
// Maskable: fons primary ple, logo dins de la zona segura
await logoOnBackground('icons/maskable-192.png', 192, { svg: maskableSvg, bg: PRIMARY, scale: 0.6 });
await logoOnBackground('icons/maskable-512.png', 512, { svg: maskableSvg, bg: PRIMARY, scale: 0.6 });
// Apple touch icon
await logoOnBackground('apple-touch-icon.png', 180);
// Favicons
await logoOnBackground('favicon-32.png', 32, { scale: 1, alpha: true });
await logoOnBackground('favicon-16.png', 16, { scale: 1, alpha: true });

// Cover Open Graph
await out('cover.png', sharp(Buffer.from(coverSvg), { density: 150 }).resize(1200, 630).png());

// Splash iOS
const SPLASHES = [
  { w: 750, h: 1334, dpr: 2 }, // SE 2/3, 8
  { w: 828, h: 1792, dpr: 2 }, // XR, 11
  { w: 1125, h: 2436, dpr: 3 }, // X, XS, 11 Pro
  { w: 1170, h: 2532, dpr: 3 }, // 12, 13, 14
  { w: 1179, h: 2556, dpr: 3 }, // 14 Pro, 15
  { w: 1284, h: 2778, dpr: 3 }, // 12/13 Pro Max
  { w: 1290, h: 2796, dpr: 3 }, // 14/15 Pro Max
];
const splashLinks = [];
for (const { w, h, dpr } of SPLASHES) {
  const rel = `splash/splash-${w}x${h}.png`;
  const logo = await svgBuffer(logoSvg, Math.round(w * 0.3));
  await out(
    rel,
    sharp({ create: { width: w, height: h, channels: 4, background: SPLASH_BG } })
      .composite([{ input: logo, gravity: 'centre' }])
      .flatten({ background: SPLASH_BG })
      .png(),
  );
  splashLinks.push({
    href: `/${rel}`,
    media: `(device-width: ${w / dpr}px) and (device-height: ${h / dpr}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
  });
}
await writeFile(path.join(PUBLIC, 'splash/splash.json'), JSON.stringify(splashLinks, null, 2) + '\n');
generated.push('splash/splash.json');

console.log('Actius generats a apps/web/public/:');
for (const g of generated) console.log('  -', g);
