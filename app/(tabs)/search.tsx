import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { radius, fonts, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as books from '../../lib/books';
import * as userBooks from '../../lib/userBooks';
import Row from '../../components/Row';
import Pill from '../../components/Pill';
import Button from '../../components/Button';
import NotificationBell from '../../components/NotificationBell';
import { onScrollToTop } from '../../lib/tabScrollEmitter';

const BookItem = ({ book, onPress, onTagPress, added, last, colors, styles }: { book: any; onPress: (book: any) => void; onTagPress: (tag: string) => void; added: boolean; last: boolean; colors: ColorPalette; styles: any }) => {
  const tags = books.normalizeTags(book.genres);
  return (
    <Row last={last} onPress={() => onPress(book)}
      icon={
        <View style={styles.resultCover}>
          {book.cover_url ? <Image source={{ uri: book.cover_url }} style={styles.coverImg} /> : <Feather name="book" size={18} color={colors.purple} />}
        </View>
      }
      right={
        <View style={[styles.addBtn, added && styles.addBtnDone]}>
          <Feather name={added ? 'check' : 'plus'} size={16} color={added ? colors.bg : colors.lavender} />
        </View>
      }
    >
      <Text style={styles.resultTitle} numberOfLines={2}>{book.title}</Text>
      <Text style={styles.resultAuthor}>{book.author}</Text>
      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.map((g: string, j: number) => (
            <TouchableOpacity key={j} onPress={(e) => { e.stopPropagation(); onTagPress(g); }} hitSlop={4}>
              <Text style={styles.tagText}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Row>
  );
};

const HorizontalBooks = ({ books, onPress, addedBooks, colors, styles }: { books: any[]; onPress: (book: any) => void; addedBooks: Set<string>; colors: ColorPalette; styles: any }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={{ gap: 12 }}>
    {books.map((book, i) => (
      <TouchableOpacity key={i} style={styles.hCard} onPress={() => onPress(book)}>
        <View style={styles.hCover}>
          {book.cover_url ? <Image source={{ uri: book.cover_url }} style={styles.hCoverImg} /> : <Feather name="book" size={20} color={colors.purple} />}
        </View>
        <Text style={styles.hTitle} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.hAuthor} numberOfLines={1}>{book.author?.split(' ').slice(-1)[0]}</Text>
        {addedBooks.has(book.external_id) && <Feather name="check-circle" size={13} color={colors.teal} style={{ marginTop: 4 }} />}
      </TouchableOpacity>
    ))}
  </ScrollView>
);

export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [addedBooks, setAddedBooks] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState('');
  const [trending, setTrending] = useState<any[]>([]);
  const [popular, setPopular] = useState<any[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [recommended, setRecommended] = useState<any[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { loadTrending(); }, []);
  useEffect(() => onScrollToTop('search', () => scrollRef.current?.scrollTo({ y: 0, animated: true })), []);

  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
      loadRecommendations();
      return () => {
        setQuery('');
        setResults([]);
        setSearched(false);
      };
    }, [])
  );

  const loadRecommendations = () => {
    setLoadingRecs(true);
    userBooks.getMyBooks().then(all => {
      const excludeIds = new Set(all.map(b => b.external_id).filter(Boolean));
      return books.getRecommendations(all, excludeIds);
    }).then(res => { setRecommended(res); setLoadingRecs(false); }).catch(() => setLoadingRecs(false));
  };

  const loadTrending = () => {
    setLoadingTrending(true);
    Promise.all([
      books.getTrending(),
      books.getPopular(),
    ]).then(([trendRes, popRes]) => {
      setTrending(trendRes);
      setPopular(popRes);
      setLoadingTrending(false);
    }).catch(() => setLoadingTrending(false));
  };

  const runSearch = (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(false);
    books.search(q).then(res => {
      setResults(res);
      setLoading(false);
      setSearched(true);
    }).catch(() => {
      setLoading(false);
      setSearched(true);
    });
  };

  const search = () => runSearch(query);

  const searchByTag = (tag: string) => {
    setShowDetail(false);
    setQuery(tag);
    runSearch(tag);
  };

  const openDetail = (book: any) => {
    setSelectedBook(book);
    setShowDetail(true);
    if (!book.description) {
      books.getWorkDescription(book.external_id).then(description => {
        if (description) setSelectedBook((cur: any) => cur?.external_id === book.external_id ? { ...cur, description } : cur);
      });
    }
    books.getBookIdByExternalId(book.external_id).then(bookId => {
      if (!bookId) return;
      Promise.all([userBooks.getBookRatingStats(bookId), userBooks.getBookReviews(bookId)])
        .then(([ratingStats, reviews]) => {
          setSelectedBook((cur: any) => cur?.external_id === book.external_id ? { ...cur, ratingStats, reviews } : cur);
        }).catch(() => {});
    }).catch(() => {});
  };

  const addBook = (book: any, status: string = 'to_read') => {
    if (addedBooks.has(book.external_id)) return;
    books.addBookToDb(book).then(row => {
      userBooks.addBook(row.id, status).then(() => {
        setAddedBooks(new Set([...addedBooks, book.external_id]));
        setShowDetail(false);
        showSuccess(status === 'done' ? `"${book.title}" ajouté aux lus` : `"${book.title}" ajouté à ta pile`);
      });
    }).catch(() => showSuccess("Erreur lors de l'ajout"));
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    const t = setTimeout(() => setSuccessMsg(''), 3000);
    return () => clearTimeout(t);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Chercher</Text>
        <NotificationBell />
      </View>

      <View style={styles.searchBar}>
        <Feather name="search" size={17} color={colors.gray} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Titre, auteur, ISBN..."
          placeholderTextColor={colors.gray}
          returnKeyType="search"
          onSubmitEditing={search}
          autoCapitalize="none"
        />
        {query ? (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
            <Feather name="x" size={16} color={colors.gray} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {loading && <ActivityIndicator color={colors.purple} style={{ marginTop: 32 }} />}

        {!loading && results.length > 0 && (
          <>
            <Text style={styles.resultsCount}>{results.length} résultats pour "{query}"</Text>
            {results.map((book, i) => (
              <BookItem key={i} book={book} onPress={openDetail} onTagPress={searchByTag} added={addedBooks.has(book.external_id)} last={i === results.length - 1} colors={colors} styles={styles} />
            ))}
          </>
        )}

        {!loading && searched && results.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="search" size={36} color={colors.gray} />
            <Text style={styles.emptyText}>Aucun résultat pour "{query}"</Text>
          </View>
        )}

        {!query && !searched && (
          <>
            {!loadingRecs && recommended.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>Pour toi</Text>
                <HorizontalBooks books={recommended} onPress={openDetail} addedBooks={addedBooks} colors={colors} styles={styles} />
              </View>
            )}
            {loadingTrending ? (
              <ActivityIndicator color={colors.purple} style={{ marginTop: 32 }} />
            ) : (
              <>
                {popular.length > 0 && (
                  <View>
                    <Text style={styles.sectionLabel}>Populaires sur Readigma</Text>
                    <HorizontalBooks books={popular} onPress={openDetail} addedBooks={addedBooks} colors={colors} styles={styles} />
                  </View>
                )}
                {trending.map((section, i) => (
                  <View key={i}>
                    <Text style={styles.sectionLabel}>{section.label}</Text>
                    <HorizontalBooks books={section.books} onPress={openDetail} addedBooks={addedBooks} colors={colors} styles={styles} />
                  </View>
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {successMsg ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{successMsg}</Text>
        </View>
      ) : null}

      <Modal visible={showDetail} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDetail(false)}>
          <TouchableOpacity style={styles.modalSheet} activeOpacity={1}>
            <View style={styles.handle} />
            {selectedBook && (
              <>
                <View style={styles.modalBook}>
                  <View style={styles.modalCover}>
                    {selectedBook.cover_url ? <Image source={{ uri: selectedBook.cover_url }} style={styles.modalCoverImg} /> : <Feather name="book" size={28} color={colors.purple} />}
                  </View>
                  <View style={styles.modalInfo}>
                    <Text style={styles.modalTitle}>{selectedBook.title}</Text>
                    <Text style={styles.modalAuthor}>{selectedBook.author}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {selectedBook.published_year ? <Text style={styles.modalYear}>{selectedBook.published_year}</Text> : null}
                      {selectedBook.ratingStats?.ratings_count > 0 && (
                        <View style={styles.ratingBadgeRow}>
                          <Feather name="star" size={11} color={colors.teal} />
                          <Text style={styles.ratingBadgeText}>{selectedBook.ratingStats.avg_rating?.toFixed(1)} · {selectedBook.ratingStats.ratings_count}</Text>
                        </View>
                      )}
                    </View>
                    {selectedBook.genres?.length > 0 && (
                      <View style={styles.modalTags}>
                        {books.normalizeTags(selectedBook.genres).map((g: string, i: number) => (
                          <Pill key={i} label={g} onPress={() => searchByTag(g)} />
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                {(selectedBook.description || selectedBook.reviews?.length > 0) ? (
                  <ScrollView style={styles.descScroll} showsVerticalScrollIndicator={false}>
                    {selectedBook.description ? <Text style={styles.modalDesc}>{selectedBook.description}</Text> : null}
                    {selectedBook.reviews?.length > 0 && (
                      <View style={{ marginTop: selectedBook.description ? 16 : 0 }}>
                        <Text style={styles.reviewsHeader}>Avis des lecteurs</Text>
                        {selectedBook.reviews.map((r: any, i: number) => (
                          <View key={i} style={[styles.reviewItem, i < selectedBook.reviews.length - 1 && styles.reviewDivider]}>
                            <View style={styles.reviewAvatar}>
                              {r.avatar_url ? <Image source={{ uri: r.avatar_url }} style={styles.reviewAvatarImg} /> : <Text style={styles.reviewAvatarText}>{r.username?.slice(0, 2).toUpperCase()}</Text>}
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={styles.reviewHeaderRow}>
                                <Text style={styles.reviewUsername}>@{r.username}</Text>
                                {r.rating ? <Text style={styles.reviewRating}>{Number(r.rating).toFixed(2)} ★</Text> : null}
                              </View>
                              {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </ScrollView>
                ) : null}

                <Text style={styles.addLabel}>Ajouter à ma liste</Text>
                <View style={{ gap: 8 }}>
                  <Button
                    label={addedBooks.has(selectedBook.external_id) ? 'Déjà ajouté' : 'Ajouter à ma pile à lire'}
                    onPress={() => addBook(selectedBook, 'to_read')}
                    disabled={addedBooks.has(selectedBook.external_id)}
                  />
                  <Button
                    label="Je suis en train de lire"
                    variant="ghost"
                    onPress={() => addBook(selectedBook, 'reading')}
                    disabled={addedBooks.has(selectedBook.external_id)}
                  />
                  <Button
                    label="Je l'ai déjà lu"
                    variant="ghost"
                    onPress={() => addBook(selectedBook, 'done')}
                    disabled={addedBooks.has(selectedBook.external_id)}
                  />
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 19, fontFamily: fonts.headingBold, color: colors.white },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
    paddingVertical: 10, marginHorizontal: 20, marginBottom: 12,
  },
  input: { flex: 1, color: colors.white, fontSize: 15 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  resultsCount: { fontSize: 12, color: colors.gray, marginBottom: 4 },
  resultCover: {
    width: 44, height: 60, backgroundColor: colors.card2,
    borderRadius: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  coverImg: { width: 44, height: 60 },
  resultTitle: { fontSize: 13, fontWeight: '700', color: colors.white },
  resultAuthor: { fontSize: 11, color: colors.gray, marginTop: 2 },
  tags: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tagText: { fontSize: 10, color: colors.lavender },
  addBtn: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1, borderColor: colors.divider,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnDone: { backgroundColor: colors.teal, borderColor: colors.teal },
  sectionLabel: { fontSize: 13, fontFamily: fonts.headingBold, color: colors.white, marginTop: 20, marginBottom: 12 },
  hScroll: { marginBottom: 8 },
  hCard: { width: 100, alignItems: 'center' },
  hCover: {
    width: 70, height: 95, backgroundColor: colors.card2,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', marginBottom: 8,
  },
  hCoverImg: { width: 70, height: 95 },
  hTitle: { fontSize: 11, fontWeight: '600', color: colors.white, textAlign: 'center', marginBottom: 2 },
  hAuthor: { fontSize: 10, color: colors.gray, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: colors.gray, fontSize: 14 },
  toast: {
    position: 'absolute', bottom: 90, alignSelf: 'center',
    backgroundColor: colors.teal, paddingHorizontal: 20,
    paddingVertical: 10, borderRadius: 20,
  },
  toastText: { color: colors.bg, fontSize: 13, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40, maxHeight: '85%',
  },
  handle: { width: 36, height: 4, backgroundColor: colors.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalBook: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  modalCover: {
    width: 76, height: 104, backgroundColor: colors.card2,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  modalCoverImg: { width: 76, height: 104 },
  modalInfo: { flex: 1, gap: 4 },
  modalTitle: { fontSize: 16, fontFamily: fonts.headingBold, color: colors.white },
  modalAuthor: { fontSize: 13, color: colors.muted },
  modalYear: { fontSize: 11, color: colors.muted },
  ratingBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingBadgeText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  modalTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  descScroll: { maxHeight: 220, marginBottom: 14 },
  modalDesc: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  reviewsHeader: { fontSize: 11, fontFamily: fonts.headingBold, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
  reviewItem: { flexDirection: 'row', gap: 10, paddingBottom: 12, marginBottom: 12 },
  reviewDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  reviewAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.purpleGlow, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  reviewAvatarImg: { width: 30, height: 30 },
  reviewAvatarText: { fontSize: 11, fontWeight: '700', color: colors.lavender },
  reviewHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  reviewUsername: { fontSize: 12, fontWeight: '700', color: colors.white },
  reviewRating: { fontSize: 11, color: colors.teal, fontWeight: '600' },
  reviewComment: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  addLabel: { fontSize: 12, color: colors.muted, marginBottom: 10, fontWeight: '500' },
});
