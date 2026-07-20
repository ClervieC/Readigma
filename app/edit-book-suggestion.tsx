import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      else Alert.alert(t('bookForm.notFound'), t('bookForm.noCoverFoundForIsbn'));
    }).catch(() => setSearchingIsbnCover(false));
  };

  const submit = () => {
    if (!bookId) return;
    const hasAny = Object.values(fields).some((v) => v.trim());
    if (!hasAny) { Alert.alert(t('editBookSuggestion.empty'), t('editBookSuggestion.emptyMessage')); return; }
    setSending(true);
    bookEdits.submitBookEdit(bookId, fields).then(() => {
      setSending(false);
      Alert.alert(t('editBookSuggestion.thanks'), t('editBookSuggestion.thanksMessage'), [{ text: t('common.ok'), onPress: () => router.back() }]);
    }).catch(() => { setSending(false); Alert.alert(t('common.error'), t('editBookSuggestion.errors.sendFailed')); });
  };

  return (
    <Screen back title={t('book.editSuggestion')}>
      {title ? <Text style={styles.target}>{title}</Text> : null}
      <Text style={styles.hint}>{t('editBookSuggestion.hint')}</Text>

      <Text style={styles.label}>{t('book.summary')}</Text>
      <TextInput style={[styles.input, styles.textarea]} value={fields.description} onChangeText={(v) => set({ description: v })} multiline placeholderTextColor={colors.gray} />

      <Text style={styles.label}>{t('bookForm.genresLabel')}</Text>
      <TextInput style={styles.input} value={fields.genres} onChangeText={(v) => set({ genres: v })} placeholder="Fantasy, Thriller..." placeholderTextColor={colors.gray} />

      <Text style={styles.label}>{t('bookForm.isbnLabel')}</Text>
      <TextInput style={styles.input} value={fields.isbn} onChangeText={(v) => set({ isbn: v })} placeholder="978-2-070..." placeholderTextColor={colors.gray} autoCapitalize="none" />

      {fields.isbn.trim() ? (
        <TouchableOpacity style={styles.coverSearchBtn} onPress={searchCoverByIsbn} disabled={searchingIsbnCover}>
          {searchingIsbnCover ? <ActivityIndicator size="small" color={colors.purple} /> : <Feather name="hash" size={14} color={colors.purple} />}
          <Text style={styles.coverSearchText}>{searchingIsbnCover ? t('bookForm.searching') : t('bookForm.findCoverByIsbn')}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>{t('bookForm.coverUrlLabel')}</Text>
      <TextInput style={styles.input} value={fields.cover_url} onChangeText={(v) => set({ cover_url: v })} placeholder="https://..." placeholderTextColor={colors.gray} autoCapitalize="none" />
      {fields.cover_url ? (
        <View style={styles.coverPreviewWrap}>
          <Image source={{ uri: fields.cover_url }} style={styles.coverPreview} />
        </View>
      ) : null}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t('bookForm.yearLabel')}</Text>
          <TextInput style={styles.input} value={fields.published_year} onChangeText={(v) => set({ published_year: v })} keyboardType="number-pad" placeholderTextColor={colors.gray} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t('bookForm.tomeLabel')}</Text>
          <TextInput style={styles.input} value={fields.series_index} onChangeText={(v) => set({ series_index: v })} keyboardType="decimal-pad" placeholderTextColor={colors.gray} />
        </View>
      </View>

      <Text style={styles.label}>{t('bookForm.seriesLabel')}</Text>
      <TextInput style={styles.input} value={fields.series} onChangeText={(v) => set({ series: v })} placeholderTextColor={colors.gray} />

      <Button label={sending ? t('editBookSuggestion.sending') : t('editBookSuggestion.send')} onPress={submit} disabled={sending} style={{ marginTop: 20 }} />
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
