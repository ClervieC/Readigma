import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming, interpolateColor } from 'react-native-reanimated';
import { ColorPalette, fonts } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { emitScrollToTop } from '../lib/tabScrollEmitter';

const TABS: { name: string; labelKey: string; icon: keyof typeof Feather.glyphMap }[] = [
  { name: 'index', labelKey: 'tabs.discover', icon: 'compass' },
  { name: 'feed', labelKey: 'tabs.feed', icon: 'activity' },
  { name: 'library', labelKey: 'tabs.library', icon: 'book-open' },
  { name: 'search', labelKey: 'tabs.search', icon: 'search' },
  { name: 'profile', labelKey: 'tabs.profile', icon: 'user' },
];

// expo-router's Tabs vendors its own copy of react-navigation/bottom-tabs
// (not a separate installable package in SDK 57), so this types the
// `tabBar` render-prop shape locally rather than importing from expo-router's
// internal build paths, which aren't part of its public API.
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

function TabItem({ tab, focused, onPress, colors }: { tab: typeof TABS[number]; focused: boolean; onPress: () => void; colors: ColorPalette }) {
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const progress = useSharedValue(focused ? 1 : 0);
  const scale = useSharedValue(focused ? 1 : 1);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: 180 });
    if (focused) scale.value = withSequence(withTiming(1.18, { duration: 110 }), withTiming(1, { duration: 140 }));
  }, [focused]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const labelStyle = useAnimatedStyle(() => ({ color: interpolateColor(progress.value, [0, 1], [colors.gray, colors.purple]) }));
  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(0,0,0,0)', colors.purpleGlow]),
    transform: [{ scale: 0.85 + progress.value * 0.15 }],
  }));

  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.6}>
      <Animated.View style={[styles.iconPill, pillStyle]}>
        <Animated.View style={iconStyle}>
          <Feather name={tab.icon} size={20} color={focused ? colors.purple : colors.gray} />
        </Animated.View>
      </Animated.View>
      <Animated.Text style={[styles.label, labelStyle, focused && styles.labelActive]}>{t(tab.labelKey)}</Animated.Text>
    </TouchableOpacity>
  );
}

export default function TabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);

  return (
    <View style={[styles.wrapper, { paddingBottom: 18 + insets.bottom }]}>
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.name === route.name) ?? TABS[index];
        const focused = state.index === index;

        return (
          <TabItem key={route.key} tab={tab} focused={focused} colors={colors}
            onPress={() => focused ? emitScrollToTop(route.name) : navigation.navigate(route.name)} />
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      backgroundColor: colors.bg,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      paddingTop: 10,
    },
    item: { flex: 1, alignItems: 'center', gap: 4 },
    iconPill: { paddingHorizontal: 18, paddingVertical: 5, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: 10, fontFamily: fonts.body, letterSpacing: 0.2 },
    labelActive: { fontWeight: '600' },
  });
