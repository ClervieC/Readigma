import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  SafeAreaView, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { colors, radius } from '../theme';
import { friendsService } from '../services/friends.service';

export default function UserProfileScreen({ route, navigation }: any) {
  const { userId, username } = route.params;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    friendsService.getUserProfile(userId)
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{username ?? 'Profil'}</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.loader}>
          <ActivityIndicator color={colors.lavender} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>← Retour</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loader}>
          <Text style={styles.errorText}>Impossible de charger ce profil</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { user, stats, currentlyReading } = data;
  const initials = user.username?.slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <Text style={styles.name}>{user.username}</Text>
          <Text style={styles.handle}>@{user.username?.toLowerCase()}</Text>
        </View>

        {/* Stats */}
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

        {/* Currently reading */}
        {currentlyReading.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📖 En ce moment</Text>
            {currentlyReading.map((book: any, i: number) => (
              <View key={i} style={styles.bookCard}>
                <View style={styles.bookCover}>
                  <Text style={{ fontSize: 28 }}>📚</Text>
                </View>
                <View style={styles.bookInfo}>
                  <Text style={styles.bookTitle} numberOfLines={2}>{book.title}</Text>
                  <Text style={styles.bookAuthor}>{book.author}</Text>
                  {book.genres?.[0] && (
                    <View style={styles.genreBadge}>
                      <Text style={styles.genreText}>{book.genres[0]}</Text>
                    </View>
                  )}
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
            ))}
          </View>
        )}

        {currentlyReading.length === 0 && (
          <View style={styles.emptyReading}>
            <Text style={styles.emptyReadingText}>@{user.username} ne lit rien en ce moment</Text>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  backBtn: { fontSize: 14, color: colors.lavender, fontWeight: '500' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.gray, fontSize: 14 },
  scroll: { flex: 1, paddingHorizontal: 16 },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  avatar: { width: 80, height: 80, borderRadius: 40 },
  avatarPlaceholder: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.purple,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: 'white' },
  name: { fontSize: 20, fontWeight: '800', color: colors.white, marginTop: 4 },
  handle: { fontSize: 13, color: colors.gray },
  statsRow: {
    flexDirection: 'row', gap: 8, marginBottom: 20,
  },
  statBox: {
    flex: 1, backgroundColor: colors.card,
    borderRadius: radius.md, padding: 12,
    alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.divider,
  },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 9, color: colors.gray, fontWeight: '500' },
  section: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.divider,
    padding: 16, marginBottom: 16,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginBottom: 14 },
  bookCard: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    paddingBottom: 14, marginBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  bookCover: {
    width: 56, height: 76, backgroundColor: colors.card2,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginBottom: 3 },
  bookAuthor: { fontSize: 12, color: colors.gray, marginBottom: 6 },
  genreBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34,211,238,0.1)',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 20, marginBottom: 8,
  },
  genreText: { fontSize: 10, color: colors.cyan },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBar: {
    flex: 1, height: 4, backgroundColor: colors.card2,
    borderRadius: 2, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.cyan, borderRadius: 2 },
  progressText: { fontSize: 11, color: colors.cyan, fontWeight: '600', width: 32 },
  emptyReading: {
    backgroundColor: colors.card, borderRadius: radius.md,
    padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: colors.divider,
    marginBottom: 16,
  },
  emptyReadingText: { fontSize: 13, color: colors.gray, textAlign: 'center' },
});
