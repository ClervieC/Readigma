import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, TextInput, Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, radius } from '../theme';
import { friendsService } from '../services/friends.service';

export default function FriendsScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'search' | 'friends' | 'pending'>('friends');

  useFocusEffect(
    useCallback(() => {
      loadFriends();
      loadPending();
    }, [])
  );

  const loadFriends = () => {
    friendsService.getFriends().then(res => setFriends(res.data)).catch(() => {});
  };

  const loadPending = () => {
    friendsService.getPendingRequests().then(res => setPending(res.data)).catch(() => {});
  };

  const search = () => {
    if (!query.trim()) return;
    friendsService.searchUsers(query).then(res => setResults(res.data)).catch(() => {});
  };

  const sendRequest = (userId: string, username: string) => {
    friendsService.sendRequest(userId).then(() => {
      setSentRequests(new Set([...sentRequests, userId]));
      Alert.alert('✅', `Demande envoyée à ${username} !`);
    }).catch(() => Alert.alert('Erreur', 'Impossible d\'envoyer la demande'));
  };

  const acceptRequest = (id: string) => {
    friendsService.acceptRequest(id).then(() => {
      loadFriends();
      loadPending();
    }).catch(() => Alert.alert('Erreur', 'Impossible d\'accepter'));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Amis lecteurs</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.tabs}>
        {[
          { label: 'Mes amis', value: 'friends' },
          { label: 'Chercher', value: 'search' },
          { label: `Demandes${pending.length ? ` (${pending.length})` : ''}`, value: 'pending' },
        ].map(t => (
          <TouchableOpacity
            key={t.value}
            style={[styles.tab, tab === t.value && styles.tabActive]}
            onPress={() => setTab(t.value as any)}
          >
            <Text style={[styles.tabText, tab === t.value && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'search' && (
          <>
            <View style={styles.searchBar}>
              <Text style={{ fontSize: 18, color: colors.gray }}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Chercher un lecteur..."
                placeholderTextColor={colors.gray}
                returnKeyType="search"
                onSubmitEditing={search}
                autoCapitalize="none"
              />
            </View>
            {results.map((user, i) => (
              <TouchableOpacity
                key={i}
                style={styles.userItem}
                onPress={() => navigation.getParent()?.navigate('UserProfile', { userId: user.id, username: user.username })}
                activeOpacity={0.75}
              >
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {user.username?.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>@{user.username}</Text>
                  <Text style={styles.userBooks}>{user.books_count} livres lus</Text>
                </View>
                <TouchableOpacity
                  style={[styles.addBtn, sentRequests.has(user.id) && styles.addBtnSent]}
                  onPress={() => sendRequest(user.id, user.username)}
                  disabled={sentRequests.has(user.id)}
                >
                  <Text style={styles.addBtnText}>
                    {sentRequests.has(user.id) ? '✓ Envoyé' : '+ Suivre'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            {results.length === 0 && query && (
              <Text style={styles.emptyText}>Aucun lecteur trouvé</Text>
            )}
          </>
        )}

        {tab === 'friends' && (
          <>
            {friends.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>👥</Text>
                <Text style={styles.emptyTitle}>Pas encore d'amis</Text>
                <Text style={styles.emptyText}>Cherche des lecteurs pour les ajouter !</Text>
                <TouchableOpacity style={styles.searchBtn} onPress={() => setTab('search')}>
                  <Text style={styles.searchBtnText}>Chercher des lecteurs</Text>
                </TouchableOpacity>
              </View>
            ) : friends.map((friend, i) => (
              <TouchableOpacity
                key={i}
                style={styles.userItem}
                onPress={() => navigation.getParent()?.navigate('UserProfile', { userId: friend.id, username: friend.username })}
                activeOpacity={0.75}
              >
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {friend.username?.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>@{friend.username}</Text>
                  <Text style={styles.userBooks}>{friend.books_count} livres lus</Text>
                </View>
                <Text style={{ color: colors.gray, fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {tab === 'pending' && (
          <>
            {pending.length === 0 ? (
              <Text style={styles.emptyText}>Aucune demande en attente</Text>
            ) : pending.map((req, i) => (
              <View key={i} style={styles.userItem}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {req.username?.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>@{req.username}</Text>
                  <Text style={styles.userBooks}>veut être ton ami</Text>
                </View>
                <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(req.id)}>
                  <Text style={styles.acceptBtnText}>Accepter</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 20 }} />
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
  tabs: {
    flexDirection: 'row', backgroundColor: colors.card,
    borderRadius: radius.md, padding: 4, margin: 16,
  },
  tab: { flex: 1, padding: 8, borderRadius: 12, alignItems: 'center' },
  tabActive: { backgroundColor: colors.purple },
  tabText: { fontSize: 11, color: colors.gray, fontWeight: '500' },
  tabTextActive: { color: 'white' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: radius.md,
    padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: colors.divider,
  },
  searchInput: { flex: 1, color: colors.white, fontSize: 15 },
  userItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, backgroundColor: colors.card,
    borderRadius: radius.md, marginBottom: 8,
    borderWidth: 1, borderColor: colors.divider,
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(108,92,231,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { fontSize: 16, fontWeight: '700', color: colors.lavender },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '600', color: colors.white },
  userBooks: { fontSize: 11, color: colors.gray, marginTop: 2 },
  addBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: colors.purple, borderRadius: 20,
  },
  addBtnSent: { backgroundColor: 'rgba(108,92,231,0.2)', borderWidth: 1, borderColor: colors.purple },
  addBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  acceptBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: colors.teal, borderRadius: 20,
  },
  acceptBtnText: { color: colors.bg, fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  emptyText: { color: colors.gray, fontSize: 13, textAlign: 'center', paddingTop: 20 },
  searchBtn: {
    backgroundColor: colors.purple, paddingHorizontal: 20,
    paddingVertical: 10, borderRadius: 20, marginTop: 8,
  },
  searchBtnText: { color: 'white', fontSize: 13, fontWeight: '600' },
});