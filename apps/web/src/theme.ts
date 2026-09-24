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
        bg: {
          DEFAULT: { value: '{colors.petjada.bg}' },
          panel: { value: '{colors.petjada.surface}' },
          subtle: { value: '{colors.brand.50}' },
          muted: { value: '{colors.brand.100}' },
        },
        fg: {
          DEFAULT: { value: '{colors.petjada.text}' },
          muted: { value: '{colors.petjada.muted}' },
          subtle: { value: '{colors.brand.700}' },
          error: { value: '{colors.petjada.danger}' },
        },
        border: {
          DEFAULT: { value: '{colors.brand.100}' },
          subtle: { value: '{colors.brand.50}' },
          muted: { value: '{colors.brand.200}' },
        },
        brand: {
          solid: { value: '{colors.brand.600}' },
          contrast: { value: 'white' },
          fg: { value: '{colors.brand.700}' },
          muted: { value: '{colors.brand.100}' },
          subtle: { value: '{colors.brand.50}' },
          emphasized: { value: '{colors.brand.200}' },
          focusRing: { value: '{colors.brand.500}' },
        },
        accent: {
          solid: { value: '{colors.accent.500}' },
          contrast: { value: '{colors.petjada.text}' },
          fg: { value: '{colors.accent.700}' },
          muted: { value: '{colors.accent.100}' },
          subtle: { value: '{colors.accent.50}' },
          emphasized: { value: '{colors.accent.200}' },
          focusRing: { value: '{colors.accent.400}' },
        },
        red: {
          solid: { value: '{colors.petjada.danger}' },
          fg: { value: '{colors.petjada.danger}' },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
