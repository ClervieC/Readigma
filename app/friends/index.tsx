import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as friends from '../../lib/friends';
import Row from '../../components/Row';
import Pill from '../../components/Pill';
import Button from '../../components/Button';

export default function FriendsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'search' | 'friends' | 'pending'>('friends');

  useFocusEffect(useCallback(() => { loadFriends(); loadPending(); }, []));

  const loadFriends = () => { friends.getFriends().then(setFriendsList).catch(() => {}); };
  const loadPending = () => { friends.getPendingRequests().then(setPending).catch(() => {}); };
  const search = () => { if (!query.trim()) return; friends.searchUsers(query).then(setResults).catch(() => {}); };

  const sendRequest = (userId: string, username: string) => {
    friends.sendRequest(userId).then(() => {
      setSentRequests(new Set([...sentRequests, userId]));
      Alert.alert('✅', `Demande envoyée à ${username} !`);
    }).catch(() => Alert.alert('Erreur', 'Impossible d\'envoyer la demande'));
  };

  const acceptRequest = (id: string) => {
    friends.acceptRequest(id).then(() => { loadFriends(); loadPending(); }).catch(() => Alert.alert('Erreur', 'Impossible d\'accepter'));
  };

  const goToProfile = (id: string, username: string) => router.push({ pathname: '/friends/[id]', params: { id, username } });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={20} color={colors.white} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Amis lecteurs</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.tabs}>
        <Pill label="Mes amis" active={tab === 'friends'} onPress={() => setTab('friends')} />
        <Pill label="Chercher" active={tab === 'search'} onPress={() => setTab('search')} />
        <Pill label={`Demandes${pending.length ? ` (${pending.length})` : ''}`} active={tab === 'pending'} onPress={() => setTab('pending')} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'search' && (
          <>
            <View style={styles.searchBar}>
              <Feather name="search" size={17} color={colors.gray} />
              <TextInput style={styles.searchInput} value={query} onChangeText={setQuery}
                placeholder="Chercher un lecteur..." placeholderTextColor={colors.gray}
                returnKeyType="search" onSubmitEditing={search} autoCapitalize="none" />
            </View>
            {results.map((user, i) => (
              <Row key={i} last={i === results.length - 1} onPress={() => goToProfile(user.id, user.username)}
                icon={<View style={styles.userAvatar}><Text style={styles.userAvatarText}>{user.username?.slice(0, 2).toUpperCase()}</Text></View>}
                right={
                  <TouchableOpacity style={[styles.addBtn, sentRequests.has(user.id) && styles.addBtnSent]}
                    onPress={() => sendRequest(user.id, user.username)} disabled={sentRequests.has(user.id)}>
                    <Text style={styles.addBtnText}>{sentRequests.has(user.id) ? 'Envoyé' : 'Suivre'}</Text>
                  </TouchableOpacity>
                }>
                <Text style={styles.userName}>@{user.username}</Text>
                <Text style={styles.userBooks}>{user.books_count} livres lus</Text>
              </Row>
            ))}
            {results.length === 0 && query && <Text style={styles.emptyText}>Aucun lecteur trouvé</Text>}
          </>
        )}

        {tab === 'friends' && (
          <>
            {friendsList.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="users" size={36} color={colors.gray} />
                <Text style={styles.emptyTitle}>Pas encore d'amis</Text>
                <Text style={styles.emptyText}>Cherche des lecteurs pour les ajouter !</Text>
                <Button label="Chercher des lecteurs" onPress={() => setTab('search')} style={{ marginTop: 8 }} />
              </View>
            ) : friendsList.map((friend, i) => (
              <Row key={i} last={i === friendsList.length - 1} onPress={() => goToProfile(friend.id, friend.username)} chevron
                icon={<View style={styles.userAvatar}><Text style={styles.userAvatarText}>{friend.username?.slice(0, 2).toUpperCase()}</Text></View>}>
                <Text style={styles.userName}>@{friend.username}</Text>
                <Text style={styles.userBooks}>{friend.books_count} livres lus</Text>
              </Row>
            ))}
          </>
        )}

        {tab === 'pending' && (
          <>
            {pending.length === 0 ? (
              <Text style={styles.emptyText}>Aucune demande en attente</Text>
            ) : pending.map((req, i) => (
              <Row key={i} last={i === pending.length - 1}
                icon={<View style={styles.userAvatar}><Text style={styles.userAvatarText}>{req.username?.slice(0, 2).toUpperCase()}</Text></View>}
                right={
                  <TouchableOpacity style={styles.addBtn} onPress={() => acceptRequest(req.id)}>
                    <Text style={styles.addBtnText}>Accepter</Text>
                  </TouchableOpacity>
                }>
                <Text style={styles.userName}>@{req.username}</Text>
                <Text style={styles.userBooks}>veut être ton ami</Text>
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
  addBtnSent: { backgroundColor: colors.purpleGlow },
  addBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.white },
  emptyText: { color: colors.gray, fontSize: 13, textAlign: 'center', paddingTop: 8 },
});
