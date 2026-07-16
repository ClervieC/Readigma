import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { radius, fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as stats from '../lib/stats';
import * as goals from '../lib/goals';
import { formatDuration } from '../lib/timer';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
// Index 0 = Sunday, matching Postgres's extract(dow) used by
// reading_stats_by_weekday.
const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function StatCard({ icon, value, label, colors, styles }: { icon: keyof typeof Feather.glyphMap; value: string; label: string; colors: ColorPalette; styles: any }) {
  return (
    <View style={styles.statCard}>
      <Feather name={icon} size={16} color={colors.purple} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function StatsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [overview, setOverview] = useState<stats.ReadingStatsOverview | null>(null);
  const [genres, setGenres] = useState<stats.GenreCount[]>([]);
  const [monthly, setMonthly] = useState<{ month: number; count: number }[]>([]);
  const [streak, setStreak] = useState(0);
  const [weekdays, setWeekdays] = useState<stats.WeekdaySeconds[]>([]);
  const [extremes, setExtremes] = useState<stats.ReadingExtremes | null>(null);
  const [friendsAvg, setFriendsAvg] = useState<{ friend_count: number; avg_books: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const currentMonth = new Date().getMonth() + 1;

  useFocusEffect(useCallback(() => {
    setLoading(true);
    Promise.all([
      stats.getOverview(),
      stats.getGenreBreakdown(),
      goals.getMonthly(),
      stats.getStreak(),
      stats.getByWeekday(),
      stats.getExtremes(),
      stats.getFriendsAvg(),
    ])
      .then(([o, g, m, streakDays, wd, ext, fa]) => {
        setOverview(o); setGenres(g); setMonthly(m);
        setStreak(streakDays); setWeekdays(wd); setExtremes(ext); setFriendsAvg(fa);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []));

  const maxMonthly = Math.max(...monthly.map(m => m.count), 1);
  const maxGenre = Math.max(...genres.map(g => g.count), 1);
  const busiestWeekday = weekdays.reduce<stats.WeekdaySeconds | null>(
    (best, w) => (!best || w.seconds > best.seconds ? w : best),
    null,
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color={colors.white} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Statistiques</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading || !overview ? (
        <Text style={styles.loadingText}>Chargement...</Text>
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.statsGrid}>
            <StatCard icon="book" value={String(overview.total_done)} label="Livres lus (total)" colors={colors} styles={styles} />
            <StatCard icon="calendar" value={String(overview.books_this_month)} label="Ce mois-ci" colors={colors} styles={styles} />
            <StatCard icon="trending-up" value={String(overview.books_this_year)} label="Cette année" colors={colors} styles={styles} />
            <StatCard
              icon="clock"
              value={overview.avg_days_to_finish != null ? `${overview.avg_days_to_finish}j` : '—'}
              label="Temps moyen pour finir"
              colors={colors} styles={styles}
            />
            <StatCard
              icon="watch"
              value={overview.avg_reading_seconds_per_book != null ? formatDuration(overview.avg_reading_seconds_per_book) : '—'}
              label="Temps de lecture moyen"
              colors={colors} styles={styles}
            />
            <StatCard
              icon="star"
              value={overview.avg_rating != null ? overview.avg_rating.toFixed(1) : '—'}
              label="Note moyenne donnée"
              colors={colors} styles={styles}
            />
            <StatCard
              icon="zap"
              value={streak > 0 ? `${streak}j` : '—'}
              label="Série de lecture en cours"
              colors={colors} styles={styles}
            />
            <StatCard
              icon="sun"
              value={busiestWeekday && busiestWeekday.seconds > 0 ? WEEKDAYS[busiestWeekday.weekday].slice(0, 3) : '—'}
              label="Jour où tu lis le plus"
              colors={colors} styles={styles}
            />
          </View>

          {overview.favorite_author && (
            <View style={styles.authorCard}>
              <Feather name="user" size={16} color={colors.lavender} />
              <View style={{ flex: 1 }}>
                <Text style={styles.authorLabel}>Auteur préféré</Text>
                <Text style={styles.authorName}>{overview.favorite_author}</Text>
              </View>
              <Text style={styles.authorCount}>{overview.favorite_author_count} livre{overview.favorite_author_count > 1 ? 's' : ''}</Text>
            </View>
          )}

          {friendsAvg && friendsAvg.friend_count > 0 && friendsAvg.avg_books != null && (
            <View style={styles.authorCard}>
              <Feather name="users" size={16} color={colors.teal} />
              <View style={{ flex: 1 }}>
                <Text style={styles.authorLabel}>Comparé à tes {friendsAvg.friend_count} ami{friendsAvg.friend_count > 1 ? 's' : ''}</Text>
                <Text style={styles.authorName}>
                  {overview.books_this_year > friendsAvg.avg_books
                    ? 'Tu lis plus qu\'eux cette année'
                    : overview.books_this_year < friendsAvg.avg_books
                      ? 'Ils lisent plus que toi cette année'
                      : 'Vous lisez au même rythme cette année'}
                </Text>
              </View>
              <Text style={styles.authorCount}>{overview.books_this_year} vs {friendsAvg.avg_books}</Text>
            </View>
          )}

          {extremes && (extremes.longest_title || extremes.fastest_title) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Records de lecture</Text>
              <View style={styles.extremesRow}>
                {extremes.longest_title && (
                  <View style={styles.extremeCard}>
                    <Feather name="battery" size={14} color={colors.error} />
                    <Text style={styles.extremeLabel}>Le plus long</Text>
                    <Text style={styles.extremeTitle} numberOfLines={2}>{extremes.longest_title}</Text>
                    <Text style={styles.extremeDays}>{extremes.longest_days}j</Text>
                  </View>
                )}
                {extremes.fastest_title && (
                  <View style={styles.extremeCard}>
                    <Feather name="zap" size={14} color={colors.success} />
                    <Text style={styles.extremeLabel}>Le plus rapide</Text>
                    <Text style={styles.extremeTitle} numberOfLines={2}>{extremes.fastest_title}</Text>
                    <Text style={styles.extremeDays}>{extremes.fastest_days}j</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {monthly.some(m => m.count > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Livres finis par mois</Text>
              <View style={styles.chart}>
                {monthly.map((m) => {
                  const barH = maxMonthly > 0 ? (m.count / maxMonthly) * 80 : 0;
                  const isCurrent = m.month === currentMonth;
                  return (
                    <View key={m.month} style={styles.barCol}>
                      <Text style={styles.barCount}>{m.count > 0 ? m.count : ''}</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { height: Math.max(barH, m.count > 0 ? 4 : 0) }, isCurrent && styles.barFillCurrent]} />
                      </View>
                      <Text style={[styles.barLabel, isCurrent && styles.barLabelCurrent]}>{MONTHS[m.month - 1]}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {genres.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Genres les plus lus</Text>
              {genres.map((g) => (
                <View key={g.genre} style={styles.genreRow}>
                  <Text style={styles.genreLabel} numberOfLines={1}>{g.genre}</Text>
                  <View style={styles.genreTrack}>
                    <View style={[styles.genreFill, { width: `${Math.max((g.count / maxGenre) * 100, 6)}%` as any }]} />
                  </View>
                  <Text style={styles.genreCount}>{g.count}</Text>
                </View>
              ))}
            </View>
          )}

          {overview.total_done === 0 && (
            <View style={styles.emptyState}>
              <Feather name="bar-chart-2" size={36} color={colors.gray} />
              <Text style={styles.emptyText}>Termine un premier livre pour voir tes statistiques ici.</Text>
            </View>
          )}

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
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: {
    width: '31.5%', backgroundColor: colors.card, borderRadius: radius.md,
    padding: 12, gap: 6, alignItems: 'flex-start',
  },
  statValue: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.white },
  statLabel: { fontSize: 10, color: colors.gray, lineHeight: 13 },
  authorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
    borderRadius: radius.md, padding: 14, marginBottom: 16,
  },
  authorLabel: { fontSize: 10, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.4 },
  authorName: { fontSize: 15, fontWeight: '700', color: colors.white, marginTop: 2 },
  authorCount: { fontSize: 12, color: colors.lavender, fontWeight: '600' },
  extremesRow: { flexDirection: 'row', gap: 10 },
  extremeCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, gap: 4 },
  extremeLabel: { fontSize: 10, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  extremeTitle: { fontSize: 13, fontWeight: '700', color: colors.white, minHeight: 34 },
  extremeDays: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.white },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 16 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 110 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barCount: { fontSize: 9, color: colors.muted, height: 12, textAlign: 'center' },
  barTrack: { height: 80, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  barFill: { width: '70%', backgroundColor: colors.purple, borderRadius: 3 },
  barFillCurrent: { backgroundColor: colors.cyan },
  barLabel: { fontSize: 8, color: colors.gray, textAlign: 'center' },
  barLabelCurrent: { color: colors.cyan, fontWeight: '700' },
  genreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  genreLabel: { width: 90, fontSize: 12, color: colors.white },
  genreTrack: { flex: 1, height: 8, backgroundColor: colors.card2, borderRadius: 4, overflow: 'hidden' },
  genreFill: { height: '100%', backgroundColor: colors.teal, borderRadius: 4 },
  genreCount: { width: 24, fontSize: 11, color: colors.gray, textAlign: 'right' },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyText: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 30 },
});
