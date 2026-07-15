import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as friends from '../../lib/friends';
import Pill from '../../components/Pill';
import ProgressBar from '../../components/ProgressBar';
import { formatDuration } from '../../lib/timer';

export default function UserProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { id, username } = useLocalSearchParams<{ id: string; username?: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    friends.getUserProfile(id).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color={colors.white} /></TouchableOpacity>
          <Text style={styles.headerTitle}>{username ?? 'Profil'}</Text>
          <View style={{ width: 20 }} />
        </View>
        <View style={styles.loader}><ActivityIndicator color={colors.lavender} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color={colors.white} /></TouchableOpacity>
        </View>
        <View style={styles.loader}><Text style={styles.errorText}>Impossible de charger ce profil</Text></View>
      </SafeAreaView>
    );
  }

  const { user, stats, currentlyReading, goal, formatStats, readingSeconds, reviews } = data;
  const formatTotal = formatStats.physical_count + formatStats.ereader_count;
  const physicalPct = formatTotal > 0 ? Math.round((formatStats.physical_count / formatTotal) * 100) : 0;
  const goalPct = goal ? Math.min((goal.booksRead / goal.target) * 100, 100) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color={colors.white} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={{ width: 20 }} />
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{user.username?.slice(0, 2).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.name}>{user.username}</Text>
          <Text style={styles.handle}>@{user.username?.toLowerCase()}</Text>
        </View>

        <View style={styles.statsRow}>
          {[
            { num: stats.done_count ?? 0,    label: 'Lus',      color: colors.success },
            { num: stats.reading_count ?? 0, label: 'En cours', color: colors.cyan },
            { num: stats.to_read_count ?? 0, label: 'À lire',   color: colors.lavender },
            { num: stats.avg_rating ? Number(stats.avg_rating).toFixed(1) + '★' : '—', label: 'Moy.', color: colors.warning },
          ].map((s, i) => (
            <View key={i} style={styles.statBox}>
              <Text style={[styles.statNum, { color: s.color }]}>{s.num}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {goal && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Objectif de lecture</Text>
              <Text style={styles.cardHeaderValue}>{goal.booksRead} / {goal.target} livres</Text>
            </View>
            <ProgressBar percent={goalPct} color={colors.cyan} trackColor={colors.card2} />
          </View>
        )}

        {readingSeconds > 0 && (
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Temps de lecture total</Text>
            <Text style={styles.timeValue}>{formatDuration(readingSeconds)}</Text>
          </View>
        )}

        {formatTotal > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Format de lecture</Text>
            <View style={styles.formatRow}>
              <Text style={styles.formatLabel}>{physicalPct}% physique</Text>
              <View style={styles.formatBar}>
                <View style={[styles.formatFillA, { width: `${physicalPct}%` as any }]} />
                <View style={[styles.formatFillB, { width: `${100 - physicalPct}%` as any }]} />
              </View>
              <Text style={styles.formatLabel}>{100 - physicalPct}% liseuse</Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>En ce moment</Text>
        {currentlyReading.length > 0 ? (
          currentlyReading.map((book: any, i: number) => (
            <View key={i} style={[styles.bookCard, i < currentlyReading.length - 1 && styles.bookCardDivider]}>
              <View style={styles.bookCover}>
                {book.cover_url ? <Image source={{ uri: book.cover_url }} style={styles.bookCoverImg} /> : <Feather name="book" size={20} color={colors.purple} />}
              </View>
              <View style={styles.bookInfo}>
                <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
                <Text style={styles.bookAuthor}>{book.author}</Text>
                {book.genres?.[0] ? <Pill label={book.genres[0]} tone="gilt" /> : null}
                {book.progress_percent > 0 && (
                  <View style={styles.progressWrap}>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${Math.min(book.progress_percent, 100)}%` as any }]} />
                    </View>
                    <Text style={styles.progressText}>{Math.round(book.progress_percent)}%</Text>
                  </View>
                )}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>@{user.username} ne lit rien en ce moment</Text>
        )}

        {reviews.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Livres lus</Text>
            <Text style={styles.readHint}>Appuie sur un livre pour l'ajouter (ou non) à ta pile à lire.</Text>
            {reviews.map((r: any, i: number) => (
              <TouchableOpacity key={i} style={[styles.reviewCard, i < reviews.length - 1 && styles.bookCardDivider]}
                activeOpacity={0.75} onPress={() => router.push(`/book/${r.id}`)}>
                <View style={styles.bookCover}>
                  {r.cover_url ? <Image source={{ uri: r.cover_url }} style={styles.bookCoverImg} /> : <Feather name="book" size={20} color={colors.purple} />}
                </View>
                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle} numberOfLines={2}>{r.title}</Text>
                  <Text style={styles.bookAuthor}>{r.author}</Text>
                  {r.rating ? <Text style={styles.reviewRating}>{Number(r.rating).toFixed(2)} ★</Text> : null}
                  {r.comment ? <Text style={styles.reviewComment}>"{r.comment}"</Text> : null}
                </View>
                <Feather name="chevron-right" size={16} color={colors.gray} />
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  headerTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.white },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.gray, fontSize: 14 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarPlaceholder: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 26, fontWeight: '700', color: 'white' },
  name: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.white, marginTop: 6 },
  handle: { fontSize: 12, color: colors.gray },
  statsRow: { flexDirection: 'row', marginBottom: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider, paddingVertical: 16 },
  statBox: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 18, fontFamily: fonts.headingBold },
  statLabel: { fontSize: 9, color: colors.gray, marginTop: 2 },
  sectionTitle: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 14 },
  bookCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingBottom: 16, marginBottom: 16 },
  bookCardDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  bookCover: { width: 52, height: 72, backgroundColor: colors.card2, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' },
  bookCoverImg: { width: 52, height: 72 },
  bookInfo: { flex: 1, gap: 6 },
  bookTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  bookAuthor: { fontSize: 12, color: colors.gray },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBar: { flex: 1, height: 4, backgroundColor: colors.card2, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.cyan, borderRadius: 2 },
  progressText: { fontSize: 11, color: colors.cyan, fontWeight: '600', width: 32 },
  emptyText: { fontSize: 13, color: colors.gray },
  card: { marginBottom: 24 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardHeaderValue: { fontSize: 12, color: colors.gray },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  timeLabel: { fontSize: 13, color: colors.gray },
  timeValue: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.purple },
  formatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  formatLabel: { fontSize: 11, color: colors.gray },
  formatBar: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', backgroundColor: colors.card2 },
  formatFillA: { backgroundColor: colors.purple },
  formatFillB: { backgroundColor: colors.teal },
  reviewCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingBottom: 16, marginBottom: 16 },
  reviewRating: { fontSize: 12, color: colors.teal, fontWeight: '700', marginTop: 2 },
  reviewComment: { fontSize: 12, color: colors.gray, fontStyle: 'italic', marginTop: 4, lineHeight: 17 },
  readHint: { fontSize: 11, color: colors.gray, marginTop: -6, marginBottom: 14 },
});
