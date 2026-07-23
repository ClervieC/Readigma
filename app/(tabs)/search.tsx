import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Image, ActivityIndicator, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { radius, fonts, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as books from '../../lib/books';
import * as userBooks from '../../lib/userBooks';
import Row from '../../components/Row';
import Pill from '../../components/Pill';
import Button from '../../components/Button';
import NotificationBell from '../../components/NotificationBell';
import { onScrollToTop } from '../../lib/tabScrollEmitter';

// Tags here are display-only (not tappable, unlike the popup/detail
// screens) — the result row is already a tap target for opening that popup,
// so a tag press underneath it would fight for the same gesture. Capped at
// TAG_LIMIT with a trailing "…" pill instead of letting the row grow past
// the card and wrap awkwardly.
const TAG_LIMIT = 2;

const STATUS_OPTIONS: { status: string; labelKey: string }[] = [
  { status: 'to_read', labelKey: 'search.addToToRead' },
  { status: 'reading', labelKey: 'search.currentlyReading' },
  { status: 'done', labelKey: 'search.alreadyRead' },
  { status: 'dnf', labelKey: 'search.didNotFinish' },
];

const BookItem = ({ book, onPress, added, last, colors, styles }: { book: any; onPress: (book: any) => void; added: boolean; last: boolean; colors: ColorPalette; styles: any }) => {
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
          {tags.slice(0, TAG_LIMIT).map((g: string, j: number) => (
            <Pill key={j} label={g} />
          ))}
          {tags.length > TAG_LIMIT && <Pill label="…" />}
        </View>
      )}
    </Row>
  );
};

const HorizontalBooks = ({ books, onPress, isOwned, colors, styles }: { books: any[]; onPress: (book: any) => void; isOwned: (book: any) => boolean; colors: ColorPalette; styles: any }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll} contentContainerStyle={{ gap: 12 }}>
    {books.map((book, i) => (
      <TouchableOpacity key={i} style={styles.hCard} onPress={() => onPress(book)}>
        <View style={styles.hCover}>
          {book.cover_url ? <Image source={{ uri: book.cover_url }} style={styles.hCoverImg} /> : <Feather name="book" size={20} color={colors.purple} />}
        </View>
        <Text style={styles.hTitle} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.hAuthor} numberOfLines={1}>{book.author?.split(' ').slice(-1)[0]}</Text>
        {isOwned(book) && <Feather name="check-circle" size={13} color={colors.teal} style={{ marginTop: 4 }} />}
      </TouchableOpacity>
    ))}
  </ScrollView>
);

export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  // The reader's actual library (external_id + title/author, see
  // userBooks.bookKey) — reloaded on focus and after every add, so a book
  // added in a past session, or via a different search provider (Open
  // Library vs. BnF vs. Google Books each mint their own external_id), still
  // shows as owned, and the popup knows *which* status it already has.
  const [libraryBooks, setLibraryBooks] = useState<userBooks.UserBook[]>([]);
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

  // Deliberately doesn't clear query/results on blur — tapping a result's
  // cover/title (openBookDetail) or "..." menu navigates away to a real
  // route (not just the popup closing), and coming back via the tab/back
  // button should land on the same search, not an empty one.
  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
      loadRecommendations();
      loadLibrary();
    }, [])
  );

  const loadRecommendations = () => {
    setLoadingRecs(true);
    userBooks.getMyBooks().then(all => {
      const excludeIds = new Set(all.map(b => b.external_id).filter(Boolean));
      return books.getRecommendations(all, excludeIds);
    }).then(res => { setRecommended(res); setLoadingRecs(false); }).catch(() => setLoadingRecs(false));
  };

  const loadLibrary = () => {
    userBooks.getMyBooks().then(setLibraryBooks).catch(() => {});
  };

  const findOwned = (book: any): userBooks.UserBook | undefined => {
    if (!book) return undefined;
    const key = userBooks.bookKey(book.title, book.author);
    return libraryBooks.find(b => b.external_id === book.external_id || userBooks.bookKey(b.title, b.author) === key);
  };

  const isOwned = (book: any) => !!findOwned(book);

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

  // Tapping the cover/title in the preview popup goes straight to the full
  // detail page rather than staying in the lightweight sheet — addBookToDb
  // only upserts the shared `books` catalog row (same as openSeriesBook in
  // app/book/[id].tsx), it doesn't add anything to the reader's own list.
  const openBookDetail = (book: any) => {
    books.addBookToDb(book).then(row => {
      setShowDetail(false);
      router.push(`/book/${row.id}`);
    }).catch(() => showSuccess(t('search.addError')));
  };

  const STATUS_TOAST_KEY: Record<string, string> = {
    to_read: 'search.addedToRead',
    reading: 'search.addedToReading',
    done: 'search.addedToDone',
    dnf: 'search.addedToDnf',
  };

  const addBook = (book: any, status: string = 'to_read') => {
    const existing = findOwned(book);
    if (existing?.status === status) return;
    books.addBookToDb(book).then(row => {
      userBooks.addBookSmart(row.id, status, book.title, book.author).then(() => {
        loadLibrary();
        setShowDetail(false);
        showSuccess(t(STATUS_TOAST_KEY[status] ?? 'search.addedToRead', { title: book.title }));
      });
    }).catch(() => showSuccess(t('search.addError')));
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    const timer = setTimeout(() => setSuccessMsg(''), 3000);
    return () => clearTimeout(timer);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('search.title')}</Text>
        <NotificationBell />
      </View>

      <View style={styles.searchBar}>
        <Feather name="search" size={17} color={colors.gray} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.placeholder')}
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
            <Text style={styles.resultsCount}>{t('search.resultsCount', { count: results.length, query })}</Text>
            {results.map((book, i) => (
              <BookItem key={i} book={book} onPress={openDetail} added={isOwned(book)} last={i === results.length - 1} colors={colors} styles={styles} />
            ))}
          </>
        )}

        {!loading && searched && results.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="search" size={36} color={colors.gray} />
            <Text style={styles.emptyText}>{t('search.noResults', { query })}</Text>
          </View>
        )}

        {!query && !searched && (
          <>
            {!loadingRecs && recommended.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>{t('search.forYou')}</Text>
                <HorizontalBooks books={recommended} onPress={openDetail} isOwned={isOwned} colors={colors} styles={styles} />
              </View>
            )}
            {loadingTrending ? (
              <ActivityIndicator color={colors.purple} style={{ marginTop: 32 }} />
            ) : (
              <>
                {popular.length > 0 && (
                  <View>
                    <Text style={styles.sectionLabel}>{t('search.popularOnReadigma')}</Text>
                    <HorizontalBooks books={popular} onPress={openDetail} isOwned={isOwned} colors={colors} styles={styles} />
                  </View>
                )}
                {trending.map((section, i) => (
                  <View key={i}>
                    <Text style={styles.sectionLabel}>{t(section.labelKey)}</Text>
                    <HorizontalBooks books={section.books} onPress={openDetail} isOwned={isOwned} colors={colors} styles={styles} />
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
                  <TouchableOpacity onPress={() => openBookDetail(selectedBook)}>
                    <View style={styles.modalCover}>
                      {selectedBook.cover_url ? <Image source={{ uri: selectedBook.cover_url }} style={styles.modalCoverImg} /> : <Feather name="book" size={28} color={colors.purple} />}
                    </View>
                  </TouchableOpacity>
                  <View style={styles.modalInfo}>
                    <TouchableOpacity onPress={() => openBookDetail(selectedBook)}>
                      <Text style={styles.modalTitle}>{selectedBook.title}</Text>
                      <Text style={styles.modalAuthor}>{selectedBook.author}</Text>
                    </TouchableOpacity>
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
                        <Text style={styles.reviewsHeader}>{t('search.reviewsHeader')}</Text>
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

                <Text style={styles.addLabel}>
                  {findOwned(selectedBook) ? t('search.yourStatus') : t('search.addToList')}
                </Text>
                <View style={{ gap: 8 }}>
                  {STATUS_OPTIONS.map((opt) => {
                    const current = findOwned(selectedBook)?.status === opt.status;
                    return (
                      <Button
                        key={opt.status}
                        label={t(opt.labelKey)}
                        variant={current ? 'primary' : 'ghost'}
                        onPress={() => addBook(selectedBook, opt.status)}
                        disabled={current}
                      />
                    );
                  })}
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
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
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
