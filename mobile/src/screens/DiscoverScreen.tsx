import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Animated, SafeAreaView
} from 'react-native';
import { colors, radius } from '../theme';
import { booksService } from '../services/books.service';
import { authService } from '../services/auth.service';
import { friendsService } from '../services/friends.service';

const FILTERS = [
  { label: 'Tout', value: 'all' },
  { label: 'Fantasy', value: 'Fantasy' },
  { label: 'Thriller', value: 'Thriller' },
  { label: 'Romance', value: 'Romance' },
  { label: 'Sci-Fi', value: 'Science Fiction' },
  { label: 'Fiction', value: 'Fiction' },
];

export default function DiscoverScreen({ navigation }: any) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [spinning, setSpinning] = useState(false);
  const [currentBook, setCurrentBook] = useState<any>(null);
  const [recentBooks, setRecentBooks] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [user, setUser] = useState<any>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    authService.getUser().then(setUser);
  }, []);

  useFocusEffect(
    useCallback(() => {
      booksService.getMyBooks('to_read').then(res => {
        setRecentBooks(res.data.slice(0, 6));
      }).catch(() => {});
      friendsService.getPendingRequests().then(res => {
        setPendingCount(res.data.length);
      }).catch(() => {});
    }, [])
  );

  const addToReading = async () => {
    if (!currentBook) return;
    try {
      await booksService.addBook(currentBook.id, 'reading');
      setCurrentBook(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de l\'ajout');
    }
  };

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setError('');
    setCurrentBook(null);

    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      { iterations: 5 }
    ).start();

    const genre = activeFilter !== 'all' ? activeFilter : undefined;
    setTimeout(() => {
      booksService.randomize(genre).then(res => {
        setCurrentBook(res.data);
        setSpinning(false);
        spinAnim.setValue(0);
      }).catch(err => {
        setError(err.response?.data?.error || 'Aucun livre trouvé');
        setSpinning(false);
        spinAnim.setValue(0);
      });
    }, 1500);
  };

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonsoir,</Text>
          <Text style={styles.logo}>{user?.username || 'Readigma'}</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.getParent()?.navigate('Notifications')}>
          <Text style={{ fontSize: 18 }}>🔔</Text>
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount > 9 ? '9+' : pendingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Quel sera ton prochain livre ?</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[styles.chip, activeFilter === f.value && styles.chipActive]}
              onPress={() => { setActiveFilter(f.value); setCurrentBook(null); setError(''); }}
            >
              <Text style={[styles.chipText, activeFilter === f.value && styles.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={[styles.randCard, currentBook && styles.randCardRevealed]}>
          {!currentBook ? (
            <View style={styles.placeholder}>
              <Animated.Text style={[styles.diceEmoji, { transform: [{ rotate: spinInterpolate }] }]}>
                🎲
              </Animated.Text>
              <Text style={styles.placeholderText}>
                {spinning ? 'Choix en cours...' : 'Lance le dé pour découvrir\nton prochain livre !'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.bookResult}
              onPress={() => navigation.getParent()?.navigate('BookDetail', { book: { ...currentBook, book_id: currentBook.id } })}
              activeOpacity={0.75}
            >
              <View style={styles.bookCoverBig}>
                <Text style={{ fontSize: 40 }}>📚</Text>
              </View>
              <View style={styles.bookDetails}>
                <Text style={styles.bookTitle} numberOfLines={2}>{currentBook.title}</Text>
                <Text style={styles.bookAuthor}>{currentBook.author}</Text>
                <View style={styles.genreBadge}>
                  <Text style={styles.genreText}>{currentBook.genres?.[0] || 'Fiction'}</Text>
                </View>
                <Text style={styles.tapHint}>Appuie pour voir le détail →</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {!currentBook && (
          <TouchableOpacity style={styles.spinBtn} onPress={spin} disabled={spinning}>
            <Text style={styles.spinBtnText}>
              {spinning ? '🎲 En cours...' : '🎲 Choisir pour moi !'}
            </Text>
          </TouchableOpacity>
        )}

        {currentBook && (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actBtn, styles.actBtnTeal]} onPress={addToReading}>
              <Text style={styles.actBtnTealText}>📖 Je lis ça !</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actBtn} onPress={spin}>
              <Text style={styles.actBtnText}>🔄 Autre livre</Text>
            </TouchableOpacity>
          </View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Récemment ajoutés</Text>
          <Text style={styles.seeAll}>Voir tout</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {recentBooks.length === 0 ? (
            <Text style={styles.emptyHint}>Ajoute des livres à ta pile !</Text>
          ) : recentBooks.map((book, i) => (
            <TouchableOpacity
              key={i}
              style={styles.miniCard}
              onPress={() => navigation.getParent()?.navigate('BookDetail', { book })}
              activeOpacity={0.75}
            >
              <View style={styles.miniCover}>
                <Text style={{ fontSize: 26 }}>📚</Text>
              </View>
              <Text style={styles.miniTitle} numberOfLines={2}>{book.title}</Text>
              <Text style={styles.miniAuthor}>{book.author?.split(' ').slice(-1)[0]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  greeting: { fontSize: 11, color: colors.gray },
  logo: { fontSize: 20, fontWeight: '700', color: colors.purple },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.divider,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flex: 1, paddingHorizontal: 16 },
  subtitle: { fontSize: 12, color: colors.gray, marginBottom: 12 },
  filterRow: { marginBottom: 16 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.3)',
    marginRight: 8,
  },
  chipActive: { backgroundColor: colors.purple, borderColor: colors.purple },
  chipText: { fontSize: 12, color: colors.gray },
  chipTextActive: { color: 'white' },
  randCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 2, borderColor: colors.divider,
    padding: 24, marginBottom: 14,
    minHeight: 160,
    alignItems: 'center', justifyContent: 'center',
  },
  randCardRevealed: { borderColor: colors.teal },
  placeholder: { alignItems: 'center' },
  diceEmoji: { fontSize: 48, marginBottom: 12 },
  placeholderText: { fontSize: 14, color: colors.gray, textAlign: 'center', lineHeight: 22 },
  bookResult: { flexDirection: 'row', gap: 16, alignItems: 'center', width: '100%' },
  bookCoverBig: {
    width: 72, height: 100,
    backgroundColor: colors.card2,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  bookDetails: { flex: 1 },
  bookTitle: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: 4 },
  bookAuthor: { fontSize: 12, color: colors.gray, marginBottom: 8 },
  genreBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,206,201,0.1)',
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 20,
  },
  genreText: { fontSize: 10, color: colors.teal },
  spinBtn: {
    backgroundColor: colors.purple,
    borderRadius: radius.md,
    padding: 16,
    alignItems: 'center',
  },
  spinBtnText: { color: 'white', fontSize: 15, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actBtn: {
    flex: 1, padding: 13,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(108,92,231,0.3)',
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  actBtnTeal: { borderColor: 'rgba(0,206,201,0.3)' },
  actBtnText: { color: colors.lavender, fontSize: 13, fontWeight: '500' },
  actBtnTealText: { color: colors.teal, fontSize: 13, fontWeight: '500' },
  errorText: { color: colors.error, textAlign: 'center', fontSize: 13, marginTop: 8 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 20, marginBottom: 10,
  },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.white },
  seeAll: { fontSize: 11, color: colors.lavender },
  miniCard: {
    width: 110, backgroundColor: colors.card,
    borderRadius: radius.md, padding: 12,
    alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.divider,
    marginRight: 10,
  },
  miniCover: {
    width: 44, height: 60,
    backgroundColor: colors.card2,
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  miniTitle: { fontSize: 11, fontWeight: '500', color: colors.white, textAlign: 'center' },
  miniAuthor: { fontSize: 10, color: colors.gray },
  emptyHint: { fontSize: 12, color: colors.gray, paddingVertical: 20 },
  tapHint: { fontSize: 10, color: colors.gray, marginTop: 6, fontStyle: 'italic' },
  badge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, color: 'white', fontWeight: '700' },
});