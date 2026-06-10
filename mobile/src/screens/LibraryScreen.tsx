import { useFocusEffect } from '@react-navigation/native';
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Alert
} from 'react-native';
import { colors, radius } from '../theme';
import { booksService } from '../services/books.service';

const TABS = [
  { label: 'À lire', value: 'to_read' },
  { label: 'En cours', value: 'reading' },
  { label: 'Lus', value: 'done' },
  { label: 'DNF', value: 'dnf' },
];

export default function LibraryScreen({ navigation }: any) {
  const [activeTab, setActiveTab] = useState('to_read');
  const [allBooks, setAllBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<any>(null);

  useFocusEffect(
    useCallback(() => {
      loadBooks();
    }, [])
  );

  const loadBooks = () => {
    setLoading(true);
    booksService.getMyBooks().then(res => {
      setAllBooks(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const filteredBooks = allBooks.filter(b => b.status === activeTab);
  const counts: any = {};
  allBooks.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });

  const changeStatus = (status: string) => {
    booksService.updateBook(selectedBook.book_id, { status }).then(() => {
      setSelectedBook(null);
      loadBooks();
    });
  };

  const removeBook = () => {
    Alert.alert('Retirer', 'Retirer ce livre de ta liste ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: () => {
        booksService.removeBook(selectedBook.book_id).then(() => {
          setSelectedBook(null);
          loadBooks();
        });
      }}
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ma Bibliothèque</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.tab, activeTab === tab.value && styles.tabActive]}
            onPress={() => setActiveTab(tab.value)}
          >
            <Text style={[styles.tabText, activeTab === tab.value && styles.tabTextActive]}>
              {tab.label}{counts[tab.value] ? ` ${counts[tab.value]}` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.emptyText}>Chargement...</Text>
        ) : filteredBooks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48 }}>📚</Text>
            <Text style={styles.emptyText}>Aucun livre ici</Text>
          </View>
        ) : filteredBooks.map((book, i) => (
          <TouchableOpacity key={i} style={styles.bookItem} onPress={() => navigation.getParent()?.navigate('BookDetail', { book })}>
            <View style={styles.bookCover}>
              <Text style={{ fontSize: 24 }}>📚</Text>
            </View>
            <View style={styles.bookInfo}>
              <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
              <Text style={styles.bookAuthor}>{book.author}</Text>
              <View style={styles.tags}>
                {book.genres?.slice(0, 2).map((g: string, j: number) => (
                  <View key={j} style={styles.tag}>
                    <Text style={styles.tagText}>{g}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.bookRight}>
              {book.rating ? (
                <Text style={styles.rating}>⭐ {book.rating}</Text>
              ) : null}
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); setSelectedBook(book); }}>
                <Text style={styles.moreBtn}>•••</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>

      {selectedBook && (
        <TouchableOpacity style={styles.overlay} onPress={() => setSelectedBook(null)} activeOpacity={1}>
          <TouchableOpacity style={styles.bottomSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{selectedBook.title}</Text>
            {[
              { label: '🔖 À lire', value: 'to_read' },
              { label: '📖 En cours', value: 'reading' },
              { label: '✅ Lu', value: 'done' },
              { label: '❌ Pas fini (DNF)', value: 'dnf' },
            ].map(s => (
              <TouchableOpacity key={s.value} style={styles.sheetBtn} onPress={() => changeStatus(s.value)}>
                <Text style={styles.sheetBtnText}>{s.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetBtnDanger]} onPress={removeBook}>
              <Text style={styles.sheetBtnDangerText}>🗑 Retirer de ma liste</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 20, fontWeight: '700', color: colors.white },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  tab: { flex: 1, padding: 8, borderRadius: 12, alignItems: 'center' },
  tabActive: { backgroundColor: colors.purple },
  tabText: { fontSize: 11, color: colors.gray, fontWeight: '500' },
  tabTextActive: { color: 'white' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: colors.gray, fontSize: 14, textAlign: 'center', paddingTop: 40 },
  bookItem: {
    flexDirection: 'row', gap: 12,
    padding: 12, backgroundColor: colors.card,
    borderRadius: radius.md, marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1, borderColor: colors.divider,
  },
  bookCover: {
    width: 42, height: 58,
    backgroundColor: colors.card2,
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  bookInfo: { flex: 1 },
  bookTitle: { fontSize: 13, fontWeight: '700', color: colors.white },
  bookAuthor: { fontSize: 11, color: colors.gray, marginTop: 2 },
  tags: { flexDirection: 'row', gap: 4, marginTop: 5, flexWrap: 'wrap' },
  tag: {
    backgroundColor: 'rgba(162,155,254,0.1)',
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8,
  },
  tagText: { fontSize: 9, color: colors.lavender },
  bookRight: { alignItems: 'flex-end', gap: 6 },
  rating: { fontSize: 11, color: colors.purple },
  moreBtn: { fontSize: 16, color: colors.gray },
  overlay: {
    position: 'absolute', inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: colors.divider,
    borderRadius: 4,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16, fontWeight: '700',
    color: colors.white, textAlign: 'center', marginBottom: 20,
  },
  sheetBtn: {
    padding: 14, backgroundColor: colors.card2,
    borderRadius: radius.md, marginBottom: 8,
    borderWidth: 1, borderColor: colors.divider,
  },
  sheetBtnText: { color: colors.white, fontSize: 14, fontWeight: '500' },
  sheetBtnDanger: { borderColor: 'rgba(255,107,107,0.3)' },
  sheetBtnDangerText: { color: colors.error, fontSize: 14, fontWeight: '500' },
});