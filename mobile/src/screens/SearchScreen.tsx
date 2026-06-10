import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Image, ActivityIndicator, Modal
} from 'react-native';
import { colors, radius } from '../theme';
import { booksService } from '../services/books.service';

const BookItem = ({ book, onPress, addedBooks }: { book: any; onPress: (book: any) => void; addedBooks: Set<string> }) => (
  <TouchableOpacity style={styles.resultItem} onPress={() => onPress(book)}>
    <View style={styles.resultCover}>
      {book.cover_url ? (
        <Image source={{ uri: book.cover_url }} style={styles.coverImg} />
      ) : (
        <Text style={{ fontSize: 24 }}>📚</Text>
      )}
    </View>
    <View style={styles.resultInfo}>
      <Text style={styles.resultTitle} numberOfLines={2}>{book.title}</Text>
      <Text style={styles.resultAuthor}>{book.author}</Text>
      {book.published_year ? <Text style={styles.resultYear}>{book.published_year}</Text> : null}
      {book.genres?.length ? (
        <View style={styles.tags}>
          {book.genres.slice(0, 2).map((g: string, j: number) => (
            <View key={j} style={styles.tag}>
              <Text style={styles.tagText}>{g}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
    <View style={[styles.addBtn, addedBooks.has(book.google_books_id) && styles.addBtnDone]}>
      <Text style={{ fontSize: 18, color: addedBooks.has(book.google_books_id) ? colors.bg : colors.lavender }}>
        {addedBooks.has(book.google_books_id) ? '✓' : '+'}
      </Text>
    </View>
  </TouchableOpacity>
);

const HorizontalBooks = ({ books, onPress, addedBooks }: { books: any[]; onPress: (book: any) => void; addedBooks: Set<string> }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
    {books.map((book, i) => (
      <TouchableOpacity key={i} style={styles.hCard} onPress={() => onPress(book)}>
        <View style={styles.hCover}>
          {book.cover_url ? (
            <Image source={{ uri: book.cover_url }} style={styles.hCoverImg} />
          ) : (
            <Text style={{ fontSize: 28 }}>📚</Text>
          )}
        </View>
        <Text style={styles.hTitle} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.hAuthor} numberOfLines={1}>{book.author?.split(' ').slice(-1)[0]}</Text>
        {addedBooks.has(book.google_books_id) && (
          <View style={styles.hAdded}><Text style={{ fontSize: 10, color: colors.bg }}>✓ Ajouté</Text></View>
        )}
      </TouchableOpacity>
    ))}
  </ScrollView>
);

export default function SearchScreen() {
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

  useEffect(() => { loadTrending(); }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setQuery('');
        setResults([]);
        setSearched(false);
      };
    }, [])
  );

  const loadTrending = () => {
    setLoadingTrending(true);
    Promise.all([
      booksService.getTrending(),
      booksService.getPopular(),
    ]).then(([trendRes, popRes]) => {
      setTrending(trendRes.data);
      setPopular(popRes.data);
      setLoadingTrending(false);
    }).catch(() => setLoadingTrending(false));
  };

  const search = () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(false);
    booksService.search(query).then(res => {
      setResults(res.data);
      setLoading(false);
      setSearched(true);
    }).catch(() => {
      setLoading(false);
      setSearched(true);
    });
  };

  const openDetail = (book: any) => {
    setSelectedBook(book);
    setShowDetail(true);
  };

  const addBook = (book: any, status: string = 'to_read') => {
    if (addedBooks.has(book.google_books_id)) return;
    booksService.addBookToDb(book).then(res => {
      booksService.addBook(res.data.id, status).then(() => {
        setAddedBooks(new Set([...addedBooks, book.google_books_id]));
        setShowDetail(false);
        showSuccess(status === 'done' ? `"${book.title}" ajouté aux lus !` : `"${book.title}" ajouté à ta pile !`);
      });
    }).catch(() => showSuccess("Erreur lors de l'ajout"));
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chercher</Text>
      </View>

      <View style={styles.searchBar}>
        <Text style={{ fontSize: 18, color: colors.gray }}>🔍</Text>
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
            <Text style={{ fontSize: 16, color: colors.gray }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {loading && <ActivityIndicator color={colors.purple} style={{ marginTop: 32 }} />}

        {!loading && results.length > 0 && (
          <>
            <Text style={styles.resultsCount}>{results.length} résultats pour "{query}"</Text>
            {results.map((book, i) => (
              <BookItem key={i} book={book} onPress={openDetail} addedBooks={addedBooks} />
            ))}
          </>
        )}

        {!loading && searched && results.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48 }}>🔍</Text>
            <Text style={styles.emptyText}>Aucun résultat pour "{query}"</Text>
          </View>
        )}

        {!query && !searched && (
          <>
            {loadingTrending ? (
              <ActivityIndicator color={colors.purple} style={{ marginTop: 32 }} />
            ) : (
              <>
                {popular.length > 0 && (
                  <>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionLabel}>📚 Populaires sur Readigma</Text>
                    </View>
                    {popular.slice(0, 4).map((book, i) => (
                      <BookItem key={i} book={book} onPress={openDetail} addedBooks={addedBooks} />
                    ))}
                  </>
                )}
                {trending.map((section, i) => (
                  <View key={i}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionLabel}>{section.label}</Text>
                    </View>
                    <HorizontalBooks books={section.books} onPress={openDetail} addedBooks={addedBooks} />
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
                    {selectedBook.cover_url ? (
                      <Image source={{ uri: selectedBook.cover_url }} style={styles.modalCoverImg} />
                    ) : (
                      <Text style={{ fontSize: 40 }}>📚</Text>
                    )}
                  </View>
                  <View style={styles.modalInfo}>
                    <Text style={styles.modalTitle}>{selectedBook.title}</Text>
                    <Text style={styles.modalAuthor}>{selectedBook.author}</Text>
                    {selectedBook.published_year ? (
                      <Text style={styles.modalYear}>📅 {selectedBook.published_year}</Text>
                    ) : null}
                    {selectedBook.genres?.length > 0 && (
                      <View style={styles.modalTags}>
                        {selectedBook.genres.slice(0, 2).map((g: string, i: number) => (
                          <View key={i} style={styles.tag}>
                            <Text style={styles.tagText}>{g}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                {selectedBook.description ? (
                  <ScrollView style={styles.descScroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.modalDesc}>{selectedBook.description}</Text>
                  </ScrollView>
                ) : null}

                <Text style={styles.addLabel}>Ajouter à ma liste</Text>

                <TouchableOpacity
                  style={[styles.addStatusBtn, { backgroundColor: addedBooks.has(selectedBook.google_books_id) ? colors.card2 : colors.purple }]}
                  onPress={() => addBook(selectedBook, 'to_read')}
                  disabled={addedBooks.has(selectedBook.google_books_id)}
                >
                  <Text style={styles.addStatusBtnText}>
                    {addedBooks.has(selectedBook.google_books_id) ? '✓ Déjà ajouté' : '🔖 Ajouter à ma pile à lire'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addStatusBtn, { backgroundColor: 'rgba(0,206,201,0.15)', borderWidth: 1, borderColor: colors.teal }]}
                  onPress={() => addBook(selectedBook, 'reading')}
                  disabled={addedBooks.has(selectedBook.google_books_id)}
                >
                  <Text style={[styles.addStatusBtnText, { color: colors.teal }]}>📖 Je suis en train de lire</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.addStatusBtn, { backgroundColor: 'rgba(162,155,254,0.1)', borderWidth: 1, borderColor: colors.lavender }]}
                  onPress={() => addBook(selectedBook, 'done')}
                  disabled={addedBooks.has(selectedBook.google_books_id)}
                >
                  <Text style={[styles.addStatusBtnText, { color: colors.lavender }]}>✅ Je l'ai déjà lu</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', color: colors.white },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: radius.md,
    padding: 12, marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: colors.divider,
  },
  input: { flex: 1, color: colors.white, fontSize: 15 },
  scroll: { flex: 1, paddingHorizontal: 16 },
  resultsCount: { fontSize: 12, color: colors.gray, marginBottom: 12, marginTop: 4 },
  resultItem: {
    flexDirection: 'row', gap: 12, padding: 12,
    backgroundColor: colors.card, borderRadius: radius.md,
    marginBottom: 8, alignItems: 'center',
    borderWidth: 1, borderColor: colors.divider,
  },
  resultCover: {
    width: 48, height: 64, backgroundColor: colors.card2,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  coverImg: { width: 48, height: 64 },
  resultInfo: { flex: 1 },
  resultTitle: { fontSize: 13, fontWeight: '700', color: colors.white },
  resultAuthor: { fontSize: 11, color: colors.gray, marginTop: 2 },
  resultYear: { fontSize: 10, color: colors.gray, marginTop: 2 },
  tags: { flexDirection: 'row', gap: 4, marginTop: 5, flexWrap: 'wrap' },
  tag: { backgroundColor: 'rgba(162,155,254,0.1)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  tagText: { fontSize: 9, color: colors.lavender },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(108,92,231,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnDone: { backgroundColor: colors.teal, borderColor: colors.teal },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.white },
  hScroll: { marginBottom: 8 },
  hCard: {
    width: 110, backgroundColor: colors.card,
    borderRadius: radius.md, padding: 10,
    alignItems: 'center', marginRight: 10,
    borderWidth: 1, borderColor: colors.divider,
  },
  hCover: {
    width: 70, height: 95, backgroundColor: colors.card2,
    borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', marginBottom: 8,
  },
  hCoverImg: { width: 70, height: 95 },
  hTitle: { fontSize: 11, fontWeight: '600', color: colors.white, textAlign: 'center', marginBottom: 2 },
  hAuthor: { fontSize: 10, color: colors.gray, textAlign: 'center' },
  hAdded: {
    marginTop: 4, backgroundColor: colors.teal,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
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
  handle: { width: 40, height: 4, backgroundColor: colors.divider, borderRadius: 4, alignSelf: 'center', marginBottom: 16 },
  modalBook: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  modalCover: {
    width: 80, height: 110, backgroundColor: colors.card2,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  modalCoverImg: { width: 80, height: 110 },
  modalInfo: { flex: 1 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 4 },
  modalAuthor: { fontSize: 13, color: colors.gray, marginBottom: 4 },
  modalYear: { fontSize: 11, color: colors.gray, marginBottom: 6 },
  modalTags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  descScroll: { maxHeight: 100, marginBottom: 14 },
  modalDesc: { fontSize: 13, color: colors.gray, lineHeight: 19 },
  addLabel: { fontSize: 12, color: colors.gray, marginBottom: 10, fontWeight: '500' },
  addStatusBtn: { padding: 14, borderRadius: radius.md, alignItems: 'center', marginBottom: 8 },
  addStatusBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
});