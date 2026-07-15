import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Alert, Image, useWindowDimensions, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { radius, fonts, shadows, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as userBooks from '../../lib/userBooks';
import Pill from '../../components/Pill';
import NotificationBell from '../../components/NotificationBell';
import { onScrollToTop } from '../../lib/tabScrollEmitter';

const COVER_WIDTH = 92;
const COVER_HEIGHT = 134;
const SHELF_GAP = 18;
const SCREEN_PADDING = 40; // 20 on each side

const TABS = [
  { label: 'À lire', value: 'to_read' },
  { label: 'En cours', value: 'reading' },
  { label: 'Lus', value: 'done' },
  { label: 'DNF', value: 'dnf' },
];

const STATUS_OPTIONS = [
  { label: 'À lire', icon: 'bookmark' as const, value: 'to_read' },
  { label: 'En cours', icon: 'book-open' as const, value: 'reading' },
  { label: 'Lu', icon: 'check' as const, value: 'done' },
  { label: 'Pas fini (DNF)', icon: 'x' as const, value: 'dnf' },
];

export default function LibraryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState('to_read');
  const [query, setQuery] = useState('');
  const [allBooks, setAllBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const scrollRef = useRef<ScrollView>(null);

  const columns = Math.max(3, Math.floor((width - SCREEN_PADDING + SHELF_GAP) / (COVER_WIDTH + SHELF_GAP)));

  useFocusEffect(useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    loadBooks();
  }, []));

  useEffect(() => onScrollToTop('library', () => scrollRef.current?.scrollTo({ y: 0, animated: true })), []);

  const loadBooks = () => {
    setLoading(true);
    userBooks.getMyBooks().then(res => { setAllBooks(res); setLoading(false); }).catch(() => setLoading(false));
  };

  const q = query.trim().toLowerCase();
  const filteredBooks = allBooks
    .filter(b => b.status === activeTab)
    .filter(b => !q || b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q));
  const counts: any = {};
  allBooks.forEach(b => { counts[b.status] = (counts[b.status] || 0) + 1; });

  const shelves: any[][] = [];
  for (let i = 0; i < filteredBooks.length; i += columns) shelves.push(filteredBooks.slice(i, i + columns));

  const changeStatus = (status: string) => {
    userBooks.updateBook(selectedBook.book_id, { status }).then(() => { setSelectedBook(null); loadBooks(); });
  };

  const removeBook = () => {
    const doRemove = () => {
      userBooks.removeBook(selectedBook.book_id).then(() => { setSelectedBook(null); loadBooks(); });
    };
    // RN Web's Alert.alert only ever renders a single-button window.alert —
    // multi-button/destructive-style configs like this one are silently
    // dropped, so the confirm dialog (and thus the remove callback) never
    // appeared on web at all. window.confirm is the web-native equivalent.
    if (Platform.OS === 'web') {
      if (window.confirm('Retirer ce livre de ta liste ?')) doRemove();
      return;
    }
    Alert.alert('Retirer', 'Retirer ce livre de ta liste ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Retirer', style: 'destructive', onPress: doRemove },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Ma Bibliothèque</Text>
        <NotificationBell />
      </View>

      <View style={styles.searchBar}>
        <Feather name="search" size={17} color={colors.gray} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Chercher dans ma bibliothèque..."
          placeholderTextColor={colors.gray}
          autoCapitalize="none"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Feather name="x" size={16} color={colors.gray} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={{ gap: 8 }}>
        {TABS.map(tab => (
          <Pill key={tab.value} active={activeTab === tab.value} onPress={() => setActiveTab(tab.value)}
            label={`${tab.label}${counts[tab.value] ? ` · ${counts[tab.value]}` : ''}`} />
        ))}
      </ScrollView>

      <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <Text style={styles.emptyText}>Chargement...</Text>
        ) : filteredBooks.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name={q ? 'search' : 'book-open'} size={36} color={colors.gray} />
            <Text style={styles.emptyText}>{q ? `Aucun résultat pour "${query}"` : 'Aucun livre ici'}</Text>
          </View>
        ) : shelves.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.shelf}>
            {row.map((book, i) => (
              <Animated.View key={i} entering={FadeInDown.duration(320).delay((rowIdx * columns + i) * 40)}>
              <TouchableOpacity style={styles.bookSlot} activeOpacity={0.8}
                onPress={() => router.push(`/book/${book.book_id}`)}>
                <View style={styles.bookCover}>
                  {book.cover_url ? (
                    <Image source={{ uri: book.cover_url }} style={styles.bookCoverImg} />
                  ) : (
                    <View style={styles.bookCoverFallback}>
                      <Feather name="book" size={22} color={colors.purple} />
                      <Text style={styles.bookCoverFallbackTitle} numberOfLines={3}>{book.title}</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.moreBtn} hitSlop={8}
                    onPress={(e) => { e.stopPropagation(); setSelectedBook(book); }}>
                    <Feather name="more-horizontal" size={13} color={colors.white} />
                  </TouchableOpacity>
                  {book.rating ? (
                    <View style={styles.ratingBadge}>
                      <Text style={styles.ratingBadgeText}>{book.rating}★</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.bookTitle} numberOfLines={1}>{book.title}</Text>
                <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text>
              </TouchableOpacity>
              </Animated.View>
            ))}
            {Array.from({ length: columns - row.length }).map((_, j) => (
              <View key={`pad-${j}`} style={styles.bookSlot} />
            ))}
            <View style={styles.shelfPlank} />
          </View>
        ))}
        <View style={{ height: 20 }} />
      </ScrollView>

      {selectedBook && (
        <TouchableOpacity style={styles.overlay} onPress={() => setSelectedBook(null)} activeOpacity={1}>
          <TouchableOpacity style={styles.bottomSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{selectedBook.title}</Text>
            {STATUS_OPTIONS.map((s, i) => (
              <TouchableOpacity key={s.value} style={[styles.sheetRow, i < STATUS_OPTIONS.length - 1 && styles.sheetDivider]} onPress={() => changeStatus(s.value)}>
                <Feather name={s.icon} size={16} color={colors.white} />
                <Text style={styles.sheetBtnText}>{s.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sheetRow} onPress={removeBook}>
              <Feather name="trash-2" size={16} color={colors.error} />
              <Text style={styles.sheetBtnDangerText}>Retirer de ma liste</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
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
  searchInput: { flex: 1, minWidth: 0, color: colors.white, fontSize: 15 },
  tabs: { flexGrow: 0, paddingHorizontal: 20, marginBottom: 8 },
  scroll: { flex: 1, paddingHorizontal: 20 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: colors.gray, fontSize: 14, textAlign: 'center', paddingTop: 40 },
  shelf: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', paddingBottom: 16, marginBottom: 24, position: 'relative' },
  shelfPlank: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, borderRadius: 2, backgroundColor: colors.teal, opacity: 0.3 },
  bookSlot: { width: COVER_WIDTH, marginRight: SHELF_GAP, marginBottom: 12 },
  bookCover: {
    width: COVER_WIDTH, height: COVER_HEIGHT, backgroundColor: colors.card2, borderRadius: 5,
    overflow: 'hidden', ...shadows.card,
  },
  bookCoverImg: { width: '100%', height: '100%' },
  bookCoverFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8, gap: 8 },
  bookCoverFallbackTitle: { fontSize: 10, color: colors.gray, textAlign: 'center', lineHeight: 13 },
  moreBtn: {
    position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  ratingBadge: { position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  ratingBadgeText: { fontSize: 10, color: colors.teal, fontWeight: '700' },
  bookTitle: { fontSize: 11, fontWeight: '700', color: colors.white, marginTop: 8 },
  bookAuthor: { fontSize: 10, color: colors.gray, marginTop: 1 },
  overlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  bottomSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  handle: { width: 36, height: 4, backgroundColor: colors.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.white, textAlign: 'center', marginBottom: 16 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  sheetDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  sheetBtnText: { color: colors.white, fontSize: 14, fontWeight: '500' },
  sheetBtnDangerText: { color: colors.error, fontSize: 14, fontWeight: '500' },
});
