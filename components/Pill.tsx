import React, { useEffect } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSequence, interpolateColor, useReducedMotion } from 'react-native-reanimated';
import { ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';

type PillProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'accent' | 'gilt';
  // Opt-in, not derived from `label` automatically — several existing
  // screens already hand out their own accessibilityLabel to other elements
  // using the same words a Pill's label might contain (e.g. library.tsx's
  // room-view zones vs. its own status-tab Pills), and defaulting every
  // Pill to one made those ambiguous under getByLabel's substring matching.
  accessibilityLabel?: string;
};

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedView = Animated.createAnimatedComponent(View);

// Thin outlined tag — used for genre/format chips and the Discover filter
// row. Filled only when active, otherwise just a hairline outline.
export default function Pill({ label, active, onPress, tone = 'accent', accessibilityLabel }: PillProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const Wrapper: any = onPress ? AnimatedTouchable : AnimatedView;
  const toneColor = tone === 'gilt' ? colors.teal : colors.purple;
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: reducedMotion ? 0 : 180 });
    if (active && !reducedMotion) scale.value = withSequence(withTiming(1.06, { duration: 90 }), withTiming(1, { duration: 120 }));
  }, [active, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [colors.divider, toneColor]),
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(0,0,0,0)', toneColor]),
    transform: [{ scale: scale.value }],
  }));

  return (
    <Wrapper
      style={[styles.pill, animatedStyle]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: !!active } : undefined}
    >
      <Text style={[styles.text, { color: active ? 'white' : tone === 'gilt' ? toneColor : colors.gray }]}>{label}</Text>
    </Wrapper>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
    text: { fontSize: 11, fontWeight: '600' },
  });
