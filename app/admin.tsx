import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, ActivityIndicator } from 'react-native';
import { useFocusEffect, Redirect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, radius, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import * as admin from '../lib/admin';
import * as books from '../lib/books';
import Screen from '../components/Screen';
import Pill from '../components/Pill';
import Button from '../components/Button';

const TABS = [
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

const EMPTY_BOOK: admin.ManualBook = {
  title: '', author: '', cover_url: '', description: '', genres: '', published_year: '', series: '', series_index: '',
};

export default function AdminScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const styles = makeStyles(colors);
  const [tab, setTab] = useState<typeof TABS[number]['value']>('messages');
  const [messages, setMessages] = useState<admin.AdminMessage[]>([]);
  const [suggestions, setSuggestions] = useState<admin.BookSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState<admin.ManualBook>(EMPTY_BOOK);
  const [saving, setSaving] = useState(false);
  const [coverResults, setCoverResults] = useState<books.NormalizedBook[]>([]);
  const [searchingCover, setSearchingCover] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([admin.getMessages(), admin.getSuggestions()])
      .then(([m, s]) => { setMessages(m); setSuggestions(s); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  if (profile && profile.role !== 'admin') return <Redirect href="/(tabs)/profile" />;

  const openMessage = (m: admin.AdminMessage) => {
    if (m.status === 'unread') {
      admin.markMessageRead(m.id).then(() => setMessages(cur => cur.map(x => x.id === m.id ? { ...x, status: 'read' } : x)));
    }
  };

  const decideSuggestion = (s: admin.BookSuggestion, status: 'approved' | 'rejected') => {
    admin.updateSuggestionStatus(s.id, status).then(() => setSuggestions(cur => cur.map(x => x.id === s.id ? { ...x, status } : x)));
  };

  const prefillFromSuggestion = (s: admin.BookSuggestion) => {
    setBook({ ...EMPTY_BOOK, title: s.title, author: s.author || '' });
    setCoverResults([]);
    setTab('add');
  };

  const searchCover = () => {
    if (!book.title.trim()) return;
    setSearchingCover(true);
    setCoverResults([]);
    books.search(`${book.title} ${book.author}`.trim()).then(res => {
      setCoverResults(res.filter(r => r.cover_url).slice(0, 12));
      setSearchingCover(false);
    }).catch(() => setSearchingCover(false));
  };

  const pickCover = (url: string) => {
    setBook(b => ({ ...b, cover_url: url }));
    setCoverResults([]);
  };

  const saveBook = () => {
    if (!book.title.trim()) { Alert.alert('Erreur', 'Le titre est requis'); return; }
    setSaving(true);
    admin.addBookManually(book).then(() => {
      setSaving(false);
      setBook(EMPTY_BOOK);
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
        {tab === 'messages' && (
          loading ? <Text style={styles.emptyText}>Chargement...</Text> :
          messages.length === 0 ? <Text style={styles.emptyText}>Aucun message.</Text> :
          messages.map((m, i) => (
            <TouchableOpacity key={m.id} style={[styles.card, i < messages.length - 1 && styles.cardDivider]} onPress={() => openMessage(m)}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardUser}>@{m.username ?? '?'}</Text>
                {m.status === 'unread' && <View style={styles.unreadDot} />}
                <Text style={styles.cardTime}>{timeAgo(m.created_at)}</Text>
              </View>
              <Text style={styles.cardBody}>{m.message}</Text>
            </TouchableOpacity>
          ))
        )}

        {tab === 'suggestions' && (
          loading ? <Text style={styles.emptyText}>Chargement...</Text> :
          suggestions.length === 0 ? <Text style={styles.emptyText}>Aucune suggestion.</Text> :
          suggestions.map((s, i) => (
            <View key={s.id} style={[styles.card, i < suggestions.length - 1 && styles.cardDivider]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardUser}>@{s.username ?? '?'}</Text>
                <Text style={[styles.statusBadge, s.status === 'approved' && styles.statusApproved, s.status === 'rejected' && styles.statusRejected]}>
                  {s.status === 'pending' ? 'En attente' : s.status === 'approved' ? 'Approuvé' : 'Refusé'}
                </Text>
                <Text style={styles.cardTime}>{timeAgo(s.created_at)}</Text>
              </View>
              <Text style={styles.suggestionTitle}>{s.title}</Text>
              {s.author ? <Text style={styles.suggestionAuthor}>{s.author}</Text> : null}
              {s.message ? <Text style={styles.cardBody}>{s.message}</Text> : null}
              {s.status === 'pending' && (
                <View style={styles.suggestionActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => prefillFromSuggestion(s)}>
                    <Feather name="plus-circle" size={14} color={colors.purple} />
                    <Text style={styles.actionText}>Ajouter au catalogue</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => decideSuggestion(s, 'rejected')}>
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
            <Text style={styles.label}>Titre *</Text>
            <TextInput style={styles.input} value={book.title} onChangeText={v => setBook({ ...book, title: v })} placeholderTextColor={colors.gray} />
            <Text style={styles.label}>Auteur</Text>
            <TextInput style={styles.input} value={book.author} onChangeText={v => setBook({ ...book, author: v })} placeholderTextColor={colors.gray} />
            <Text style={styles.label}>URL de couverture</Text>
            <TextInput style={styles.input} value={book.cover_url} onChangeText={v => setBook({ ...book, cover_url: v })} placeholder="https://..." placeholderTextColor={colors.gray} autoCapitalize="none" />
            {book.cover_url ? (
              <View style={styles.coverPreviewWrap}>
                <Image source={{ uri: book.cover_url }} style={styles.coverPreview} />
              </View>
            ) : null}

            <TouchableOpacity style={styles.coverSearchBtn} onPress={searchCover} disabled={searchingCover || !book.title.trim()}>
              {searchingCover ? <ActivityIndicator size="small" color={colors.purple} /> : <Feather name="search" size={14} color={colors.purple} />}
              <Text style={styles.coverSearchText}>{searchingCover ? 'Recherche...' : 'Chercher une couverture'}</Text>
            </TouchableOpacity>

            {coverResults.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coverResultsRow} contentContainerStyle={{ gap: 10 }}>
                {coverResults.map((r, i) => (
                  <TouchableOpacity key={i} onPress={() => pickCover(r.cover_url!)}>
                    <Image source={{ uri: r.cover_url! }} style={styles.coverResultImg} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, styles.textarea]} value={book.description} onChangeText={v => setBook({ ...book, description: v })} multiline placeholderTextColor={colors.gray} />
            <Text style={styles.label}>Genres (séparés par des virgules)</Text>
            <TextInput style={styles.input} value={book.genres} onChangeText={v => setBook({ ...book, genres: v })} placeholder="Fantasy, Thriller..." placeholderTextColor={colors.gray} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Année</Text>
                <TextInput style={styles.input} value={book.published_year} onChangeText={v => setBook({ ...book, published_year: v })} keyboardType="number-pad" placeholderTextColor={colors.gray} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Tome</Text>
                <TextInput style={styles.input} value={book.series_index} onChangeText={v => setBook({ ...book, series_index: v })} keyboardType="decimal-pad" placeholderTextColor={colors.gray} />
              </View>
            </View>
            <Text style={styles.label}>Série</Text>
            <TextInput style={styles.input} value={book.series} onChangeText={v => setBook({ ...book, series: v })} placeholderTextColor={colors.gray} />

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
  suggestionTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  suggestionAuthor: { fontSize: 12, color: colors.gray, marginBottom: 4 },
  statusBadge: { fontSize: 10, fontWeight: '600', color: colors.gray, textTransform: 'uppercase' },
  statusApproved: { color: colors.teal },
  statusRejected: { color: colors.error },
  suggestionActions: { flexDirection: 'row', gap: 16, marginTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 12, fontWeight: '600', color: colors.purple },
  label: { fontSize: 11, color: colors.gray, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderBottomWidth: 1, borderBottomColor: colors.divider, paddingVertical: 10, color: colors.white, fontSize: 15, marginBottom: 18 },
  textarea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 16 },
  coverPreviewWrap: { marginBottom: 12 },
  coverPreview: { width: 76, height: 104, borderRadius: 8, backgroundColor: colors.card2 },
  coverSearchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 12 },
  coverSearchText: { fontSize: 12, fontWeight: '600', color: colors.purple },
  coverResultsRow: { marginBottom: 18 },
  coverResultImg: { width: 64, height: 90, borderRadius: 6, backgroundColor: colors.card2 },
});
