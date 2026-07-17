export const darkColors = {
  // A near-black bg (#16140F) with card/card2 only a few RGB steps above it
  // read as flat and low-contrast everywhere — every surface, divider and
  // muted label blurred together. Rebuilt as a lighter warm charcoal with
  // three clearly stepped surface tones and brighter text/accent colors.
  bg: '#221D16',
  card: '#3C3325',
  card2: '#524635',
  purple: '#8C5A98',
  purpleGlow: 'rgba(140,90,152,0.24)',
  lavender: '#DBB2E4',
  pink: '#DD93A3',
  // cyan and teal used to be the exact same hex — any UI cycling through
  // the two (spine colors, category tags) silently collapsed to one color.
  cyan: '#82C2B8',
  teal: '#E8BE6C',
  white: '#FBF7EF',
  muted: '#B0A692',
  gray: '#C4BAA4',
  success: '#89C298',
  error: '#E6907F',
  warning: '#E8BE6C',
  divider: 'rgba(251,247,239,0.16)',
  border: 'rgba(219,178,228,0.34)',
};

export const lightColors = {
  bg: '#FAF6EE',
  card: '#FFFFFF',
  card2: '#F1EADB',
  purple: '#5B3A63',
  purpleGlow: 'rgba(91,58,99,0.08)',
  lavender: '#7A4F84',
  pink: '#B5677A',
  cyan: '#4F8B83',
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
