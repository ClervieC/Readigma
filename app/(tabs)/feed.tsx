import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Image, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, fonts, shadows, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as feed from '../../lib/feed';
import NotificationBell from '../../components/NotificationBell';
import AdBanner from '../../components/AdBanner';
import { onScrollToTop } from '../../lib/tabScrollEmitter';
import i18n from '../../lib/i18n';

// Plain function (not a component) — takes `t` as a param rather than its
// own useTranslation(), same reasoning as getGreetingKey in (tabs)/index.tsx.
function timeAgo(dateStr: string, t: typeof i18n.t) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return t('feed.timeJustNow');
  if (mins < 60) return t('feed.timeMinutes', { count: mins });
  if (hours < 24) return t('feed.timeHours', { count: hours });
  return t('feed.timeDays', { count: days });
}

// Each activity type gets its own accent color so the feed reads at a glance
// instead of every card looking like the same flat gray row.
function activityAccent(type: string, colors: ColorPalette) {
  switch (type) {
    case 'finished': return { color: colors.success };
    case 'reaction': return { color: colors.pink };
    case 'progress_update': return { color: colors.teal };
    case 'started': return { color: colors.purple };
    default: return { color: colors.purple };
  }
}

function ActivityCard({ item, last, onUserPress, onBookPress, onLike, onCommentAdded, styles, colors }: {
  item: any;
  last: boolean;
  onUserPress: (userId: string, username: string) => void;
  onBookPress: (bookId: string) => void;
  onLike: () => void;
  onCommentAdded: () => void;
  styles: any;
  colors: ColorPalette;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<feed.FeedComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);

  const toggleComments = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && comments.length === 0) {
      setLoadingComments(true);
      feed.getComments(item.id).then(setComments).catch(() => {}).finally(() => setLoadingComments(false));
    }
  };

  const submitComment = () => {
    const text = commentText.trim();
    if (!text || posting) return;
    setPosting(true);
    feed.addComment(item.id, text).then(c => {
      setComments(cur => [...cur, c]);
      setCommentText('');
      setPosting(false);
      onCommentAdded();
    }).catch(() => setPosting(false));
  };

  const getActivityText = () => {
    switch (item.activity_type) {
      case 'reaction': return t('feed.activityReaction');
      case 'progress_update': return t('feed.activityProgress', { percent: Math.round(item.metadata?.percent || 0) });
      case 'finished': return t('feed.activityFinished');
      case 'started': return t('feed.activityStarted');
      default: return t('feed.activityDefault');
    }
  };

  const accent = activityAccent(item.activity_type, colors);

  return (
    <View style={[styles.card, { borderLeftColor: accent.color }, !last && { marginBottom: 12 }]}>
      <View style={styles.cardHeader}>
        <TouchableOpacity onPress={() => onUserPress(item.user_id, item.username)}>
          <View style={[styles.avatar, { borderColor: accent.color }]}>
            <Text style={styles.avatarText}>{item.username?.slice(0, 2).toUpperCase()}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardMeta} onPress={() => onUserPress(item.user_id, item.username)}>
          <Text style={styles.username}>{item.username}</Text>
          <Text style={[styles.activityText, { color: accent.color }]}>{getActivityText()}</Text>
        </TouchableOpacity>
        <Text style={styles.timeAgo}>{timeAgo(item.created_at, t)}</Text>
      </View>

      {item.book_title ? (
        <TouchableOpacity style={styles.bookRow} activeOpacity={0.75}
          onPress={() => onBookPress(item.book_id)}>
          <View style={styles.bookCover}>
            {item.cover_url ? (
              <Image source={{ uri: item.cover_url }} style={styles.coverImg} />
            ) : (
              <Feather name="book" size={16} color={colors.purple} />
            )}
          </View>
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle} numberOfLines={1}>{item.book_title}</Text>
            <Text style={styles.bookAuthor} numberOfLines={1}>{item.book_author}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.gray} />
        </TouchableOpacity>
      ) : null}

      {item.activity_type === 'finished' ? (
        <View style={styles.finishedBox}>
          <Feather name="check-circle" size={16} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.finishedText}>
              {t('feed.finishedLabel')}{item.metadata?.rating ? ` · ${item.metadata.rating}★` : ''}
            </Text>
            {item.metadata?.comment ? <Text style={styles.finishedComment}>"{item.metadata.comment}"</Text> : null}
          </View>
        </View>
      ) : null}

      {item.activity_type === 'reaction' && item.emoji ? (
        <View style={styles.reactionBox}>
          <View style={[styles.reactionEmojiWrap, [...item.emoji].length > 1 && styles.reactionEmojiWrapMulti]}>
            <Text style={[styles.reactionEmoji, [...item.emoji].length > 2 && styles.reactionEmojiSmall]}>{item.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {item.note ? <Text style={styles.reactionNote}>{item.note}</Text> : null}
            {item.reaction_percent ? <Text style={styles.reactionMeta}>{t('feed.percentOfBook', { percent: Math.round(item.reaction_percent) })}</Text> : null}
          </View>
        </View>
      ) : null}

      {item.activity_type === 'progress_update' ? (
        <View style={styles.progressBox}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(item.metadata?.percent || 0, 100)}%` as any }]} />
          </View>
          <Text style={styles.progressText}>
            {Math.round(item.metadata?.percent || 0)}%
            {item.metadata?.current_page ? ` · ${t('feed.pageLabel', { page: item.metadata.current_page })}` : ''}
          </Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <TouchableOpacity style={[styles.actionBtn, item.liked_by_me && styles.actionBtnActive]} onPress={onLike} hitSlop={8}>
          <Feather name="heart" size={15} color={item.liked_by_me ? colors.error : colors.gray} />
          <Text style={[styles.actionCount, item.liked_by_me && { color: colors.error }]}>{item.like_count > 0 ? item.like_count : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, expanded && styles.actionBtnActive]} onPress={toggleComments} hitSlop={8}>
          <Feather name="message-circle" size={15} color={expanded ? colors.purple : colors.gray} />
          <Text style={[styles.actionCount, expanded && { color: colors.purple }]}>{item.comment_count > 0 ? item.comment_count : ''}</Text>
        </TouchableOpacity>
      </View>

      {expanded && (
        <View style={styles.commentsBox}>
          {loadingComments ? (
            <ActivityIndicator color={colors.purple} style={{ marginVertical: 8 }} />
          ) : (
            comments.map((c, i) => (
              <View key={c.id} style={[styles.commentRow, i < comments.length - 1 && styles.commentDivider]}>
                <Text style={styles.commentUser}>@{c.username}</Text>
                <Text style={styles.commentText}>{c.comment}</Text>
              </View>
            ))
          )}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder={t('feed.commentPlaceholder')}
              placeholderTextColor={colors.gray}
              onSubmitEditing={submitComment}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={submitComment} disabled={posting} hitSlop={8}>
              <Feather name="send" size={16} color={colors.purple} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function FeedScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleLike = (feedId: string) => {
    setFeedItems(cur => cur.map(it => it.id === feedId
      ? { ...it, liked_by_me: !it.liked_by_me, like_count: it.like_count + (it.liked_by_me ? -1 : 1) }
      : it));
    feed.toggleLike(feedId).catch(() => {
      setFeedItems(cur => cur.map(it => it.id === feedId
        ? { ...it, liked_by_me: !it.liked_by_me, like_count: it.like_count + (it.liked_by_me ? -1 : 1) }
        : it));
    });
  };

  const handleCommentAdded = (feedId: string) => {
    setFeedItems(cur => cur.map(it => it.id === feedId ? { ...it, comment_count: (it.comment_count ?? 0) + 1 } : it));
  };

  const loadFeed = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    feed.getFeed().then(res => {
      setFeedItems(res);
      setLoading(false);
      setRefreshing(false);
    }).catch(() => { setLoading(false); setRefreshing(false); });
  };

  useFocusEffect(useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    loadFeed();
  }, []));

  useEffect(() => onScrollToTop('feed', () => scrollRef.current?.scrollTo({ y: 0, animated: true })), []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t('feed.title')}</Text>
          <Text style={styles.subtitle}>{t('feed.subtitle')}</Text>
        </View>
        <NotificationBell />
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadFeed(true)} tintColor={colors.purple} />}>
        {loading && <Text style={styles.loadingText}>{t('feed.loading')}</Text>}

        {!loading && feedItems.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={40} color={colors.gray} />
            <Text style={styles.emptyTitle}>{t('feed.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('feed.emptyText')}</Text>
          </View>
        )}

        {feedItems.map((item, i) => (
          <View key={i}>
            <ActivityCard item={item} styles={styles} colors={colors} last={i === feedItems.length - 1}
              onUserPress={(userId, username) => router.push({ pathname: '/friends/[id]', params: { id: userId, username } })}
              onBookPress={(bookId) => router.push(`/book/${bookId}`)}
              onLike={() => handleLike(item.id)}
              onCommentAdded={() => handleCommentAdded(item.id)}
            />
            {/* Every 5 posts — AdBanner itself no-ops without consent/ids, so
                this stays cheap to always render. */}
            {(i + 1) % 5 === 0 && <AdBanner />}
          </View>
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 28, paddingBottom: 14 },
  title: { fontSize: 19, fontFamily: fonts.headingBold, color: colors.white },
  subtitle: { fontSize: 12, color: colors.gray, marginTop: 2 },
  scroll: { flex: 1, paddingHorizontal: 14 },
  loadingText: { color: colors.gray, textAlign: 'center', paddingTop: 40 },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.white },
  emptyText: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 40 },
  card: {
    padding: 16, backgroundColor: colors.card, borderRadius: radius.md,
    borderLeftWidth: 3, ...shadows.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.purpleGlow,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1.5,
  },
  avatarText: { fontSize: 12, fontWeight: '700', color: colors.lavender },
  cardMeta: { flex: 1 },
  username: { fontSize: 13, fontWeight: '700', color: colors.white },
  activityText: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  timeAgo: { fontSize: 10, color: colors.gray, flexShrink: 0 },
  bookRow: { flexDirection: 'row', gap: 10, backgroundColor: colors.card2, borderRadius: radius.sm, padding: 10, alignItems: 'center', marginBottom: 8 },
  bookCover: { width: 34, height: 48, backgroundColor: colors.bg, borderRadius: 5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...shadows.card },
  coverImg: { width: 34, height: 48 },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 13, fontWeight: '600', color: colors.white },
  bookAuthor: { fontSize: 11, color: colors.gray, marginTop: 2 },
  finishedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.purpleGlow, borderRadius: radius.sm, padding: 10 },
  finishedText: { color: colors.success, fontSize: 13, fontWeight: '700' },
  finishedComment: { color: colors.gray, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  reactionBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.purpleGlow, borderRadius: radius.sm, padding: 10 },
  reactionEmojiWrap: { minWidth: 40, height: 40, paddingHorizontal: 8, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reactionEmojiWrapMulti: { borderRadius: 14 },
  reactionEmoji: { fontSize: 22 },
  reactionEmojiSmall: { fontSize: 16 },
  reactionNote: { flex: 1, fontSize: 13, color: colors.white },
  reactionMeta: { fontSize: 10, color: colors.gray },
  progressBox: { gap: 6, backgroundColor: colors.card2, borderRadius: radius.sm, padding: 10 },
  progressBar: { height: 6, backgroundColor: colors.bg, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.teal, borderRadius: 3 },
  progressText: { fontSize: 11, color: colors.teal, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
  actionBtnActive: { backgroundColor: colors.purpleGlow },
  actionCount: { fontSize: 12, color: colors.gray, fontWeight: '600', minWidth: 8 },
  commentsBox: { marginTop: 10, backgroundColor: colors.card2, borderRadius: radius.sm, padding: 10, gap: 8 },
  commentRow: { paddingBottom: 8, gap: 2 },
  commentDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  commentUser: { fontSize: 11, fontWeight: '700', color: colors.white },
  commentText: { fontSize: 12, color: colors.muted },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commentInput: { flex: 1, minWidth: 0, color: colors.white, fontSize: 13, paddingVertical: 4 },
});
