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
  lavenderGlow: 'rgba(219,178,228,0.24)',
  pink: '#DD93A3',
  pinkGlow: 'rgba(221,147,163,0.24)',
  // cyan and teal used to be the exact same hex — any UI cycling through
  // the two (spine colors, category tags) silently collapsed to one color.
  cyan: '#82C2B8',
  teal: '#E8BE6C',
  tealGlow: 'rgba(232,190,108,0.24)',
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
  lavenderGlow: 'rgba(122,79,132,0.08)',
  pink: '#B5677A',
  pinkGlow: 'rgba(181,103,122,0.08)',
  cyan: '#4F8B83',
  // Darkened from #B98A3F — that value only hit ~3.1:1 on white/card
  // (fails WCAG AA's 4.5:1) yet was used directly as text color for review
  // ratings, badge status, admin actions, and feed progress labels. This
  // shade holds ~4.9:1 on #FFFFFF while staying the same warm gold hue.
  teal: '#8F6A2F',
  tealGlow: 'rgba(143,106,47,0.08)',
  white: '#1E1B15',
  muted: '#6B6459',
  gray: '#948C7C',
  success: '#4C7A5C',
  error: '#A5453A',
  warning: '#8F6A2F',
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
  // Karla pairs with Fraunces' warm, slightly quirky serif without
  // competing with it — applied app-wide as the default Text font in
  // RootLayout, so most screens never need to reference this directly.
  // Use bodyMedium/bodySemiBold/bodyBold wherever a heavier weight is
  // needed — plain fontWeight no longer does anything over a custom font.
  body: 'Karla_400Regular',
  bodyMedium: 'Karla_500Medium',
  bodySemiBold: 'Karla_600SemiBold',
  bodyBold: 'Karla_700Bold',
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
