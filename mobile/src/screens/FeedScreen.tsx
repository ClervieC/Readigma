import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, RefreshControl, Image
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { feedService } from '../services/feed.service';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'À l\'instant';
  if (mins < 60) return `Il y a ${mins}min`;
  if (hours < 24) return `Il y a ${hours}h`;
  return `Il y a ${days}j`;
}

function ActivityCard({ item }: { item: any }) {
  const getActivityText = () => {
    switch (item.activity_type) {
      case 'reaction':
        return `a réagi à sa lecture`;
      case 'progress_update':
        const meta = item.metadata;
        return `a lu ${Math.round(meta?.percent || 0)}% de`;
      case 'finished':
        return `a terminé 🎉`;
      case 'started':
        return `a commencé à lire`;
      default:
        return `a mis à jour`;
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.username?.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.username}>{item.username}</Text>
          <Text style={styles.activityText}>{getActivityText()}</Text>
        </View>
        <Text style={styles.timeAgo}>{timeAgo(item.created_at)}</Text>
      </View>

      {item.book_title && (
        <View style={styles.bookRow}>
          <View style={styles.bookCover}>
            {item.cover_url ? (
              <Image source={{ uri: item.cover_url }} style={styles.coverImg} />
            ) : (
              <Text style={{ fontSize: 20 }}>📚</Text>
            )}
          </View>
          <View style={styles.bookInfo}>
            <Text style={styles.bookTitle} numberOfLines={1}>{item.book_title}</Text>
            <Text style={styles.bookAuthor} numberOfLines={1}>{item.book_author}</Text>
          </View>
        </View>
      )}

      {item.activity_type === 'finished' && (
        <View style={styles.finishedBox}>
            <Text style={styles.finishedText}>
            🎉 Livre terminé !
            {item.metadata?.rating ? ` · ${item.metadata.rating}⭐` : ''}
            </Text>
            {item.metadata?.comment && (
            <Text style={styles.finishedComment}>"{item.metadata.comment}"</Text>
            )}
        </View>
        )}

      {item.activity_type === 'reaction' && item.emoji && (
        <View style={styles.reactionBox}>
          <Text style={styles.reactionEmoji}>{item.emoji}</Text>
          {item.note && <Text style={styles.reactionNote}>{item.note}</Text>}
          {item.reaction_percent && (
            <Text style={styles.reactionMeta}>à {Math.round(item.reaction_percent)}% du livre</Text>
          )}
        </View>
      )}

      {item.activity_type === 'progress_update' && (
        <View style={styles.progressBox}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, {
              width: `${Math.min(item.metadata?.percent || 0, 100)}%` as any
            }]} />
          </View>
          <Text style={styles.progressText}>
            {Math.round(item.metadata?.percent || 0)}%
            {item.metadata?.current_page ? ` · Page ${item.metadata.current_page}` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function FeedScreen() {
  const [feed, setFeed] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadFeed = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    
    feedService.getFeed().then(res => {
      setFeed(res.data);
      setLoading(false);
      setRefreshing(false);
    }).catch(() => {
      setLoading(false);
      setRefreshing(false);
    });
  };

  useFocusEffect(
    useCallback(() => { loadFeed(); }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Feed</Text>
        <Text style={styles.subtitle}>Activités de tes amis</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadFeed(true)}
            tintColor={colors.purple}
          />
        }
      >
        {loading && (
          <Text style={styles.loadingText}>Chargement...</Text>
        )}

        {!loading && feed.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>Rien pour l'instant</Text>
            <Text style={styles.emptyText}>
              Ajoute des amis pour voir leur activité ici !
            </Text>
          </View>
        )}

        {feed.map((item, i) => (
          <ActivityCard key={i} item={item} />
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', color: colors.white },
  subtitle: { fontSize: 12, color: colors.gray, marginTop: 2 },
  scroll: { flex: 1, paddingHorizontal: 16 },
  loadingText: { color: colors.gray, textAlign: 'center', paddingTop: 40 },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  emptyText: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg, padding: 14,
    marginTop: 12,
    borderWidth: 1, borderColor: colors.divider,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(108,92,231,0.3)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: colors.lavender },
  cardMeta: { flex: 1 },
  username: { fontSize: 13, fontWeight: '700', color: colors.white },
  activityText: { fontSize: 11, color: colors.gray, marginTop: 1 },
  timeAgo: { fontSize: 10, color: colors.gray, flexShrink: 0 },
  bookRow: {
    flexDirection: 'row', gap: 10,
    backgroundColor: colors.card2,
    borderRadius: radius.sm, padding: 10,
    alignItems: 'center', marginBottom: 8,
  },
  bookCover: {
    width: 36, height: 48,
    backgroundColor: colors.bg,
    borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  finishedBox: {
    backgroundColor: 'rgba(108,92,231,0.1)',
    borderRadius: radius.sm, padding: 10,
    borderWidth: 1, borderColor: 'rgba(108,92,231,0.3)',
    },
    finishedText: { color: colors.lavender, fontSize: 13, fontWeight: '600' },
    finishedComment: { color: colors.gray, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  coverImg: { width: 36, height: 48 },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 13, fontWeight: '600', color: colors.white },
  bookAuthor: { fontSize: 11, color: colors.gray, marginTop: 2 },
  reactionBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(108,92,231,0.1)',
    borderRadius: radius.sm, padding: 10,
    borderWidth: 1, borderColor: 'rgba(108,92,231,0.2)',
  },
  reactionEmoji: { fontSize: 28 },
  reactionNote: { flex: 1, fontSize: 13, color: colors.white },
  reactionMeta: { fontSize: 10, color: colors.gray },
  progressBox: { gap: 6 },
  progressBar: {
    height: 6, backgroundColor: colors.card2,
    borderRadius: 3, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.teal, borderRadius: 3 },
  progressText: { fontSize: 11, color: colors.teal },
});