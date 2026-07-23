import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { radius, fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as badges from '../lib/badges';

const POLL_INTERVAL_MS = 20_000;
const VISIBLE_DURATION_MS = 3_500;

// Announces a newly-earned badge tier the moment it's crossed, from
// wherever the reader happens to be — not just on app/badges.tsx. Mounted
// once at the root (see app/_layout.tsx) alongside TimerBubble, so it polls
// independently of any one screen's own focus lifecycle; new badges are
// usually earned passively (finishing a book, a day going by on a streak),
// not from an action on a screen that could just check inline.
export default function BadgeToast() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const [queue, setQueue] = useState<badges.NewlyEarnedBadge[]>([]);
  const [current, setCurrent] = useState<badges.NewlyEarnedBadge | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = () => {
    badges.checkNewlyEarnedBadges()
      .then((found) => { if (found.length > 0) setQueue((q) => [...q, ...found]); })
      .catch(() => {});
  };

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Drains the queue one toast at a time rather than all at once — earning
  // several tiers in the same check (e.g. two streak milestones back to
  // back) would otherwise flash by unreadably.
  useEffect(() => {
    if (current || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
    dismissTimerRef.current = setTimeout(() => setCurrent(null), VISIBLE_DURATION_MS);
  }, [queue, current]);

  useEffect(() => () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current); }, []);

  if (!current) return null;

  return (
    <Animated.View
      style={[styles.wrap, { top: insets.top + 8 }]}
      entering={SlideInUp.duration(280).springify().damping(16)}
      exiting={SlideOutUp.duration(200)}
    >
      <View style={styles.iconCircle}>
        <Feather name="award" size={16} color={colors.warning} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{t('badges.newBadgeUnlocked')}</Text>
        <Text style={styles.detail} numberOfLines={1}>
          {t(current.titleKey)} · {t(current.tierLabelKey)}
        </Text>
      </View>
    </Animated.View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 16,
      right: 16,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.divider,
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 6,
      zIndex: 100,
    },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.card2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.white },
    detail: { fontSize: 11, color: colors.muted, marginTop: 1 },
  });
