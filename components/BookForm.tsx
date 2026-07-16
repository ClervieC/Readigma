import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import * as books from '../lib/books';

export type BookFormFields = {
  title: string;
  author: string;
  isbn: string;
  cover_url: string;
  description: string;
  genres: string; // comma-separated in the form, split before insert
  published_year: string;
  series: string;
  series_index: string;
};

export const EMPTY_BOOK_FORM: BookFormFields = {
  title: '', author: '', isbn: '', cover_url: '', description: '', genres: '', published_year: '', series: '', series_index: '',
};

// Shared by app/suggest-book.tsx and app/admin.tsx's "Ajouter un livre" tab —
// a suggestion is meant to carry everything an admin would otherwise type by
// hand, so both screens capture the exact same fields.
export default function BookForm({ value, onChange, requireAuthor }: { value: BookFormFields; onChange: (next: BookFormFields) => void; requireAuthor?: boolean }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [coverResults, setCoverResults] = useState<books.NormalizedBook[]>([]);
  const [searchingCover, setSearchingCover] = useState(false);
  const [searchingIsbnCover, setSearchingIsbnCover] = useState(false);

  const set = (patch: Partial<BookFormFields>) => onChange({ ...value, ...patch });

  const searchCover = () => {
    if (!value.title.trim()) return;
    setSearchingCover(true);
    setCoverResults([]);
    books.search(`${value.title} ${value.author}`.trim()).then(res => {
      setCoverResults(res.filter(r => r.cover_url).slice(0, 12));
      setSearchingCover(false);
    }).catch(() => setSearchingCover(false));
  };

  // Tries Open Library / Google Books / ISBNdb in turn (see
  // books.findCoverByIsbn) — a more targeted lookup than the title search
  // above when an exact ISBN is known, since it doesn't depend on the title/
  // author text matching well.
  const searchCoverByIsbn = () => {
    if (!value.isbn.trim() || searchingIsbnCover) return;
    setSearchingIsbnCover(true);
    books.findCoverByIsbn(value.isbn.trim()).then(url => {
      setSearchingIsbnCover(false);
      if (url) set({ cover_url: url });
      else Alert.alert('Introuvable', "Aucune couverture trouvée pour cet ISBN.");
    }).catch(() => setSearchingIsbnCover(false));
  };

  const pickCover = (url: string) => {
    set({ cover_url: url });
    setCoverResults([]);
  };

  return (
    <View>
      <Text style={styles.label}>Titre *</Text>
      <TextInput style={styles.input} value={value.title} onChangeText={t => set({ title: t })} placeholderTextColor={colors.gray} />

      <Text style={styles.label}>Auteur{requireAuthor ? ' *' : ''}</Text>
      <TextInput style={styles.input} value={value.author} onChangeText={t => set({ author: t })} placeholderTextColor={colors.gray} />

      <Text style={styles.label}>ISBN</Text>
      <TextInput style={styles.input} value={value.isbn} onChangeText={t => set({ isbn: t })} placeholder="978-2-070..." placeholderTextColor={colors.gray} keyboardType="default" autoCapitalize="none" />

      {value.isbn.trim() ? (
        <TouchableOpacity style={styles.coverSearchBtn} onPress={searchCoverByIsbn} disabled={searchingIsbnCover}>
          {searchingIsbnCover ? <ActivityIndicator size="small" color={colors.purple} /> : <Feather name="hash" size={14} color={colors.purple} />}
          <Text style={styles.coverSearchText}>{searchingIsbnCover ? 'Recherche...' : 'Trouver la couverture via ISBN'}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>URL de couverture</Text>
      <TextInput style={styles.input} value={value.cover_url} onChangeText={t => set({ cover_url: t })} placeholder="https://..." placeholderTextColor={colors.gray} autoCapitalize="none" />

      {value.cover_url ? (
        <View style={styles.coverPreviewWrap}>
          <Image source={{ uri: value.cover_url }} style={styles.coverPreview} />
        </View>
      ) : null}

      <TouchableOpacity style={styles.coverSearchBtn} onPress={searchCover} disabled={searchingCover || !value.title.trim()}>
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
      <TextInput style={[styles.input, styles.textarea]} value={value.description} onChangeText={t => set({ description: t })} multiline placeholderTextColor={colors.gray} />

      <Text style={styles.label}>Genres (séparés par des virgules)</Text>
      <TextInput style={styles.input} value={value.genres} onChangeText={t => set({ genres: t })} placeholder="Fantasy, Thriller..." placeholderTextColor={colors.gray} />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Année</Text>
          <TextInput style={styles.input} value={value.published_year} onChangeText={t => set({ published_year: t })} keyboardType="number-pad" placeholderTextColor={colors.gray} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Tome</Text>
          <TextInput style={styles.input} value={value.series_index} onChangeText={t => set({ series_index: t })} keyboardType="decimal-pad" placeholderTextColor={colors.gray} />
        </View>
      </View>

      <Text style={styles.label}>Série</Text>
      <TextInput style={styles.input} value={value.series} onChangeText={t => set({ series: t })} placeholderTextColor={colors.gray} />
    </View>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
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
