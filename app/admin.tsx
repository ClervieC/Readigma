import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Platform } from 'react-native';
import { useFocusEffect, useRouter, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import * as admin from '../lib/admin';
import * as supportChat from '../lib/supportChat';
import * as reports from '../lib/reports';
import * as bookEdits from '../lib/bookEdits';
import * as books from '../lib/books';
import Screen from '../components/Screen';
import Pill from '../components/Pill';
import Button from '../components/Button';
import BookForm, { BookFormFields, EMPTY_BOOK_FORM } from '../components/BookForm';

const TABS = [
  { label: 'Utilisateurs', value: 'users' },
  { label: 'Messages', value: 'messages' },
  { label: 'Signalements', value: 'reports' },
  { label: 'Suggestions', value: 'suggestions' },
  { label: 'Modifications', value: 'edits' },
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
  const router = useRouter();
  const styles = makeStyles(colors);
  const [tab, setTab] = useState<typeof TABS[number]['value']>('users');
  const [threads, setThreads] = useState<supportChat.ThreadSummary[]>([]);
  const [suggestions, setSuggestions] = useState<admin.BookSuggestion[]>([]);
  const [users, setUsers] = useState<admin.AdminUser[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState<BookFormFields>(EMPTY_BOOK_FORM);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [userReports, setUserReports] = useState<reports.Report[]>([]);
  const [bookEditList, setBookEditList] = useState<bookEdits.BookEditSuggestion[]>([]);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number; updated: number } | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([supportChat.getThreadSummaries(), admin.getSuggestions(), admin.getAllUsers(), reports.getReports(), bookEdits.getBookEdits()])
      .then(([t, s, u, r, be]) => { setThreads(t); setSuggestions(s); setUsers(u); setUserReports(r); setBookEditList(be); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (profile && profile.role !== 'admin') return <Redirect href="/(tabs)/profile" />;

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

  const resolveReport = (r: reports.Report) => {
    reports.markReportReviewed(r.id)
      .then(() => setUserReports(cur => cur.map(x => x.id === r.id ? { ...x, status: 'reviewed' } : x)))
      .catch(() => Alert.alert('Erreur', "Impossible de mettre à jour le signalement"));
  };

  const approveEdit = (e: bookEdits.BookEditSuggestion) => {
    bookEdits.approveBookEdit(e)
      .then(() => setBookEditList(cur => cur.map(x => x.id === e.id ? { ...x, status: 'approved' } : x)))
      .catch(() => Alert.alert('Erreur', "Impossible d'appliquer cette modification"));
  };

  const rejectEdit = (e: bookEdits.BookEditSuggestion) => {
    bookEdits.rejectBookEdit(e.id)
      .then(() => setBookEditList(cur => cur.map(x => x.id === e.id ? { ...x, status: 'rejected' } : x)))
      .catch(() => Alert.alert('Erreur', "Impossible de refuser cette modification"));
  };

  // One-time sweep over every book already in the catalog that's missing a
  // cover — tries an ISBN lookup first, then falls back to the same title/
  // author search used elsewhere (see books.backfillMissingCovers). Can take
  // a while on a large catalog since it's deliberately sequential/throttled
  // rather than firing dozens of requests at once.
  const runCoverBackfill = () => {
    setBackfilling(true);
    setBackfillProgress({ done: 0, total: 0, updated: 0 });
    books.backfillMissingCovers((done, total, updated) => setBackfillProgress({ done, total, updated }))
      .then(({ checked, updated }) => {
        setBackfilling(false);
        Alert.alert('Terminé', `${updated} livre(s) complété(s) sur ${checked} qu'il manquait quelque chose (couverture, résumé ou genres).`);
      })
      .catch(() => { setBackfilling(false); Alert.alert('Erreur', 'Le balayage a échoué.'); });
  };

  // Unlike runCoverBackfill above, this touches every book — including ones
  // that already have a cover — and replaces the cover whenever a source
  // resolves one, now that Hardcover is tried first (description/genres
  // still only get filled in, never overwritten). Confirmed separately
  // since it's the only one of the two that can overwrite an already-good
  // cover.
  const runCoverRepopulate = () => {
    Alert.alert(
      'Repeupler tout le catalogue ?',
      'Remplace la couverture de chaque livre (même ceux qui en ont déjà une) par celle trouvée en priorité via Hardcover, et complète résumé/genres manquants. Peut prendre du temps.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Repeupler',
          onPress: () => {
            setBackfilling(true);
            setBackfillProgress({ done: 0, total: 0, updated: 0 });
            books.repopulateAllCovers((done, total, updated) => setBackfillProgress({ done, total, updated }))
              .then(({ checked, updated }) => {
                setBackfilling(false);
                Alert.alert('Terminé', `${updated} livre(s) mis à jour sur ${checked} au total.`);
              })
              .catch(() => { setBackfilling(false); Alert.alert('Erreur', 'Le repeuplement a échoué.'); });
          },
        },
      ],
    );
  };

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
          threads.length === 0 ? <Text style={styles.emptyText}>Aucun message.</Text> :
          threads.map((t, i) => (
            <TouchableOpacity key={t.user_id} style={[styles.card, i < threads.length - 1 && styles.cardDivider]} activeOpacity={0.75}
              onPress={() => router.push({ pathname: '/admin-thread', params: { userId: t.user_id, username: t.username ?? '?' } })}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardUser}>@{t.username ?? '?'}</Text>
                {t.last_sender === 'user' && <View style={styles.unreadDot} />}
                <Text style={styles.cardTime}>{timeAgo(t.last_at)}</Text>
              </View>
              <Text style={styles.cardBody} numberOfLines={2}>
                {t.last_sender === 'admin' ? 'Toi : ' : ''}{t.last_body}
              </Text>
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
                  {s.isbn ? <Text style={styles.suggestionAuthor}>ISBN {s.isbn}</Text> : null}
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

        {tab === 'reports' && (
          loading ? <Text style={styles.emptyText}>Chargement...</Text> :
          userReports.length === 0 ? <Text style={styles.emptyText}>Aucun signalement.</Text> :
          userReports.map((r, i) => (
            <View key={r.id} style={[styles.card, i < userReports.length - 1 && styles.cardDivider]}>
              <View style={styles.cardHeader}>
                <Feather name={r.target_type === 'book' ? 'book' : 'user'} size={13} color={colors.error} />
                <Text style={styles.cardUser}>{r.target_label ?? '(introuvable)'}</Text>
                <Text style={[styles.statusBadge, r.status === 'reviewed' && styles.statusApproved]}>
                  {r.status === 'pending' ? 'En attente' : 'Traité'}
                </Text>
                <Text style={styles.cardTime}>{timeAgo(r.created_at)}</Text>
              </View>
              <Text style={styles.suggestionAuthor}>Signalé par @{r.reporter_username ?? '?'} · {r.reason}</Text>
              {r.details ? <Text style={styles.cardBody}>{r.details}</Text> : null}
              {r.status === 'pending' && (
                <View style={styles.suggestionActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => resolveReport(r)}>
                    <Feather name="check-circle" size={14} color={colors.teal} />
                    <Text style={[styles.actionText, { color: colors.teal }]}>Marquer traité</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}

        {tab === 'edits' && (
          loading ? <Text style={styles.emptyText}>Chargement...</Text> :
          bookEditList.length === 0 ? <Text style={styles.emptyText}>Aucune modification proposée.</Text> :
          bookEditList.map((e, i) => (
            <View key={e.id} style={[styles.card, i < bookEditList.length - 1 && styles.cardDivider]}>
              <View style={styles.suggestionBook}>
                <View style={styles.suggestionCover}>
                  {e.cover_url ? <Image source={{ uri: e.cover_url }} style={styles.suggestionCoverImg} /> : <Feather name="book" size={18} color={colors.purple} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardUser}>@{e.username ?? '?'}</Text>
                    <Text style={[styles.statusBadge, e.status === 'approved' && styles.statusApproved, e.status === 'rejected' && styles.statusRejected]}>
                      {e.status === 'pending' ? 'En attente' : e.status === 'approved' ? 'Appliqué' : 'Refusé'}
                    </Text>
                    <Text style={styles.cardTime}>{timeAgo(e.created_at)}</Text>
                  </View>
                  <Text style={styles.suggestionTitle}>{e.book_title ?? '(livre introuvable)'}</Text>
                </View>
              </View>
              {e.description ? <Text style={styles.cardBody} numberOfLines={3}>Résumé : {e.description}</Text> : null}
              {e.genres && e.genres.length > 0 ? <Text style={styles.suggestionAuthor}>Genres : {e.genres.join(', ')}</Text> : null}
              {e.series ? <Text style={styles.suggestionAuthor}>Série : {e.series}{e.series_index != null ? ` · Tome ${e.series_index}` : ''}</Text> : null}
              {e.published_year ? <Text style={styles.suggestionAuthor}>Année : {e.published_year}</Text> : null}
              {e.isbn ? <Text style={styles.suggestionAuthor}>ISBN : {e.isbn}</Text> : null}
              {e.status === 'pending' && (
                <View style={styles.suggestionActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => approveEdit(e)}>
                    <Feather name="check-circle" size={14} color={colors.teal} />
                    <Text style={[styles.actionText, { color: colors.teal }]}>Appliquer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => rejectEdit(e)}>
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
            <View style={styles.backfillCard}>
              <Text style={styles.backfillTitle}>Infos manquantes</Text>
              <Text style={styles.backfillSub}>
                {backfilling && backfillProgress
                  ? `Recherche... ${backfillProgress.done}/${backfillProgress.total} (${backfillProgress.updated} livre${backfillProgress.updated > 1 ? 's' : ''} complété${backfillProgress.updated > 1 ? 's' : ''})`
                  : "Cherche couverture, résumé, genres et ISBN manquants (Hardcover, Open Library, Google Books, Wikidata) pour chaque livre du catalogue qui n'en a pas."}
              </Text>
              <TouchableOpacity style={styles.actionBtn} onPress={runCoverBackfill} disabled={backfilling}>
                <Feather name="image" size={14} color={backfilling ? colors.gray : colors.purple} />
                <Text style={[styles.actionText, backfilling && { color: colors.gray }]}>
                  {backfilling ? 'En cours...' : 'Compléter les infos manquantes'}
                </Text>
              </TouchableOpacity>
              <View style={styles.backfillDivider} />
              <Text style={styles.backfillSub}>
                Repasse sur tout le catalogue : remplace la couverture par celle de Hardcover en priorité (même si le livre en a déjà une), et complète résumé/genres/ISBN seulement s'ils manquent.
              </Text>
              <TouchableOpacity style={styles.actionBtn} onPress={runCoverRepopulate} disabled={backfilling}>
                <Feather name="refresh-cw" size={14} color={backfilling ? colors.gray : colors.error} />
                <Text style={[styles.actionText, { color: backfilling ? colors.gray : colors.error }]}>
                  {backfilling ? 'En cours...' : 'Repeupler tout le catalogue'}
                </Text>
              </TouchableOpacity>
            </View>

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
  backfillCard: { backgroundColor: colors.card, borderRadius: 10, padding: 14, marginBottom: 20, gap: 8 },
  backfillTitle: { fontSize: 13, fontWeight: '700', color: colors.white },
  backfillSub: { fontSize: 12, color: colors.gray, lineHeight: 17 },
  backfillDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },
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
