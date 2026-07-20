import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as follows from '../../lib/follows';
import Row from '../../components/Row';
import Pill from '../../components/Pill';

export default function FollowsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  // Lets the profile screen's "Abonnements"/"Abonnés" counts deep-link
  // straight to the matching tab instead of always landing on "following".
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [tab, setTab] = useState<'following' | 'followers' | 'search'>(
    initialTab === 'followers' ? 'followers' : 'following',
  );

  useFocusEffect(useCallback(() => { loadFollowing(); loadFollowers(); }, []));

  const loadFollowing = () => { follows.getFollowing().then(setFollowing).catch(() => {}); };
  const loadFollowers = () => { follows.getFollowers().then(setFollowers).catch(() => {}); };
  const search = () => { if (!query.trim()) return; follows.searchUsers(query).then(setResults).catch(() => {}); };

  const followingIds = new Set(following.map((f) => f.id));

  const toggleFollow = (userId: string, username: string) => {
    const action = followingIds.has(userId) ? follows.unfollowUser(userId) : follows.followUser(userId);
    action.then(loadFollowing).catch(() =>
      Alert.alert(t('common.error'), followingIds.has(userId) ? t('follows.errors.unfollow') : t('follows.errors.follow', { username }))
    );
  };

  const goToProfile = (id: string, username: string) => router.push({ pathname: '/friends/[id]', params: { id, username } });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color={colors.white} /></TouchableOpacity>
        <Text style={styles.headerTitle}>{t('follows.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.tabs}>
        <Pill label={`${t('follows.following')}${following.length ? ` (${following.length})` : ''}`} active={tab === 'following'} onPress={() => setTab('following')} />
        <Pill label={`${t('follows.followers')}${followers.length ? ` (${followers.length})` : ''}`} active={tab === 'followers'} onPress={() => setTab('followers')} />
        <Pill label={t('follows.search')} active={tab === 'search'} onPress={() => setTab('search')} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'search' && (
          <>
            <View style={styles.searchBar}>
              <Feather name="search" size={17} color={colors.gray} />
              <TextInput style={styles.searchInput} value={query} onChangeText={setQuery}
                placeholder={t('follows.searchPlaceholder')} placeholderTextColor={colors.gray}
                returnKeyType="search" onSubmitEditing={search} autoCapitalize="none" />
            </View>
            {results.map((user, i) => (
              <Row key={i} last={i === results.length - 1} onPress={() => goToProfile(user.id, user.username)}
                icon={<View style={styles.userAvatar}><Text style={styles.userAvatarText}>{user.username?.slice(0, 2).toUpperCase()}</Text></View>}
                right={
                  <TouchableOpacity style={[styles.addBtn, followingIds.has(user.id) && styles.addBtnSent]}
                    onPress={() => toggleFollow(user.id, user.username)}>
                    <Text style={styles.addBtnText}>{followingIds.has(user.id) ? t('follows.followed') : t('follows.follow')}</Text>
                  </TouchableOpacity>
                }>
                <Text style={styles.userName}>@{user.username}</Text>
                <Text style={styles.userBooks}>{t('follows.booksReadCount', { count: user.books_count })}</Text>
              </Row>
            ))}
            {results.length === 0 && query && <Text style={styles.emptyText}>{t('follows.noReaderFound')}</Text>}
          </>
        )}

        {tab === 'following' && (
          <>
            {following.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="users" size={36} color={colors.gray} />
                <Text style={styles.emptyTitle}>{t('follows.notFollowingAnyone')}</Text>
                <Text style={styles.emptyText}>{t('follows.searchToFollow')}</Text>
                <TouchableOpacity style={styles.emptyCta} onPress={() => setTab('search')}>
                  <Feather name="search" size={14} color={colors.purple} />
                  <Text style={styles.emptyCtaText}>{t('follows.searchReaders')}</Text>
                </TouchableOpacity>
              </View>
            ) : following.map((user, i) => (
              <Row key={i} last={i === following.length - 1} onPress={() => goToProfile(user.id, user.username)}
                icon={<View style={styles.userAvatar}><Text style={styles.userAvatarText}>{user.username?.slice(0, 2).toUpperCase()}</Text></View>}
                right={
                  <TouchableOpacity style={styles.addBtnSent} onPress={() => toggleFollow(user.id, user.username)}>
                    <Text style={styles.addBtnText}>{t('follows.followed')}</Text>
                  </TouchableOpacity>
                }>
                <Text style={styles.userName}>@{user.username}</Text>
                <Text style={styles.userBooks}>{t('follows.booksReadCount', { count: user.books_count })}</Text>
              </Row>
            ))}
          </>
        )}

        {tab === 'followers' && (
          <>
            {followers.length === 0 ? (
              <Text style={styles.emptyText}>{t('follows.noFollowersYet')}</Text>
            ) : followers.map((user, i) => (
              <Row key={i} last={i === followers.length - 1} onPress={() => goToProfile(user.id, user.username)}
                icon={<View style={styles.userAvatar}><Text style={styles.userAvatarText}>{user.username?.slice(0, 2).toUpperCase()}</Text></View>}
                right={
                  user.followed_back ? undefined : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => toggleFollow(user.id, user.username)}>
                      <Text style={styles.addBtnText}>{t('follows.followBack')}</Text>
                    </TouchableOpacity>
                  )
                }>
                <Text style={styles.userName}>@{user.username}</Text>
                <Text style={styles.userBooks}>{t('follows.booksReadCount', { count: user.books_count })}</Text>
              </Row>
            ))}
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
  headerTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.white },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 16 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: colors.divider, paddingVertical: 10, marginBottom: 16 },
  searchInput: { flex: 1, color: colors.white, fontSize: 15 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.purpleGlow, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 14, fontWeight: '700', color: colors.lavender },
  userName: { fontSize: 14, fontWeight: '600', color: colors.white },
  userBooks: { fontSize: 11, color: colors.gray, marginTop: 2 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.purple, borderRadius: 20 },
  addBtnSent: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.purpleGlow, borderRadius: 20 },
  addBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.white },
  emptyText: { color: colors.gray, fontSize: 13, textAlign: 'center', paddingTop: 8 },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
    borderWidth: 1, borderColor: colors.divider, borderRadius: 999,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  emptyCtaText: { fontSize: 13, fontWeight: '600', color: colors.purple },
});
