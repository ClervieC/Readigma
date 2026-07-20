import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Platform } from 'react-native';
import { useFocusEffect, useRouter, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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
  { labelKey: 'admin.tabs.users', value: 'users' },
  { labelKey: 'admin.tabs.messages', value: 'messages' },
  { labelKey: 'admin.tabs.reports', value: 'reports' },
  { labelKey: 'admin.tabs.suggestions', value: 'suggestions' },
  { labelKey: 'admin.tabs.edits', value: 'edits' },
  { labelKey: 'admin.tabs.add', value: 'add' },
] as const;

// Mirrors app/notifications.tsx's timeAgo — a plain function, not a
// component, so it takes `t` as a parameter instead of calling
// useTranslation() itself.
function timeAgo(dateStr: string, t: (key: string, opts?: any) => string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return t('feed.timeJustNow');
  if (mins < 60) return t('feed.timeMinutes', { count: mins });
  if (hours < 24) return t('feed.timeHours', { count: hours });
  return t('feed.timeDays', { count: days });
}

export default function AdminScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
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
      .catch((e) => Alert.alert(t('common.error'), e.message || t('admin.errors.addBookFailed')));
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
        .catch(() => Alert.alert(t('common.error'), t('admin.errors.updateUserFailed')));
    };
    if (!next) { apply(); return; }
    // RN Web's Alert.alert only ever renders a single-button window.alert —
    // a destructive-style multi-button config like this one is silently
    // dropped there, so a real confirm() is needed on web (same fix as
    // library.tsx's remove-book confirm).
    if (Platform.OS === 'web') {
      if (window.confirm(t('admin.banConfirmWeb', { username: u.username }))) apply();
      return;
    }
    Alert.alert(t('admin.banConfirmTitle'), t('admin.banConfirmMessage', { username: u.username }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('admin.ban'), style: 'destructive', onPress: apply },
    ]);
  };

  const toggleRole = (u: admin.AdminUser) => {
    const nextRole = u.role === 'admin' ? 'user' : 'admin';
    admin.setUserRole(u.id, nextRole)
      .then(() => setUsers(cur => cur.map(x => x.id === u.id ? { ...x, role: nextRole } : x)))
      .catch(() => Alert.alert(t('common.error'), t('admin.errors.updateUserFailed')));
  };

  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(userQuery.trim().toLowerCase()));

  const resolveReport = (r: reports.Report) => {
    reports.markReportReviewed(r.id)
      .then(() => setUserReports(cur => cur.map(x => x.id === r.id ? { ...x, status: 'reviewed' } : x)))
      .catch(() => Alert.alert(t('common.error'), t('admin.errors.updateReportFailed')));
  };

  const approveEdit = (e: bookEdits.BookEditSuggestion) => {
    bookEdits.approveBookEdit(e)
      .then(() => setBookEditList(cur => cur.map(x => x.id === e.id ? { ...x, status: 'approved' } : x)))
      .catch(() => Alert.alert(t('common.error'), t('admin.errors.applyEditFailed')));
  };

  const rejectEdit = (e: bookEdits.BookEditSuggestion) => {
    bookEdits.rejectBookEdit(e.id)
      .then(() => setBookEditList(cur => cur.map(x => x.id === e.id ? { ...x, status: 'rejected' } : x)))
      .catch(() => Alert.alert(t('common.error'), t('admin.errors.rejectEditFailed')));
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
        Alert.alert(t('admin.backfillDoneTitle'), t('admin.backfillDone', { count: updated, total: checked }));
      })
      .catch(() => { setBackfilling(false); Alert.alert(t('common.error'), t('admin.errors.backfillFailed')); });
  };

  // Unlike runCoverBackfill above, this touches every book — including ones
  // that already have a cover — and replaces the cover whenever a source
  // resolves one, now that Hardcover is tried first (description/genres
  // still only get filled in, never overwritten). Confirmed separately
  // since it's the only one of the two that can overwrite an already-good
  // cover.
  const runCoverRepopulate = () => {
    Alert.alert(
      t('admin.repopulateConfirmTitle'),
      t('admin.repopulateConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.repopulateConfirmAction'),
          onPress: () => {
            setBackfilling(true);
            setBackfillProgress({ done: 0, total: 0, updated: 0 });
            books.repopulateAllCovers((done, total, updated) => setBackfillProgress({ done, total, updated }))
              .then(({ checked, updated }) => {
                setBackfilling(false);
                Alert.alert(t('admin.backfillDoneTitle'), t('admin.repopulateDone', { count: updated, total: checked }));
              })
              .catch(() => { setBackfilling(false); Alert.alert(t('common.error'), t('admin.errors.repopulateFailed')); });
          },
        },
      ],
    );
  };

  const saveBook = () => {
    if (!book.title.trim()) { Alert.alert(t('common.error'), t('admin.errors.titleRequired')); return; }
    setSaving(true);
    admin.addBookManually(book).then(async () => {
      if (editingSuggestionId) {
        await admin.markSuggestionApproved(editingSuggestionId);
        setSuggestions(cur => cur.map(x => x.id === editingSuggestionId ? { ...x, status: 'approved' } : x));
        setEditingSuggestionId(null);
      }
      setSaving(false);
      setBook(EMPTY_BOOK_FORM);
      Alert.alert(t('admin.bookAddedTitle'), t('admin.bookAddedMessage', { title: book.title }));
    }).catch((e) => { setSaving(false); Alert.alert(t('common.error'), e.message || t('admin.errors.addBookFailed')); });
  };

  return (
    <Screen back title={t('admin.title')} scroll={false}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: 8 }}>
        {TABS.map(tabOpt => (
          <Pill key={tabOpt.value} active={tab === tabOpt.value} onPress={() => setTab(tabOpt.value)} label={t(tabOpt.labelKey)} />
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
                placeholder={t('admin.searchUsersPlaceholder')}
                placeholderTextColor={colors.gray}
                autoCapitalize="none"
              />
            </View>
            {loading ? <Text style={styles.emptyText}>{t('admin.loading')}</Text> :
            filteredUsers.length === 0 ? <Text style={styles.emptyText}>{t('admin.noUsers')}</Text> :
            filteredUsers.map((u, i) => (
              <View key={u.id} style={[styles.card, i < filteredUsers.length - 1 && styles.cardDivider]}>
                <View style={styles.userRow}>
                  {u.avatar_url ? <Image source={{ uri: u.avatar_url }} style={styles.userAvatarImg} /> : (
                    <View style={styles.userAvatar}><Text style={styles.userAvatarText}>{u.username.slice(0, 2).toUpperCase()}</Text></View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.cardUser}>@{u.username}</Text>
                      {u.role === 'admin' && <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{t('admin.roleAdmin')}</Text></View>}
                      {u.banned && <View style={styles.bannedBadge}><Text style={styles.bannedBadgeText}>{t('admin.bannedBadge')}</Text></View>}
                    </View>
                  </View>
                </View>
                <View style={styles.userActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => toggleRole(u)} disabled={u.id === profile?.id}>
                    <Feather name="shield" size={13} color={u.id === profile?.id ? colors.gray : colors.purple} />
                    <Text style={[styles.actionText, u.id === profile?.id && { color: colors.gray }]}>
                      {u.role === 'admin' ? t('admin.demote') : t('admin.promote')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => toggleBan(u)} disabled={u.id === profile?.id}>
                    <Feather name={u.banned ? 'user-check' : 'slash'} size={13} color={u.id === profile?.id ? colors.gray : colors.error} />
                    <Text style={[styles.actionText, { color: u.id === profile?.id ? colors.gray : colors.error }]}>
                      {u.banned ? t('admin.unban') : t('admin.ban')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {tab === 'messages' && (
          loading ? <Text style={styles.emptyText}>{t('admin.loading')}</Text> :
          threads.length === 0 ? <Text style={styles.emptyText}>{t('admin.noMessages')}</Text> :
          threads.map((th, i) => (
            <TouchableOpacity key={th.user_id} style={[styles.card, i < threads.length - 1 && styles.cardDivider]} activeOpacity={0.75}
              onPress={() => router.push({ pathname: '/admin-thread', params: { userId: th.user_id, username: th.username ?? '?' } })}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardUser}>@{th.username ?? '?'}</Text>
                {th.last_sender === 'user' && <View style={styles.unreadDot} />}
                <Text style={styles.cardTime}>{timeAgo(th.last_at, t)}</Text>
              </View>
              <Text style={styles.cardBody} numberOfLines={2}>
                {th.last_sender === 'admin' ? t('admin.youPrefix') : ''}{th.last_body}
              </Text>
            </TouchableOpacity>
          ))
        )}

        {tab === 'suggestions' && (
          loading ? <Text style={styles.emptyText}>{t('admin.loading')}</Text> :
          suggestions.length === 0 ? <Text style={styles.emptyText}>{t('admin.noSuggestions')}</Text> :
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
                      {s.status === 'pending' ? t('admin.statusPending') : s.status === 'approved' ? t('admin.statusApproved') : t('admin.statusRejected')}
                    </Text>
                    <Text style={styles.cardTime}>{timeAgo(s.created_at, t)}</Text>
                  </View>
                  <Text style={styles.suggestionTitle}>{s.title}</Text>
                  {s.author ? <Text style={styles.suggestionAuthor}>{s.author}</Text> : null}
                  {s.isbn ? <Text style={styles.suggestionAuthor}>{t('admin.isbnLabel', { isbn: s.isbn })}</Text> : null}
                </View>
              </View>
              {s.description ? <Text style={styles.cardBody} numberOfLines={3}>{s.description}</Text> : null}
              {s.status === 'pending' && (
                <View style={styles.suggestionActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => quickApprove(s)}>
                    <Feather name="check-circle" size={14} color={colors.teal} />
                    <Text style={[styles.actionText, { color: colors.teal }]}>{t('admin.approve')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => editThenApprove(s)}>
                    <Feather name="edit-2" size={14} color={colors.purple} />
                    <Text style={styles.actionText}>{t('admin.edit')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => reject(s)}>
                    <Feather name="x-circle" size={14} color={colors.error} />
                    <Text style={[styles.actionText, { color: colors.error }]}>{t('admin.reject')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}

        {tab === 'reports' && (
          loading ? <Text style={styles.emptyText}>{t('admin.loading')}</Text> :
          userReports.length === 0 ? <Text style={styles.emptyText}>{t('admin.noReports')}</Text> :
          userReports.map((r, i) => (
            <View key={r.id} style={[styles.card, i < userReports.length - 1 && styles.cardDivider]}>
              <View style={styles.cardHeader}>
                <Feather name={r.target_type === 'book' ? 'book' : 'user'} size={13} color={colors.error} />
                <Text style={styles.cardUser}>{r.target_label ?? t('admin.notFound')}</Text>
                <Text style={[styles.statusBadge, r.status === 'reviewed' && styles.statusApproved]}>
                  {r.status === 'pending' ? t('admin.statusPending') : t('admin.statusTreated')}
                </Text>
                <Text style={styles.cardTime}>{timeAgo(r.created_at, t)}</Text>
              </View>
              <Text style={styles.suggestionAuthor}>{t('admin.reportedBy', { username: r.reporter_username ?? '?', reason: r.reason })}</Text>
              {r.details ? <Text style={styles.cardBody}>{r.details}</Text> : null}
              {r.status === 'pending' && (
                <View style={styles.suggestionActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => resolveReport(r)}>
                    <Feather name="check-circle" size={14} color={colors.teal} />
                    <Text style={[styles.actionText, { color: colors.teal }]}>{t('admin.markReviewed')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}

        {tab === 'edits' && (
          loading ? <Text style={styles.emptyText}>{t('admin.loading')}</Text> :
          bookEditList.length === 0 ? <Text style={styles.emptyText}>{t('admin.noEdits')}</Text> :
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
                      {e.status === 'pending' ? t('admin.statusPending') : e.status === 'approved' ? t('admin.statusApplied') : t('admin.statusRejected')}
                    </Text>
                    <Text style={styles.cardTime}>{timeAgo(e.created_at, t)}</Text>
                  </View>
                  <Text style={styles.suggestionTitle}>{e.book_title ?? t('admin.bookNotFound')}</Text>
                </View>
              </View>
              {e.description ? <Text style={styles.cardBody} numberOfLines={3}>{t('admin.summaryLabel', { description: e.description })}</Text> : null}
              {e.genres && e.genres.length > 0 ? <Text style={styles.suggestionAuthor}>{t('admin.genresLabel', { genres: e.genres.join(', ') })}</Text> : null}
              {e.series ? <Text style={styles.suggestionAuthor}>{t('admin.seriesLabel', { series: e.series })}{e.series_index != null ? t('admin.tomeSuffix', { index: e.series_index }) : ''}</Text> : null}
              {e.published_year ? <Text style={styles.suggestionAuthor}>{t('admin.yearLabel', { year: e.published_year })}</Text> : null}
              {e.isbn ? <Text style={styles.suggestionAuthor}>{t('admin.isbnLabelColon', { isbn: e.isbn })}</Text> : null}
              {e.status === 'pending' && (
                <View style={styles.suggestionActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => approveEdit(e)}>
                    <Feather name="check-circle" size={14} color={colors.teal} />
                    <Text style={[styles.actionText, { color: colors.teal }]}>{t('admin.apply')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => rejectEdit(e)}>
                    <Feather name="x-circle" size={14} color={colors.error} />
                    <Text style={[styles.actionText, { color: colors.error }]}>{t('admin.reject')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}

        {tab === 'add' && (
          <View style={{ paddingBottom: 20 }}>
            <View style={styles.backfillCard}>
              <Text style={styles.backfillTitle}>{t('admin.missingInfoTitle')}</Text>
              <Text style={styles.backfillSub}>
                {backfilling && backfillProgress
                  ? t('admin.backfillProgress', { done: backfillProgress.done, total: backfillProgress.total, count: backfillProgress.updated })
                  : t('admin.missingInfoDesc')}
              </Text>
              <TouchableOpacity style={styles.actionBtn} onPress={runCoverBackfill} disabled={backfilling}>
                <Feather name="image" size={14} color={backfilling ? colors.gray : colors.purple} />
                <Text style={[styles.actionText, backfilling && { color: colors.gray }]}>
                  {backfilling ? t('admin.inProgress') : t('admin.completeMissingInfo')}
                </Text>
              </TouchableOpacity>
              <View style={styles.backfillDivider} />
              <Text style={styles.backfillSub}>
                {t('admin.repopulateDesc')}
              </Text>
              <TouchableOpacity style={styles.actionBtn} onPress={runCoverRepopulate} disabled={backfilling}>
                <Feather name="refresh-cw" size={14} color={backfilling ? colors.gray : colors.error} />
                <Text style={[styles.actionText, { color: backfilling ? colors.gray : colors.error }]}>
                  {backfilling ? t('admin.inProgress') : t('admin.repopulateCatalog')}
                </Text>
              </TouchableOpacity>
            </View>

            {editingSuggestionId ? (
              <View style={styles.editingBanner}>
                <Feather name="edit-2" size={13} color={colors.purple} />
                <Text style={styles.editingBannerText}>{t('admin.editingSuggestionBanner')}</Text>
              </View>
            ) : null}
            <BookForm value={book} onChange={setBook} />
            <Button label={saving ? t('admin.saving') : t('admin.addToCatalog')} onPress={saveBook} disabled={saving} style={{ marginTop: 12 }} />
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
