// Genera les imatges WebP dels objectes capturables, el símbol d'alineació i la petjada del rastre.
// Ús: node scripts/generate-objects.mjs  (o `pnpm icons` des de l'arrel)
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps/web/public/objects');

const ACCENT = '#F5A623';
const ACCENT_LIGHT = '#FFD27A';
const PRIMARY = '#1F8A70';
const PRIMARY_DARK = '#146B56';
const PRIMARY_LIGHT = '#E6F4F0';
const EDGE = '#8A5A12';
const BROWN = '#7A4E24';
const BROWN_LIGHT = '#B07A3C';

const defs = `
  <defs>
    <linearGradient id="warm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ACCENT_LIGHT}"/><stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
    <linearGradient id="warmSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT_LIGHT}"/><stop offset="1" stop-color="${ACCENT}"/>
    </linearGradient>
    <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PRIMARY}"/><stop offset="1" stop-color="${PRIMARY_DARK}"/>
    </linearGradient>
    <linearGradient id="brown" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BROWN_LIGHT}"/><stop offset="1" stop-color="${BROWN}"/>
    </linearGradient>
  </defs>`;

const wrap = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">${defs}${body}</svg>`;

const OBJECTS = {
  // Gla: cúpula marró amb textura i cos taronja
  gla: wrap(`
    <path d="M128 92c-42 0-64 24-62 60 2 34 26 66 62 78 36-12 60-44 62-78 2-36-20-60-62-60z" fill="url(#warm)" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M60 104c0-36 30-58 68-58s68 22 68 58c0 8-6 12-14 12H74c-8 0-14-4-14-12z" fill="url(#brown)" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>
    <g stroke="${EDGE}" stroke-opacity="0.45" stroke-width="4" fill="none" stroke-linecap="round">
      <path d="M78 96l14-22M104 92l10-30M128 90V60M152 92l-10-30M178 96l-14-22"/>
    </g>
    <rect x="121" y="24" width="14" height="26" rx="7" fill="url(#brown)" stroke="${EDGE}" stroke-width="5"/>
    <path d="M100 130c-6 20-4 40 4 56" stroke="#FFF" stroke-opacity="0.5" stroke-width="6" fill="none" stroke-linecap="round"/>
  `),
  // Fulla: fulla de tardor taronja amb nervis verds
  fulla: wrap(`
    <path d="M128 24c60 34 92 88 74 150-10 34-40 58-74 60-34-2-64-26-74-60C36 112 68 58 128 24z" fill="url(#warm)" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M128 40v190" stroke="${PRIMARY_DARK}" stroke-width="6" stroke-linecap="round"/>
    <g stroke="${PRIMARY}" stroke-width="5" fill="none" stroke-linecap="round">
      <path d="M128 84l-38 26M128 84l38 26M128 124l-46 30M128 124l46 30M128 164l-36 26M128 164l36 26"/>
    </g>
    <path d="M128 226v18" stroke="${EDGE}" stroke-width="8" stroke-linecap="round"/>
  `),
  // Bolet: barret taronja amb pics clars, peu crema
  bolet: wrap(`
    <path d="M100 150h56v56c0 18-12 30-28 30s-28-12-28-30z" fill="#FFF3D6" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M32 140c0-64 44-110 96-110s96 46 96 110c0 10-6 16-16 16H48c-10 0-16-6-16-16z" fill="url(#warm)" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>
    <g fill="#FFF3D6" stroke="${EDGE}" stroke-width="3">
      <circle cx="84" cy="96" r="14"/><circle cx="140" cy="66" r="12"/><circle cx="176" cy="110" r="16"/><circle cx="120" cy="124" r="9"/>
    </g>
    <path d="M52 140h152" stroke="${EDGE}" stroke-opacity="0.5" stroke-width="4"/>
  `),
  // Ploma: ploma daurada amb canya verda
  ploma: wrap(`
    <path d="M196 34c-70 8-128 76-142 176 60-8 122-70 142-176z" fill="url(#warmSide)" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M196 34C150 90 110 150 62 224" stroke="${PRIMARY_DARK}" stroke-width="6" stroke-linecap="round" fill="none"/>
    <g stroke="${EDGE}" stroke-opacity="0.45" stroke-width="3" fill="none" stroke-linecap="round">
      <path d="M170 74l-40 6M160 98l-42 10M148 122l-42 14M134 146l-40 18M120 170l-36 22"/>
    </g>
    <path d="M62 224l-14 14" stroke="${PRIMARY_DARK}" stroke-width="8" stroke-linecap="round"/>
  `),
  // Pedra: còdol ambre amb facetes
  pedra: wrap(`
    <path d="M52 152c-14-50 26-104 82-108 52-4 96 34 96 88 0 46-40 80-92 80-46 0-76-24-86-60z" fill="url(#warm)" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M98 74c30 10 52 40 60 76" stroke="#FFF" stroke-opacity="0.55" stroke-width="7" fill="none" stroke-linecap="round"/>
    <g fill="${EDGE}" fill-opacity="0.25">
      <ellipse cx="86" cy="150" rx="18" ry="10"/><ellipse cx="160" cy="176" rx="14" ry="8"/><circle cx="184" cy="120" r="8"/>
    </g>
    <path d="M60 170c20 14 60 24 120 10" stroke="${EDGE}" stroke-opacity="0.4" stroke-width="4" fill="none" stroke-linecap="round"/>
  `),
  // Estel: estrella de cinc puntes amb brillantors
  estel: wrap(`
    <path d="M128 22l30 66 72 8-54 48 16 72-64-38-64 38 16-72-54-48 72-8z" fill="url(#warm)" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M128 22l30 66 72 8-102 22z" fill="#FFF" fill-opacity="0.28"/>
    <g fill="${PRIMARY_LIGHT}" stroke="${PRIMARY}" stroke-width="3">
      <path d="M212 30l5 12 12 5-12 5-5 12-5-12-12-5 12-5z"/>
      <path d="M40 200l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/>
    </g>
  `),
  // Petxina: pectínid amb costelles
  petxina: wrap(`
    <path d="M128 232C70 232 28 186 28 126c0-30 18-50 40-50 10 0 18 6 22 14 8-30 22-52 38-52s30 22 38 52c4-8 12-14 22-14 22 0 40 20 40 50 0 60-42 106-100 106z" fill="url(#warm)" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>
    <g stroke="${EDGE}" stroke-opacity="0.5" stroke-width="4" fill="none" stroke-linecap="round">
      <path d="M128 232L60 110M128 232L92 88M128 232V60M128 232l36-144M128 232l68-122"/>
    </g>
    <path d="M100 210c-20-10-36-30-42-56" stroke="#FFF" stroke-opacity="0.5" stroke-width="6" fill="none" stroke-linecap="round"/>
  `),
  // Cristall: gemma poligonal amb facetes verdes i taronges
  cristall: wrap(`
    <path d="M128 18l54 44 24 70-40 96H90L50 132l24-70z" fill="url(#warm)" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M128 18l-54 44 54 30zM128 18l54 44-54 30z" fill="#FFF" fill-opacity="0.35"/>
    <path d="M74 62l-24 70 78-40zM182 62l24 70-78-40z" fill="${PRIMARY}" fill-opacity="0.35"/>
    <path d="M50 132l40 96 38-136zM206 132l-40 96-38-136z" fill="${EDGE}" fill-opacity="0.22"/>
    <path d="M90 228h76l-38-136z" fill="${PRIMARY_LIGHT}" fill-opacity="0.3"/>
    <g stroke="${EDGE}" stroke-opacity="0.6" stroke-width="3" fill="none" stroke-linejoin="round">
      <path d="M74 62l54 30 54-30M50 132l78-40 78 40M90 228l38-136 38 136"/>
    </g>
  `),
};

// Símbol d'alineació del mode càmera: anella amb fletxa, semitransparent.
const SYMBOL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <circle cx="128" cy="128" r="96" fill="${PRIMARY_LIGHT}" fill-opacity="0.35" stroke="${PRIMARY}" stroke-width="12"/>
  <circle cx="128" cy="128" r="60" fill="none" stroke="${PRIMARY}" stroke-width="6" stroke-opacity="0.7" stroke-dasharray="14 12"/>
  <path d="M128 44l22 40h-44z" fill="${PRIMARY}"/>
  <circle cx="128" cy="128" r="12" fill="${PRIMARY}"/>
  <g stroke="${PRIMARY}" stroke-width="8" stroke-linecap="round">
    <path d="M128 200v28M56 128H28M228 128h-28"/>
  </g>
</svg>`;

// Petjada per al rastre al mapa (apunta cap amunt = nord).
const FOOTPRINT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <g fill="${PRIMARY}">
    <path d="M32 26c-9 0-15 7-15 16 0 7 4 12 5 17 0 4 4 6 10 6s10-2 10-6c1-5 5-10 5-17 0-9-6-16-15-16z"/>
    <ellipse cx="20" cy="20" rx="3.5" ry="4.5" transform="rotate(-18 20 20)"/>
    <ellipse cx="26.5" cy="15" rx="3.3" ry="4.3" transform="rotate(-8 26.5 15)"/>
    <ellipse cx="33.5" cy="13" rx="3.3" ry="4.3"/>
    <ellipse cx="40" cy="15" rx="3" ry="3.9" transform="rotate(8 40 15)"/>
    <ellipse cx="45.5" cy="20.5" rx="2.8" ry="3.5" transform="rotate(18 45.5 20.5)"/>
  </g>
</svg>`;

await mkdir(OUT, { recursive: true });

async function webp(name, svg, size) {
  const file = path.join(OUT, `${name}.webp`);
  await sharp(Buffer.from(svg), { density: 300 })
    .resize(size, size)
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(file);
  const meta = await sharp(file).metadata();
  console.log(`  - objects/${name}.webp (${meta.width}×${meta.height}, alpha=${meta.hasAlpha})`);
}

console.log('Objectes generats a apps/web/public/objects/:');
for (const [name, svg] of Object.entries(OBJECTS)) await webp(name, svg, 256);
await webp('symbol', SYMBOL, 256);
await webp('footprint', FOOTPRINT, 64);
