import { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, radius, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as follows from '../../lib/follows';
import Pill from '../../components/Pill';
import ProgressBar from '../../components/ProgressBar';
import { formatDuration } from '../../lib/timer';

export default function UserProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const { id, username } = useLocalSearchParams<{ id: string; username?: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    follows.getUserProfile(id).then(setData).catch(() => {}).finally(() => setLoading(false));
    follows.isFollowing(id).then(setIsFollowing).catch(() => {});
  }, [id]);

  const toggleFollow = () => {
    if (isFollowing === null) return;
    setFollowLoading(true);
    (isFollowing ? follows.unfollowUser(id) : follows.followUser(id))
      .then(() => setIsFollowing(!isFollowing))
      .catch(() => Alert.alert(t('common.error'), isFollowing ? t('follows.errors.unfollow') : t('userProfile.errors.follow')))
      .finally(() => setFollowLoading(false));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color={colors.white} /></TouchableOpacity>
          <Text style={styles.headerTitle}>{username ?? t('userProfile.defaultTitle')}</Text>
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
        <View style={styles.loader}><Text style={styles.errorText}>{t('userProfile.loadError')}</Text></View>
      </SafeAreaView>
    );
  }

  const { user, stats, currentlyReading, goal, formatStats, readingSeconds, reviews } = data;
  const formatTotal = formatStats.physical_count + formatStats.ereader_count + formatStats.audiobook_count;
  const goalPct = goal ? Math.min((goal.booksRead / goal.target) * 100, 100) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color={colors.white} /></TouchableOpacity>
        <Text style={styles.headerTitle}>{t('userProfile.defaultTitle')}</Text>
        <TouchableOpacity onPress={() => setShowMoreMenu(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="more-vertical" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      {showMoreMenu && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowMoreMenu(false)}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowMoreMenu(false)}>
            <View style={styles.menuSheet}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setShowMoreMenu(false);
                  router.push({ pathname: '/report', params: { targetType: 'user', targetId: id, label: `@${user.username}` } });
                }}
              >
                <Feather name="flag" size={16} color={colors.error} />
                <Text style={[styles.menuRowText, { color: colors.error }]}>{t('userProfile.reportProfile')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

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
          {isFollowing !== null && (
            <TouchableOpacity
              style={[styles.followBtn, isFollowing && styles.followBtnActive]}
              onPress={toggleFollow}
              disabled={followLoading}
            >
              {followLoading ? (
                <ActivityIndicator size="small" color={isFollowing ? colors.white : 'white'} />
              ) : (
                <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
                  {isFollowing ? t('userProfile.following') : t('follows.follow')}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.statsRow}>
          {[
            { num: stats.done_count ?? 0,    label: t('profile.statsRead'),    color: colors.success },
            { num: stats.reading_count ?? 0, label: t('profile.statsReading'), color: colors.cyan },
            { num: stats.to_read_count ?? 0, label: t('profile.statsToRead'),  color: colors.lavender },
            { num: stats.avg_rating ? Number(stats.avg_rating).toFixed(1) + '★' : '—', label: t('profile.statsAvg'), color: colors.warning },
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
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{t('userProfile.readingGoal')}</Text>
              <Text style={styles.cardHeaderValue}>{t('userProfile.booksCount', { read: goal.booksRead, target: goal.target })}</Text>
            </View>
            <ProgressBar percent={goalPct} color={colors.cyan} trackColor={colors.card2} />
          </View>
        )}

        {readingSeconds > 0 && (
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>{t('userProfile.totalReadingTime')}</Text>
            <Text style={styles.timeValue}>{formatDuration(readingSeconds)}</Text>
          </View>
        )}

        {formatTotal > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('profile.formatSplitTitle')}</Text>
            <View style={styles.formatStatsRow}>
              <View style={styles.formatStatItem}>
                <Feather name="book" size={16} color={colors.purple} />
                <Text style={styles.formatStatNum}>{formatStats.physical_count}</Text>
                <Text style={styles.formatStatLabel}>{t('book.formatPhysical')}</Text>
              </View>
              <View style={styles.formatStatItem}>
                <Feather name="tablet" size={16} color={colors.teal} />
                <Text style={styles.formatStatNum}>{formatStats.ereader_count}</Text>
                <Text style={styles.formatStatLabel}>{t('book.formatEreader')}</Text>
              </View>
              <View style={styles.formatStatItem}>
                <Feather name="headphones" size={16} color={colors.lavender} />
                <Text style={styles.formatStatNum}>{formatStats.audiobook_count}</Text>
                <Text style={styles.formatStatLabel}>{t('book.formatAudiobook')}</Text>
              </View>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>{t('userProfile.currentlyReading')}</Text>
        {currentlyReading.length > 0 ? (
          currentlyReading.map((book: any, i: number) => (
            <TouchableOpacity key={i} activeOpacity={0.75} disabled={!book.id} onPress={() => router.push(`/book/${book.id}`)}
              style={[styles.bookCard, i < currentlyReading.length - 1 && styles.bookCardDivider]}>
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
              {book.id ? <Feather name="chevron-right" size={16} color={colors.gray} /> : null}
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>{t('userProfile.notReadingAnything', { username: `@${user.username}` })}</Text>
        )}

        {reviews.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 10 }]}>{t('userProfile.booksRead')}</Text>
            <Text style={styles.readHint}>{t('userProfile.tapToAddHint')}</Text>
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
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingBottom: 30 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingVertical: 16 },
  menuRowText: { fontSize: 14, fontWeight: '600', color: colors.white },
  scroll: { flex: 1, paddingHorizontal: 20 },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarPlaceholder: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 26, fontWeight: '700', color: 'white' },
  name: { fontSize: 18, fontFamily: fonts.headingBold, color: colors.white, marginTop: 6 },
  handle: { fontSize: 12, color: colors.gray },
  followBtn: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 9, borderRadius: 999, backgroundColor: colors.purple, minWidth: 110, alignItems: 'center' },
  followBtnActive: { backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.divider },
  followBtnText: { fontSize: 13, fontWeight: '700', color: 'white' },
  followBtnTextActive: { color: colors.white },
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
  formatStatsRow: { flexDirection: 'row', gap: 10 },
  formatStatItem: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: colors.card2, borderRadius: radius.md, paddingVertical: 12 },
  formatStatNum: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.white },
  formatStatLabel: { fontSize: 10, color: colors.gray },
  reviewCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingBottom: 16, marginBottom: 16 },
  reviewRating: { fontSize: 12, color: colors.teal, fontWeight: '700', marginTop: 2 },
  reviewComment: { fontSize: 12, color: colors.gray, fontStyle: 'italic', marginTop: 4, lineHeight: 17 },
  readHint: { fontSize: 11, color: colors.gray, marginTop: -6, marginBottom: 14 },
});
