import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Platform } from 'react-native';
import { useFocusEffect, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import * as admin from '../lib/admin';
import Screen from '../components/Screen';
import Pill from '../components/Pill';
import Button from '../components/Button';
import BookForm, { BookFormFields, EMPTY_BOOK_FORM } from '../components/BookForm';

const TABS = [
  { label: 'Utilisateurs', value: 'users' },
  { label: 'Messages', value: 'messages' },
  { label: 'Suggestions', value: 'suggestions' },
  { label: 'Ajouter un livre', value: 'add' },
] as const;

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  if (hours < 24) return `Il y a ${hours}h`;
  return `Il y a ${days}j`;
}

export default function AdminScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const styles = makeStyles(colors);
  const [tab, setTab] = useState<typeof TABS[number]['value']>('users');
  const [messages, setMessages] = useState<admin.AdminMessage[]>([]);
  const [suggestions, setSuggestions] = useState<admin.BookSuggestion[]>([]);
  const [users, setUsers] = useState<admin.AdminUser[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState<BookFormFields>(EMPTY_BOOK_FORM);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([admin.getMessages(), admin.getSuggestions(), admin.getAllUsers()])
      .then(([m, s, u]) => { setMessages(m); setSuggestions(s); setUsers(u); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (profile && profile.role !== 'admin') return <Redirect href="/(tabs)/profile" />;

  const openMessage = (m: admin.AdminMessage) => {
    if (m.status === 'unread') {
      admin.markMessageRead(m.id).then(() => setMessages(cur => cur.map(x => x.id === m.id ? { ...x, status: 'read' } : x)));
    }
  };

  const sendReply = (m: admin.AdminMessage) => {
    const reply = (replyDrafts[m.id] ?? '').trim();
    if (!reply) return;
    setSendingReplyId(m.id);
    admin.replyToMessage(m.id, reply)
      .then(() => {
        setMessages(cur => cur.map(x => x.id === m.id ? { ...x, status: 'replied', reply, replied_at: new Date().toISOString() } : x));
        setReplyDrafts(cur => { const next = { ...cur }; delete next[m.id]; return next; });
      })
      .catch(() => Alert.alert('Erreur', "Impossible d'envoyer la réponse"))
      .finally(() => setSendingReplyId(null));
  };

  const quickApprove = (s: admin.BookSuggestion) => {
    admin.approveSuggestion(s)
      .then(() => setSuggestions(cur => cur.map(x => x.id === s.id ? { ...x, status: 'approved' } : x)))
      .catch((e) => Alert.alert('Erreur', e.message || "Impossible d'ajouter ce livre"));
  };

  const reject = (s: admin.BookSuggestion) => {
    admin.rejectSuggestion(s).then(() => setSuggestions(cur => cur.map(x => x.id === s.id ? { ...x, status: 'rejected' } : x)));
  };

  const editThenApprove = (s: admin.BookSuggestion) => {
    setBook(admin.suggestionToForm(s));
    setEditingSuggestionId(s.id);
    setTab('add');
  };

  const toggleBan = (u: admin.AdminUser) => {
    const next = !u.banned;
    const apply = () => {
      admin.setUserBanned(u.id, next)
        .then(() => setUsers(cur => cur.map(x => x.id === u.id ? { ...x, banned: next } : x)))
        .catch(() => Alert.alert('Erreur', "Impossible de mettre à jour cet utilisateur"));
    };
    if (!next) { apply(); return; }
    // RN Web's Alert.alert only ever renders a single-button window.alert —
    // a destructive-style multi-button config like this one is silently
    // dropped there, so a real confirm() is needed on web (same fix as
    // library.tsx's remove-book confirm).
    if (Platform.OS === 'web') {
      if (window.confirm(`Bannir @${u.username} ? Il ne pourra plus se connecter.`)) apply();
      return;
    }
    Alert.alert('Bannir cet utilisateur ?', `@${u.username} ne pourra plus se connecter à Readigma.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Bannir', style: 'destructive', onPress: apply },
    ]);
  };

  const toggleRole = (u: admin.AdminUser) => {
    const nextRole = u.role === 'admin' ? 'user' : 'admin';
    admin.setUserRole(u.id, nextRole)
      .then(() => setUsers(cur => cur.map(x => x.id === u.id ? { ...x, role: nextRole } : x)))
      .catch(() => Alert.alert('Erreur', "Impossible de mettre à jour cet utilisateur"));
  };

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(userQuery.trim().toLowerCase()));

  const saveBook = () => {
    if (!book.title.trim()) { Alert.alert('Erreur', 'Le titre est requis'); return; }
    setSaving(true);
    admin.addBookManually(book).then(async () => {
      if (editingSuggestionId) {
        await admin.markSuggestionApproved(editingSuggestionId);
        setSuggestions(cur => cur.map(x => x.id === editingSuggestionId ? { ...x, status: 'approved' } : x));
        setEditingSuggestionId(null);
      }
      setSaving(false);
      setBook(EMPTY_BOOK_FORM);
      Alert.alert('Ajouté', `"${book.title}" a été ajouté au catalogue.`);
    }).catch((e) => { setSaving(false); Alert.alert('Erreur', e.message || "Impossible d'ajouter ce livre"); });
  };

  return (
    <Screen back title="Administration" scroll={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: 8 }}>
        {TABS.map(t => (
          <Pill key={t.value} active={tab === t.value} onPress={() => setTab(t.value)} label={t.label} />
        ))}
      </ScrollView>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'users' && (
          <>
            <View style={styles.userSearchBar}>
              <Feather name="search" size={15} color={colors.gray} />
              <TextInput
                style={styles.userSearchInput}
                value={userQuery}
                onChangeText={setUserQuery}
                placeholder="Chercher un utilisateur..."
                placeholderTextColor={colors.gray}
                autoCapitalize="none"
              />
            </View>
            {loading ? <Text style={styles.emptyText}>Chargement...</Text> :
            filteredUsers.length === 0 ? <Text style={styles.emptyText}>Aucun utilisateur.</Text> :
            filteredUsers.map((u, i) => (
              <View key={u.id} style={[styles.card, i < filteredUsers.length - 1 && styles.cardDivider]}>
                <View style={styles.userRow}>
                  {u.avatar_url ? <Image source={{ uri: u.avatar_url }} style={styles.userAvatarImg} /> : (
                    <View style={styles.userAvatar}><Text style={styles.userAvatarText}>{u.username.slice(0, 2).toUpperCase()}</Text></View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.cardUser}>@{u.username}</Text>
                      {u.role === 'admin' && <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>Admin</Text></View>}
                      {u.banned && <View style={styles.bannedBadge}><Text style={styles.bannedBadgeText}>Banni</Text></View>}
                    </View>
                  </View>
                </View>
                <View style={styles.userActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => toggleRole(u)} disabled={u.id === profile?.id}>
                    <Feather name="shield" size={13} color={u.id === profile?.id ? colors.gray : colors.purple} />
                    <Text style={[styles.actionText, u.id === profile?.id && { color: colors.gray }]}>
                      {u.role === 'admin' ? 'Rétrograder' : 'Promouvoir admin'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => toggleBan(u)} disabled={u.id === profile?.id}>
                    <Feather name={u.banned ? 'user-check' : 'slash'} size={13} color={u.id === profile?.id ? colors.gray : colors.error} />
                    <Text style={[styles.actionText, { color: u.id === profile?.id ? colors.gray : colors.error }]}>
                      {u.banned ? 'Débannir' : 'Bannir'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === 'messages' && (
          loading ? <Text style={styles.emptyText}>Chargement...</Text> :
          messages.length === 0 ? <Text style={styles.emptyText}>Aucun message.</Text> :
          messages.map((m, i) => (
            <TouchableOpacity key={m.id} style={[styles.card, i < messages.length - 1 && styles.cardDivider]} activeOpacity={1} onPress={() => openMessage(m)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardUser}>@{m.username ?? '?'}</Text>
                {m.status === 'unread' && <View style={styles.unreadDot} />}
                <Text style={styles.cardTime}>{timeAgo(m.created_at)}</Text>
              </View>
              <Text style={styles.cardBody}>{m.message}</Text>
              {m.status === 'replied' ? (
                <View style={styles.replyBox}>
                  <Text style={styles.replyLabel}>Ta réponse</Text>
                  <Text style={styles.replyText}>{m.reply}</Text>
                </View>
              ) : (
                <View style={styles.replyForm}>
                  <TextInput
                    style={styles.replyInput}
                    value={replyDrafts[m.id] ?? ''}
                    onChangeText={t => setReplyDrafts(cur => ({ ...cur, [m.id]: t }))}
                    placeholder="Répondre..."
                    placeholderTextColor={colors.gray}
                    multiline
                  />
                  <TouchableOpacity
                    style={styles.actionBtn}
                    disabled={!(replyDrafts[m.id] ?? '').trim() || sendingReplyId === m.id}
                    onPress={() => sendReply(m)}
                  >
                    <Feather name="send" size={13} color={colors.purple} />
                    <Text style={styles.actionText}>{sendingReplyId === m.id ? 'Envoi...' : 'Envoyer'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        {tab === 'suggestions' && (
          loading ? <Text style={styles.emptyText}>Chargement...</Text> :
          suggestions.length === 0 ? <Text style={styles.emptyText}>Aucune suggestion.</Text> :
          suggestions.map((s, i) => (
            <View key={s.id} style={[styles.card, i < suggestions.length - 1 && styles.cardDivider]}>
              <View style={styles.suggestionBook}>
                <View style={styles.suggestionCover}>
                  {s.cover_url ? <Image source={{ uri: s.cover_url }} style={styles.suggestionCoverImg} /> : <Feather name="book" size={18} color={colors.purple} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardUser}>@{s.username ?? '?'}</Text>
                    <Text style={[styles.statusBadge, s.status === 'approved' && styles.statusApproved, s.status === 'rejected' && styles.statusRejected]}>
                      {s.status === 'pending' ? 'En attente' : s.status === 'approved' ? 'Approuvé' : 'Refusé'}
                    </Text>
                    <Text style={styles.cardTime}>{timeAgo(s.created_at)}</Text>
                  </View>
                  <Text style={styles.suggestionTitle}>{s.title}</Text>
                  {s.author ? <Text style={styles.suggestionAuthor}>{s.author}</Text> : null}
                </View>
              </View>
              {s.description ? <Text style={styles.cardBody} numberOfLines={3}>{s.description}</Text> : null}
              {s.status === 'pending' && (
                <View style={styles.suggestionActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => quickApprove(s)}>
                    <Feather name="check-circle" size={14} color={colors.teal} />
                    <Text style={[styles.actionText, { color: colors.teal }]}>Approuver</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => editThenApprove(s)}>
                    <Feather name="edit-2" size={14} color={colors.purple} />
                    <Text style={styles.actionText}>Modifier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => reject(s)}>
                    <Feather name="x-circle" size={14} color={colors.error} />
                    <Text style={[styles.actionText, { color: colors.error }]}>Refuser</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}

        {tab === 'add' && (
          <View style={{ paddingBottom: 20 }}>
            {editingSuggestionId ? (
              <View style={styles.editingBanner}>
                <Feather name="edit-2" size={13} color={colors.purple} />
                <Text style={styles.editingBannerText}>Tu modifies une suggestion — l'auteur sera notifié à l'ajout.</Text>
              </View>
            ) : null}
            <BookForm value={book} onChange={setBook} />
            <Button label={saving ? 'Ajout...' : 'Ajouter au catalogue'} onPress={saveBook} disabled={saving} style={{ marginTop: 12 }} />
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  tabs: { flexGrow: 0, marginBottom: 12 },
  scroll: { flex: 1 },
  emptyText: { color: colors.gray, fontSize: 13, textAlign: 'center', paddingTop: 40 },
  card: { paddingVertical: 14 },
  cardDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardUser: { fontSize: 12, fontWeight: '700', color: colors.white },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.purple },
  cardTime: { fontSize: 10, color: colors.gray, marginLeft: 'auto' },
  cardBody: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  replyBox: { marginTop: 10, backgroundColor: colors.purpleGlow, borderRadius: 8, padding: 10 },
  replyLabel: { fontSize: 10, fontFamily: fonts.headingBold, color: colors.lavender, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  replyText: { fontSize: 13, color: colors.lavender, lineHeight: 18 },
  replyForm: { marginTop: 10, gap: 8 },
  replyInput: {
    borderWidth: 1, borderColor: colors.divider, borderRadius: 8, padding: 10,
    color: colors.white, fontSize: 13, minHeight: 44, textAlignVertical: 'top',
  },
  suggestionBook: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  suggestionCover: { width: 40, height: 56, borderRadius: 5, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  suggestionCoverImg: { width: 40, height: 56 },
  suggestionTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  suggestionAuthor: { fontSize: 12, color: colors.gray },
  statusBadge: { fontSize: 10, fontWeight: '600', color: colors.gray, textTransform: 'uppercase' },
  statusApproved: { color: colors.teal },
  statusRejected: { color: colors.error },
  suggestionActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 12, fontWeight: '600', color: colors.purple },
  editingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.purpleGlow, borderRadius: 8, padding: 10, marginBottom: 16 },
  editingBannerText: { flex: 1, fontSize: 12, color: colors.lavender },
  userSearchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
    paddingVertical: 10, marginBottom: 8,
  },
  userSearchInput: { flex: 1, minWidth: 0, color: colors.white, fontSize: 14 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  userAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.purpleGlow, alignItems: 'center', justifyContent: 'center' },
  userAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  userAvatarText: { fontSize: 11, fontWeight: '700', color: colors.lavender },
  roleBadge: { backgroundColor: colors.purple, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  roleBadgeText: { fontSize: 9, fontWeight: '700', color: 'white' },
  bannedBadge: { backgroundColor: colors.error, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  bannedBadgeText: { fontSize: 9, fontWeight: '700', color: 'white' },
  userActions: { flexDirection: 'row', gap: 20 },
});
