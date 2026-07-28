import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';

export type AtmosphereTint = 'purple' | 'pink' | 'teal' | 'lavender';

// A soft top-down wash behind a screen's content — replaces a flat
// colors.bg fill with a hint of depth (like light falling from just above
// the header) without touching any layout or interaction. Purely
// decorative: absolutely positioned behind everything, no pointer events.
// Each of the 5 main tabs gets its own tint (see their own screens) rather
// than repeating the same purple everywhere, so the app doesn't read as one
// undifferentiated wash from tab to tab.
export default function AtmosphericBackground({ tint = 'purple' }: { tint?: AtmosphereTint }) {
  const { colors } = useTheme();
  const glow = {
    purple: colors.purpleGlow,
    pink: colors.pinkGlow,
    teal: colors.tealGlow,
    lavender: colors.lavenderGlow,
  }[tint];
  return (
    <LinearGradient
      pointerEvents="none"
      colors={[glow, 'transparent']}
      locations={[0, 0.5]}
      style={StyleSheet.absoluteFill}
    />
  );
}
