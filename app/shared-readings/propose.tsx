import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, radius, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as books from '../../lib/books';
import * as sharedReadings from '../../lib/sharedReadings';
import { alert } from '../../lib/alert';
import Screen from '../../components/Screen';

export default function ProposeBookScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const { readingId } = useLocalSearchParams<{ readingId: string }>();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<books.NormalizedBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [proposing, setProposing] = useState(false);

  const doSearch = () => {
    if (!query.trim()) return;
    setSearching(true);
    books.search(query).then(setResults).catch(() => setResults([])).finally(() => setSearching(false));
  };

  const propose = (book: books.NormalizedBook) => {
    if (!readingId || proposing) return;
    setProposing(true);
    books
      .addBookToDb(book)
      .then((b) => sharedReadings.proposeBook(readingId, b.id))
      .then(() => router.back())
      .catch(() => {
        setProposing(false);
        alert(t('common.error'), t('sharedReadings.proposeError'));
      });
  };

  return (
    <Screen back title={t('sharedReadings.proposeTitle')} atmosphere="purple">
      <View style={styles.searchBar}>
        <Feather name="search" size={17} color={colors.gray} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={doSearch}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.gray}
          autoCapitalize="none"
        />
      </View>
      {searching || proposing ? (
        <ActivityIndicator color={colors.purple} style={{ marginTop: 20 }} />
      ) : (
        results.map((b, i) => (
          <TouchableOpacity key={i} style={styles.resultRow} onPress={() => propose(b)}>
            <View style={styles.cover}>
              {b.cover_url ? (
                <Image source={{ uri: b.cover_url }} style={styles.coverImg} />
              ) : (
                <Feather name="book" size={18} color={colors.purple} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultTitle} numberOfLines={1}>{b.title}</Text>
              <Text style={styles.resultAuthor} numberOfLines={1}>{b.author}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    searchBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16,
    },
    searchInput: { flex: 1, fontSize: 14, color: colors.white },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider },
    cover: { width: 40, height: 58, borderRadius: 6, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    coverImg: { width: '100%', height: '100%' },
    resultTitle: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.white },
    resultAuthor: { fontSize: 12, color: colors.gray, marginTop: 2 },
  });
