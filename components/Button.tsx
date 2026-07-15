import React from 'react';
import { Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { radius, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: any;
};

export default function Button({ label, onPress, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      <Pressable
        style={[styles.base, styles[variant], (disabled || loading) && styles.disabled]}
        onPress={onPress}
        disabled={disabled || loading}
        onPressIn={() => { scale.value = withTiming(0.97, { duration: 100 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'ghost' ? colors.purple : 'white'} size="small" />
        ) : (
          <Text style={[styles.label, styles[`${variant}Label` as const]]}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    base: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    primary: { backgroundColor: colors.purple },
    ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.divider },
    danger: { backgroundColor: colors.error },
    disabled: { opacity: 0.5 },
    label: { fontSize: 14, fontWeight: '600' },
    primaryLabel: { color: 'white' },
    ghostLabel: { color: colors.white },
    dangerLabel: { color: 'white' },
  });
