export const darkColors = {
  bg: '#16140F',
  card: '#211E17',
  card2: '#2B2620',
  purple: '#6B3F73',
  purpleGlow: 'rgba(107,63,115,0.18)',
  lavender: '#C296CE',
  pink: '#C97B8C',
  cyan: '#D6A857',
  teal: '#D6A857',
  white: '#F3EEE3',
  muted: '#948C7C',
  gray: '#7A7266',
  success: '#6B9E7D',
  error: '#D97567',
  warning: '#D6A857',
  divider: 'rgba(243,238,227,0.10)',
  border: 'rgba(194,150,206,0.22)',
};

export const lightColors = {
  bg: '#FAF6EE',
  card: '#FFFFFF',
  card2: '#F1EADB',
  purple: '#5B3A63',
  purpleGlow: 'rgba(91,58,99,0.08)',
  lavender: '#7A4F84',
  pink: '#B5677A',
  cyan: '#B98A3F',
  teal: '#B98A3F',
  white: '#1E1B15',
  muted: '#6B6459',
  gray: '#948C7C',
  success: '#4C7A5C',
  error: '#A5453A',
  warning: '#B98A3F',
  divider: 'rgba(30,27,21,0.08)',
  border: 'rgba(91,58,99,0.20)',
};

export type ColorPalette = typeof darkColors;

// Backward-compat alias (static dark — only used in non-component contexts)
export const colors = darkColors;

export const fonts = {
  // RootLayout's useFonts blocks first render until these are loaded, so
  // there's no fallback-font flash to worry about. React Native maps a
  // custom font family to exactly one weight — bold headings need the
  // Bold family below rather than `fontWeight: '700'` on the SemiBold one.
  heading: 'Fraunces_600SemiBold',
  headingBold: 'Fraunces_700Bold',
  body: 'System',
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 32,
};

// Kept intentionally subtle — the redesign favors hairline dividers and flat
// surfaces over the previous heavy purple glow/shadow treatment.
export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  glow: {
    shadowColor: '#6B3F73',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
};
