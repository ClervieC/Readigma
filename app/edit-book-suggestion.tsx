import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as bookEdits from '../lib/bookEdits';
import * as books from '../lib/books';
import Screen from '../components/Screen';
import Button from '../components/Button';

// Proposes a fix/addition to an existing book's info — e.g. filling in a
// missing summary or genre — without touching its title/author/cover, which
// stay locked to what's already in the catalog. Reached from the "..." menu
// on app/book/[id].tsx. An admin reviews and applies it (app/admin.tsx's
// "Modifications" tab).
export default function EditBookSuggestionScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { bookId, title } = useLocalSearchParams<{ bookId: string; title?: string }>();
  const [fields, setFields] = useState<bookEdits.BookEditFields>(bookEdits.EMPTY_BOOK_EDIT);
  const [sending, setSending] = useState(false);
  const [searchingIsbnCover, setSearchingIsbnCover] = useState(false);

  const set = (patch: Partial<bookEdits.BookEditFields>) => setFields((f) => ({ ...f, ...patch }));

  // Same multi-source lookup as BookForm's own ISBN button (Hardcover, Open
  // Library, Google Books, Wikidata) — handy here too since filling in the
  // ISBN and the cover often go together.
  const searchCoverByIsbn = () => {
    if (!fields.isbn.trim() || searchingIsbnCover) return;
    setSearchingIsbnCover(true);
    books.findCoverByIsbn(fields.isbn.trim()).then((url) => {
      setSearchingIsbnCover(false);
      if (url) set({ cover_url: url });
      else Alert.alert('Introuvable', 'Aucune couverture trouvée pour cet ISBN.');
    }).catch(() => setSearchingIsbnCover(false));
  };

  const submit = () => {
    if (!bookId) return;
    const hasAny = Object.values(fields).some((v) => v.trim());
    if (!hasAny) { Alert.alert('Vide', 'Remplis au moins un champ avant d\'envoyer.'); return; }
    setSending(true);
    bookEdits.submitBookEdit(bookId, fields).then(() => {
      setSending(false);
      Alert.alert('Merci', 'Ta proposition a été envoyée à l\'équipe.', [{ text: 'OK', onPress: () => router.back() }]);
    }).catch(() => { setSending(false); Alert.alert('Erreur', "Impossible d'envoyer la proposition"); });
  };

  return (
    <Screen back title="Proposer une modification">
      {title ? <Text style={styles.target}>{title}</Text> : null}
      <Text style={styles.hint}>Complète uniquement ce que tu veux corriger ou ajouter — le reste des infos du livre ne changera pas.</Text>

      <Text style={styles.label}>Résumé</Text>
      <TextInput style={[styles.input, styles.textarea]} value={fields.description} onChangeText={(t) => set({ description: t })} multiline placeholderTextColor={colors.gray} />

      <Text style={styles.label}>Genres (séparés par des virgules)</Text>
      <TextInput style={styles.input} value={fields.genres} onChangeText={(t) => set({ genres: t })} placeholder="Fantasy, Thriller..." placeholderTextColor={colors.gray} />

      <Text style={styles.label}>ISBN</Text>
      <TextInput style={styles.input} value={fields.isbn} onChangeText={(t) => set({ isbn: t })} placeholder="978-2-070..." placeholderTextColor={colors.gray} autoCapitalize="none" />

      {fields.isbn.trim() ? (
        <TouchableOpacity style={styles.coverSearchBtn} onPress={searchCoverByIsbn} disabled={searchingIsbnCover}>
          {searchingIsbnCover ? <ActivityIndicator size="small" color={colors.purple} /> : <Feather name="hash" size={14} color={colors.purple} />}
          <Text style={styles.coverSearchText}>{searchingIsbnCover ? 'Recherche...' : 'Trouver la couverture via ISBN'}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>URL de couverture</Text>
      <TextInput style={styles.input} value={fields.cover_url} onChangeText={(t) => set({ cover_url: t })} placeholder="https://..." placeholderTextColor={colors.gray} autoCapitalize="none" />
      {fields.cover_url ? (
        <View style={styles.coverPreviewWrap}>
          <Image source={{ uri: fields.cover_url }} style={styles.coverPreview} />
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Année</Text>
          <TextInput style={styles.input} value={fields.published_year} onChangeText={(t) => set({ published_year: t })} keyboardType="number-pad" placeholderTextColor={colors.gray} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Tome</Text>
          <TextInput style={styles.input} value={fields.series_index} onChangeText={(t) => set({ series_index: t })} keyboardType="decimal-pad" placeholderTextColor={colors.gray} />
        </View>
      </View>

      <Text style={styles.label}>Série</Text>
      <TextInput style={styles.input} value={fields.series} onChangeText={(t) => set({ series: t })} placeholderTextColor={colors.gray} />

      <Button label={sending ? 'Envoi...' : 'Envoyer la proposition'} onPress={submit} disabled={sending} style={{ marginTop: 20 }} />
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  target: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.gray, marginBottom: 20, lineHeight: 17 },
  label: { fontSize: 11, color: colors.gray, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderBottomWidth: 1, borderBottomColor: colors.divider, paddingVertical: 10, color: colors.white, fontSize: 15, marginBottom: 18 },
  textarea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 16 },
  coverPreviewWrap: { marginBottom: 12 },
  coverPreview: { width: 76, height: 104, borderRadius: 8, backgroundColor: colors.card2 },
  coverSearchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 12 },
  coverSearchText: { fontSize: 12, fontWeight: '600', color: colors.purple },
});
