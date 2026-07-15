import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';

type ScreenProps = {
  title?: string;
  back?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
  scroll?: boolean;
  children: React.ReactNode;
};

// Shared page shell: a thin, centered header (back chevron + title + an
// optional right-side accessory) over a scrollable body. Every screen but
// the tab roots uses this instead of hand-rolling the same header markup.
export default function Screen({ title, back, left, right, scroll = true, children }: ScreenProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const header = (title || back || left || right) && (
    <View style={styles.header}>
      <View style={styles.side}>
        {back ? (
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={20} color={colors.white} />
          </TouchableOpacity>
        ) : (
          left
        )}
      </View>
      {title ? (
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Animated.View entering={FadeIn.duration(220)}>{header}</Animated.View>
      {scroll ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(280).springify().damping(18)}>{children}</Animated.View>
        </ScrollView>
      ) : (
        <Animated.View style={[styles.content, styles.contentInner]} entering={FadeInDown.duration(280).springify().damping(18)}>
          {children}
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 16,
    },
    side: { minWidth: 24, flexDirection: 'row', alignItems: 'center' },
    sideRight: { justifyContent: 'flex-end' },
    title: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: fonts.headingBold, color: colors.white },
    content: { flex: 1 },
    contentInner: { paddingHorizontal: 20, paddingBottom: 40 },
  });
