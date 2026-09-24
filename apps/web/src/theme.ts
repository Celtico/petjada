import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

/**
 * Tema de Petjada per a Chakra UI v3. Tots els colors de l'app surten d'aquí:
 * `colorPalette="brand"` (verd natura) i `colorPalette="accent"` (taronja càlid
 * dels objectes). Cap color literal als components.
 */
const config = defineConfig({
  globalCss: {
    'html, body, #root': { height: '100%' },
    body: {
      margin: 0,
      bg: 'bg',
      color: 'fg',
      overscrollBehavior: 'none',
      WebkitTapHighlightColor: 'transparent',
      textSizeAdjust: '100%',
    },
    // Evita el zoom automàtic d'iOS en enfocar un camp (< 16px el dispara).
    'input, select, textarea': { fontSize: '16px' },
  },
  theme: {
    tokens: {
      colors: {
        brand: {
          50: { value: '#E6F4F0' },
          100: { value: '#C6E6DC' },
          200: { value: '#9BD3C2' },
          300: { value: '#6FBEA6' },
          400: { value: '#45A88B' },
          500: { value: '#2B9A7C' },
          600: { value: '#1F8A70' },
          700: { value: '#146B56' },
          800: { value: '#0F5040' },
          900: { value: '#0A362B' },
        },
        accent: {
          50: { value: '#FFF6E5' },
          100: { value: '#FFEAC2' },
          200: { value: '#FFDE9C' },
          300: { value: '#FFD27A' },
          400: { value: '#FABB4A' },
          500: { value: '#F5A623' },
          600: { value: '#D98C12' },
          700: { value: '#B0700C' },
          800: { value: '#85540A' },
          900: { value: '#5C3A07' },
        },
        petjada: {
          bg: { value: '#F7F9F8' },
          surface: { value: '#FFFFFF' },
          text: { value: '#16302B' },
          muted: { value: '#5F7A73' },
          danger: { value: '#D64545' },
          // Tema de nit (per defecte): verds molt foscos, text clar.
          nightBg: { value: '#0B1714' },
          nightSurface: { value: '#13241F' },
          nightRaised: { value: '#1B3029' },
          nightText: { value: '#E4EFEB' },
          nightMuted: { value: '#8FA9A1' },
          nightDanger: { value: '#F07A7A' },
        },
      },
      fonts: {
        heading: { value: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
        body: { value: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
      },
      spacing: {
        safeTop: { value: 'env(safe-area-inset-top, 0px)' },
        safeBottom: { value: 'env(safe-area-inset-bottom, 0px)' },
      },
    },
    semanticTokens: {
      colors: {
        // Cada token té valor de dia (`base`) i de nit (`_dark`). L'app arrenca en nit.
        bg: {
          DEFAULT: { value: { base: '{colors.petjada.bg}', _dark: '{colors.petjada.nightBg}' } },
          panel: { value: { base: '{colors.petjada.surface}', _dark: '{colors.petjada.nightSurface}' } },
          subtle: { value: { base: '{colors.brand.50}', _dark: '{colors.petjada.nightRaised}' } },
          muted: { value: { base: '{colors.brand.100}', _dark: '{colors.brand.900}' } },
        },
        fg: {
          DEFAULT: { value: { base: '{colors.petjada.text}', _dark: '{colors.petjada.nightText}' } },
          muted: { value: { base: '{colors.petjada.muted}', _dark: '{colors.petjada.nightMuted}' } },
          subtle: { value: { base: '{colors.brand.700}', _dark: '{colors.brand.200}' } },
          error: { value: { base: '{colors.petjada.danger}', _dark: '{colors.petjada.nightDanger}' } },
        },
        border: {
          DEFAULT: { value: { base: '{colors.brand.100}', _dark: '{colors.brand.800}' } },
          subtle: { value: { base: '{colors.brand.50}', _dark: '{colors.brand.900}' } },
          muted: { value: { base: '{colors.brand.200}', _dark: '{colors.brand.700}' } },
        },
        brand: {
          solid: { value: { base: '{colors.brand.600}', _dark: '{colors.brand.500}' } },
          contrast: { value: 'white' },
          fg: { value: { base: '{colors.brand.700}', _dark: '{colors.brand.300}' } },
          muted: { value: { base: '{colors.brand.100}', _dark: '{colors.brand.800}' } },
          subtle: { value: { base: '{colors.brand.50}', _dark: '{colors.brand.900}' } },
          emphasized: { value: { base: '{colors.brand.200}', _dark: '{colors.brand.700}' } },
          focusRing: { value: { base: '{colors.brand.500}', _dark: '{colors.brand.400}' } },
        },
        accent: {
          solid: { value: '{colors.accent.500}' },
          contrast: { value: '{colors.petjada.text}' },
          fg: { value: { base: '{colors.accent.700}', _dark: '{colors.accent.300}' } },
          muted: { value: { base: '{colors.accent.100}', _dark: '{colors.accent.800}' } },
          subtle: { value: { base: '{colors.accent.50}', _dark: '{colors.accent.900}' } },
          emphasized: { value: { base: '{colors.accent.200}', _dark: '{colors.accent.700}' } },
          focusRing: { value: '{colors.accent.400}' },
        },
        red: {
          solid: { value: { base: '{colors.petjada.danger}', _dark: '{colors.petjada.nightDanger}' } },
          fg: { value: { base: '{colors.petjada.danger}', _dark: '{colors.petjada.nightDanger}' } },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
