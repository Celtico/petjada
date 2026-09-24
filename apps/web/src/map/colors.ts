/**
 * Colors del tema per a les capes de Mapbox (que necessiten valors resolts, no
 * variables CSS). Es llegeixen de les variables `--chakra-colors-*` que injecta
 * Chakra, de manera que el mapa segueix el tema sense colors literals. Els
 * tokens semàntics (p. ex. `bg.panel`) es resolen segons el tema actiu.
 */
const FALLBACKS: Record<string, string> = {
  'brand.600': '#1F8A70',
  'brand.700': '#146B56',
  'brand.50': '#E6F4F0',
  'accent.500': '#F5A623',
  'accent.300': '#FFD27A',
  'bg.panel': '#13241F',
  'petjada.surface': '#FFFFFF',
  'petjada.text': '#16302B',
};

export function themeColor(token: keyof typeof FALLBACKS | string): string {
  if (typeof document === 'undefined' || !document.body) return FALLBACKS[token] ?? '#000000';
  const name = `--chakra-colors-${token.replace(/\./g, '-')}`;
  // Un element temporal resol les variables encadenades (tokens semàntics) a rgb().
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return FALLBACKS[token] ?? '#000000';
  return resolved || raw;
}

/** `true` si l'app està en tema de nit (classe `dark` a <html>, vegeu theme-mode.ts). */
export function isNightTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}
