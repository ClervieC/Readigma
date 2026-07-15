import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type ProgressBarProps = {
  percent: number;
  color: string;
  trackColor: string;
  height?: number;
};

// Shared animated fill bar — width tweens on every percent change instead of
// snapping, used anywhere reading/goal progress is shown (Discover's
// reading-now card, book detail, the yearly goal screen).
export default function ProgressBar({ percent, color, trackColor, height = 6 }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(percent, 100));
  const width = useSharedValue(clamped);

  useEffect(() => {
    width.value = withTiming(clamped, { duration: 450 });
  }, [clamped]);

  const animatedStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={[styles.track, { backgroundColor: trackColor, height, borderRadius: height / 2 }]}>
      <Animated.View style={[styles.fill, animatedStyle, { backgroundColor: color, borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
});
