import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as badges from '../lib/badges';

function BadgeCard({ progress, colors, styles }: { progress: badges.BadgeProgress; colors: ColorPalette; styles: any }) {
  const { t } = useTranslation();
  const { category, value, earnedTierIndex, nextTier, progressToNext } = progress;
  const earned = earnedTierIndex >= 0;
  const currentLabel = earned ? t(category.tiers[earnedTierIndex].label) : null;
  const unit = t(category.unit);

  return (
    <View style={[styles.card, !earned && styles.cardLocked]}>
      <View style={[styles.iconWrap, earned && styles.iconWrapEarned]}>
        <Feather name={category.icon as any} size={20} color={earned ? '#FFFFFF' : colors.gray} />
      </View>
      <Text style={styles.cardTitle}>{t(category.title)}</Text>
      <Text style={styles.cardValue}>{value} {unit}</Text>
      {currentLabel ? (
        <Text style={styles.cardBadgeLabel}>🏅 {currentLabel}</Text>
      ) : (
        <Text style={styles.cardBadgeLabelMuted}>{t('badges.notUnlocked')}</Text>
      )}
      {nextTier ? (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressToNext * 100}%` as any }]} />
          </View>
          <Text style={styles.progressText}>
            {t('badges.beforeTier', { count: Math.max(nextTier.threshold - value, 0), unit, label: t(nextTier.label) })}
          </Text>
        </>
      ) : (
        <Text style={styles.maxedText}>{t('badges.maxLevel')}</Text>
      )}
    </View>
  );
}

export default function BadgesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const [stats, setStats] = useState<badges.BadgeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    badges.getBadgeStats().then(setStats).catch(() => {}).finally(() => setLoading(false));
  }, []));

  const progress = stats ? badges.computeBadgeProgress(stats) : [];
  const earnedCount = progress.filter(p => p.earnedTierIndex >= 0).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color={colors.white} /></TouchableOpacity>
        <Text style={styles.headerTitle}>{t('badges.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading || !stats ? (
        <Text style={styles.loadingText}>{t('badges.loading')}</Text>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.summary}>
            <Text style={styles.summaryValue}>{earnedCount} / {progress.length}</Text>
            <Text style={styles.summaryLabel}>{t('badges.summaryLabel')}</Text>
          </View>

          <View style={styles.grid}>
            {progress.map((p) => (
              <BadgeCard key={p.category.id} progress={p} colors={colors} styles={styles} />
            ))}
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  headerTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.white },
  loadingText: { color: colors.gray, textAlign: 'center', paddingTop: 40 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  summary: { alignItems: 'center', paddingVertical: 20, marginBottom: 10 },
  summaryValue: { fontSize: 30, fontFamily: fonts.headingBold, color: colors.white },
  summaryLabel: { fontSize: 12, color: colors.gray, marginTop: 4, textAlign: 'center' },
  grid: { gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 16, gap: 6 },
  cardLocked: { opacity: 0.75 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  iconWrapEarned: { backgroundColor: colors.purple },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  cardValue: { fontSize: 12, color: colors.gray },
  cardBadgeLabel: { fontSize: 13, fontWeight: '600', color: colors.lavender, marginTop: 4 },
  cardBadgeLabelMuted: { fontSize: 13, color: colors.gray, marginTop: 4, fontStyle: 'italic' },
  progressTrack: { height: 6, backgroundColor: colors.card2, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%', backgroundColor: colors.teal, borderRadius: 3 },
  progressText: { fontSize: 11, color: colors.gray, marginTop: 4 },
  maxedText: { fontSize: 12, color: colors.teal, fontWeight: '600', marginTop: 6 },
});
