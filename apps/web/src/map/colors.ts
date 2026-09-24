/**
 * Colors del tema per a les capes de Mapbox (que necessiten valors resolts, no
 * variables CSS). Es llegeixen de les variables `--chakra-colors-*` que injecta
 * Chakra, de manera que el mapa segueix el tema sense colors literals.
 */
const FALLBACKS: Record<string, string> = {
  'brand.600': '#1F8A70',
  'brand.700': '#146B56',
  'brand.50': '#E6F4F0',
  'accent.500': '#F5A623',
  'accent.300': '#FFD27A',
  'petjada.surface': '#FFFFFF',
  'petjada.text': '#16302B',
};

export function themeColor(token: keyof typeof FALLBACKS | string): string {
  if (typeof document === 'undefined') return FALLBACKS[token] ?? '#000000';
  const name = `--chakra-colors-${token.replace(/\./g, '-')}`;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || FALLBACKS[token] || '#000000';
}
