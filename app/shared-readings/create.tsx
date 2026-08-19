import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, radius, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as books from '../../lib/books';
import * as userBooks from '../../lib/userBooks';
import * as sharedReadings from '../../lib/sharedReadings';
import { alert } from '../../lib/alert';
import Screen from '../../components/Screen';
import Button from '../../components/Button';
import Pill from '../../components/Pill';

// A book picked from the reader's own "à lire" shelf already has a concrete
// books.id (book_id) — no need to round-trip it through addBookToDb like a
// fresh search result does.
type PickableBook = books.NormalizedBook & { book_id?: string };

export default function CreateSharedReadingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const styles = makeStyles(colors);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<books.NormalizedBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedBook, setSelectedBook] = useState<PickableBook | null>(null);
  const [toReadBooks, setToReadBooks] = useState<userBooks.UserBook[]>([]);
  const [loadingToRead, setLoadingToRead] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [maxParticipants, setMaxParticipants] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    userBooks
      .getMyBooks('to_read')
      .then(setToReadBooks)
      .catch(() => {})
      .finally(() => setLoadingToRead(false));
  }, []);

  const pickToReadBook = (book: userBooks.UserBook) => {
    setSelectedBook({
      book_id: book.book_id,
      external_id: book.external_id,
      title: book.title,
      author: book.author,
      cover_url: book.cover_url,
      description: book.description,
      published_year: book.published_year,
      genres: book.genres,
      series: book.series,
    });
  };

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const datesValid =
    (!startsAt.trim() || DATE_RE.test(startsAt.trim())) &&
    (!endsAt.trim() || DATE_RE.test(endsAt.trim()));

  const doSearch = () => {
    if (!query.trim()) return;
    setSearching(true);
    books.search(query).then(setResults).catch(() => setResults([])).finally(() => setSearching(false));
  };

  const create = () => {
    if (!selectedBook || !datesValid) return;
    setCreating(true);
    const opts = {
      isPublic,
      maxParticipants: maxParticipants.trim() ? parseInt(maxParticipants, 10) : null,
      startsAt: startsAt.trim() || null,
      endsAt: endsAt.trim() || null,
    };
    (selectedBook.book_id
      ? Promise.resolve({ id: selectedBook.book_id })
      : books.addBookToDb(selectedBook)
    )
      .then((book) => sharedReadings.createSharedReading(book.id, opts))
      .then((reading) => router.replace(`/shared-readings/${reading.id}`))
      .catch(() => {
        setCreating(false);
        alert(t('common.error'), t('sharedReadings.createError'));
      });
  };

  return (
    <Screen back title={t('sharedReadings.createTitle')} atmosphere="purple">
      {!selectedBook ? (
        <>
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
          {searching ? (
            <ActivityIndicator color={colors.purple} style={{ marginTop: 20 }} />
          ) : query ? (
            results.map((b, i) => (
              <TouchableOpacity key={i} style={styles.resultRow} onPress={() => setSelectedBook(b)}>
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
          ) : (
            // No search yet — lead with the reader's own "à lire" shelf,
            // since a shared reading is almost always a book they'd already
            // picked out for themselves, not a fresh catalog search.
            <>
              <Text style={styles.sectionLabel}>{t('sharedReadings.fromYourToRead')}</Text>
              {loadingToRead ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 8 }} />
              ) : toReadBooks.length === 0 ? (
                <Text style={styles.emptyToRead}>{t('sharedReadings.noToReadBooks')}</Text>
              ) : (
                toReadBooks.map((b) => (
                  <TouchableOpacity key={b.book_id} style={styles.resultRow} onPress={() => pickToReadBook(b)}>
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
            </>
          )}
        </>
      ) : (
        <>
          <View style={styles.selectedBookRow}>
            <View style={styles.cover}>
              {selectedBook.cover_url ? (
                <Image source={{ uri: selectedBook.cover_url }} style={styles.coverImg} />
              ) : (
                <Feather name="book" size={18} color={colors.purple} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultTitle} numberOfLines={1}>{selectedBook.title}</Text>
              <Text style={styles.resultAuthor} numberOfLines={1}>{selectedBook.author}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedBook(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Feather name="x" size={18} color={colors.gray} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>{t('sharedReadings.visibility')}</Text>
          <View style={styles.row}>
            <Pill label={t('sharedReadings.public')} active={isPublic} onPress={() => setIsPublic(true)} />
            <Pill label={t('sharedReadings.private')} active={!isPublic} onPress={() => setIsPublic(false)} />
          </View>

          <Text style={styles.label}>{t('sharedReadings.maxParticipants')}</Text>
          <TextInput
            style={styles.input}
            value={maxParticipants}
            onChangeText={setMaxParticipants}
            placeholder={t('sharedReadings.maxParticipantsPlaceholder')}
            placeholderTextColor={colors.gray}
            keyboardType="number-pad"
          />

          <Text style={styles.label}>{t('sharedReadings.schedule')}</Text>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={startsAt}
              onChangeText={setStartsAt}
              placeholder={t('sharedReadings.startsAtPlaceholder')}
              placeholderTextColor={colors.gray}
            />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={endsAt}
              onChangeText={setEndsAt}
              placeholder={t('sharedReadings.endsAtPlaceholder')}
              placeholderTextColor={colors.gray}
            />
          </View>
          {!datesValid && (
            <Text style={styles.dateError}>{t('sharedReadings.dateFormatError')}</Text>
          )}

          <Button
            label={t('sharedReadings.create')}
            onPress={create}
            loading={creating}
            disabled={!datesValid}
            style={{ marginTop: 24 }}
          />
        </>
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
    selectedBookRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
    cover: { width: 40, height: 58, borderRadius: 6, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    coverImg: { width: '100%', height: '100%' },
    resultTitle: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.white },
    resultAuthor: { fontSize: 12, color: colors.gray, marginTop: 2 },
    label: { fontSize: 13, color: colors.gray, marginBottom: 8, marginTop: 16 },
    row: { flexDirection: 'row', gap: 8 },
    input: {
      backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10,
      fontSize: 14, color: colors.white,
    },
    dateError: { fontSize: 12, color: colors.error, marginTop: 6 },
    sectionLabel: { fontSize: 12, color: colors.gray, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
    emptyToRead: { fontSize: 13, color: colors.gray, marginTop: 4 },
  });
