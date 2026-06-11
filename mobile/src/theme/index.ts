export const darkColors = {
  bg: '#080A18',
  card: '#0F1226',
  card2: '#171B30',
  purple: '#7C3AED',
  purpleGlow: 'rgba(124,58,237,0.18)',
  lavender: '#A78BFA',
  pink: '#EC4899',
  cyan: '#22D3EE',
  teal: '#22D3EE',
  white: '#F1F5F9',
  muted: '#94A3B8',
  gray: '#64748B',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  divider: 'rgba(255,255,255,0.07)',
  border: 'rgba(124,58,237,0.22)',
};

export const lightColors = {
  bg: '#F0F2FF',
  card: '#FFFFFF',
  card2: '#E8EBFF',
  purple: '#7C3AED',
  purpleGlow: 'rgba(124,58,237,0.10)',
  lavender: '#6D28D9',
  pink: '#DB2777',
  cyan: '#0891B2',
  teal: '#0891B2',
  white: '#0F172A',
  muted: '#475569',
  gray: '#94A3B8',
  success: '#059669',
  error: '#DC2626',
  warning: '#D97706',
  divider: 'rgba(0,0,0,0.08)',
  border: 'rgba(124,58,237,0.25)',
};

export type ColorPalette = typeof darkColors;

// Backward-compat alias (static dark — only used in non-component contexts)
export const colors = darkColors;

export const fonts = {
  heading: 'System',
  body: 'System',
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 32,
};

export const shadows = {
  card: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  glow: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
};
