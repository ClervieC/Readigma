import { useState, useRef, useCallback, useEffect } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated as RNAnimated, Image, TextInput, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn, useSharedValue, useAnimatedStyle, withTiming, interpolateColor } from 'react-native-reanimated';
import { radius, fonts, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useTimer } from '../../context/TimerContext';
import * as userBooks from '../../lib/userBooks';
import * as randomizer from '../../lib/randomizer';
import * as books from '../../lib/books';
import { formatDuration } from '../../lib/timer';
import Pill from '../../components/Pill';
import Button from '../../components/Button';
import NotificationBell from '../../components/NotificationBell';
import ProgressBar from '../../components/ProgressBar';
import { onScrollToTop } from '../../lib/tabScrollEmitter';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return 'Bonsoir';
  if (hour < 18) return 'Bonjour';
  return 'Bonsoir';
}

const FILTERS = [
  { label: 'Tout', value: 'all' },
  { label: 'Fantasy', value: 'Fantasy' },
  { label: 'Thriller', value: 'Thriller' },
  { label: 'Romance', value: 'Romance' },
  { label: 'Sci-Fi', value: 'Science Fiction' },
  { label: 'Fiction', value: 'Fiction' },
];

// Animates width + color on focus instead of just snapping between the two
// styles, so the pager dots actually read as feedback for the swipe.
function ReadingDot({ focused, colors, styles }: { focused: boolean; colors: ColorPalette; styles: any }) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: 220 });
  }, [focused]);

  const dotStyle = useAnimatedStyle(() => ({
    width: 6 + progress.value * 10,
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.divider, colors.purple]),
  }));

  return <Animated.View style={[styles.readingDot, dotStyle]} />;
}

// One page of the horizontal "en cours" scroll — each book manages its own
// progress-editor state independently (mode/inputs), since with several
// books in progress at once they'd otherwise all share one set of fields.
// The reading timer is still a single global session (context/TimerContext),
// so only one card at a time will ever show as actively timing.
function ReadingBookCard({ book, colors, styles, onUpdate }: { book: any; colors: ColorPalette; styles: any; onUpdate: (b: any) => void }) {
  const router = useRouter();
  const { session: timerSession, elapsedSeconds, start: startTimer, stop: stopTimer } = useTimer();
  const [progressMode, setProgressMode] = useState<'pages' | 'percent'>(book.progress_mode ?? 'pages');
  const [pageInput, setPageInput] = useState(book.current_page ? String(book.current_page) : '');
  const [totalInput, setTotalInput] = useState(book.total_pages ? String(book.total_pages) : '');
  const [percentInput, setPercentInput] = useState(book.progress_percent ? String(book.progress_percent) : '');
  const [progressLoading, setProgressLoading] = useState(false);
  const [timerLoading, setTimerLoading] = useState(false);

  const isTimingThisBook = timerSession?.book_id === book.book_id;

  const changeProgressMode = (mode: 'pages' | 'percent') => {
    setProgressMode(mode);
    if (book.progress_mode === mode) return;
    onUpdate({ ...book, progress_mode: mode });
    userBooks.updateBook(book.book_id, { progress_mode: mode }).catch(() => {});
  };

  const toggleTimer = () => {
    setTimerLoading(true);
    (isTimingThisBook ? stopTimer() : startTimer(book.book_id))
      .catch(() => Alert.alert('Erreur', 'Impossible de gérer le chrono'))
      .finally(() => setTimerLoading(false));
  };

  const updateReadingProgress = () => {
    let percent = 0, pages = 0;
    const total = parseInt(totalInput) || 0;
    if (progressMode === 'pages') {
      pages = parseInt(pageInput) || 0;
      if (total > 0) percent = Math.round((pages / total) * 100 * 100) / 100;
    } else {
      percent = parseFloat(percentInput) || 0;
      if (percent > 100) { Alert.alert('Erreur', 'Le pourcentage ne peut pas dépasser 100%'); return; }
    }
    setProgressLoading(true);
    userBooks.updateProgress(book.book_id, { current_page: pages || undefined, total_pages: total || undefined, progress_percent: percent })
      .then((res: any) => onUpdate({ ...book, current_page: pages || book.current_page, total_pages: total || book.total_pages, progress_percent: res?.progress_percent ?? percent }))
      .catch(() => Alert.alert('Erreur', 'Impossible de mettre à jour la progression'))
      .finally(() => setProgressLoading(false));
  };

  return (
    <View style={styles.readingCard}>
      <TouchableOpacity style={styles.readingCardLink} onPress={() => router.push(`/book/${book.book_id}`)} hitSlop={8}>
        <Feather name="arrow-up-right" size={15} color={colors.gray} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.readingTop} onPress={() => router.push(`/book/${book.book_id}`)} activeOpacity={0.75}>
        <View style={styles.readingCover}>
          {book.cover_url ? <Image source={{ uri: book.cover_url }} style={styles.readingCoverImg} /> : <Feather name="book" size={20} color={colors.purple} />}
        </View>
        <View style={styles.readingInfo}>
          <Text style={styles.readingTitle} numberOfLines={2}>{book.title}</Text>
          <Text style={styles.readingAuthor} numberOfLines={1}>{book.author}</Text>
          <View style={{ flex: 1 }} />
          <ProgressBar percent={book.progress_percent || 0} color={colors.teal} trackColor={colors.card2} height={5} />
          <Text style={styles.progressText}>{Math.round(book.progress_percent || 0)}% lu</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.readingDivider} />

      <View style={styles.readingActions}>
        <View style={styles.modeRow}>
          <Pill label="Par pages" active={progressMode === 'pages'} onPress={() => changeProgressMode('pages')} />
          <Pill label="Par %" active={progressMode === 'percent'} onPress={() => changeProgressMode('percent')} />
        </View>

        {progressMode === 'pages' ? (
          <View style={styles.pagesRow}>
            <TextInput style={styles.pageInput} value={pageInput} onChangeText={setPageInput}
              keyboardType="number-pad" placeholder="page" placeholderTextColor={colors.gray} />
            <Text style={styles.slash}>/</Text>
            <TextInput style={styles.pageInput} value={totalInput} onChangeText={setTotalInput}
              keyboardType="number-pad" placeholder="total" placeholderTextColor={colors.gray} />
            <TouchableOpacity style={styles.progressBtn} onPress={updateReadingProgress} disabled={progressLoading} hitSlop={6}>
              <Feather name="check" size={15} color={colors.purple} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.pagesRow}>
            <TextInput style={[styles.pageInput, { flex: 1 }]} value={percentInput} onChangeText={setPercentInput}
              keyboardType="decimal-pad" placeholder="% lu" placeholderTextColor={colors.gray} />
            <Text style={styles.slash}>%</Text>
            <TouchableOpacity style={styles.progressBtn} onPress={updateReadingProgress} disabled={progressLoading} hitSlop={6}>
              <Feather name="check" size={15} color={colors.purple} />
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={[styles.timerBtn, isTimingThisBook && styles.timerBtnActive]} onPress={toggleTimer} disabled={timerLoading}>
          <Feather name={isTimingThisBook ? 'pause' : 'play'} size={13} color={isTimingThisBook ? 'white' : colors.purple} />
          <Text style={[styles.timerBtnText, isTimingThisBook && styles.timerBtnTextActive]}>
            {isTimingThisBook ? formatDuration(elapsedSeconds) : 'Démarrer le chrono'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const READING_CARD_GAP = 12;

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { width: windowWidth } = useWindowDimensions();
  const readingCardWidth = windowWidth - 40; // matches scroll's paddingHorizontal 20 each side
  const [activeFilter, setActiveFilter] = useState('all');
  const [spinning, setSpinning] = useState(false);
  const [currentBook, setCurrentBook] = useState<any>(null);
  const [recentBooks, setRecentBooks] = useState<any[]>([]);
  const [readingBooks, setReadingBooks] = useState<userBooks.UserBook[]>([]);
  const [activeReadingIndex, setActiveReadingIndex] = useState(0);
  const [error, setError] = useState('');
  const spinAnim = useRef(new RNAnimated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    userBooks.getMyBooks('to_read').then(res => setRecentBooks(res.slice(0, 6))).catch(() => {});
    userBooks.getMyBooks('reading').then(setReadingBooks).catch(() => {});
  }, []));

  useEffect(() => onScrollToTop('index', () => scrollRef.current?.scrollTo({ y: 0, animated: true })), []);

  const updateReadingBook = (updated: any) => {
    setReadingBooks(cur => cur.map(b => b.book_id === updated.book_id ? updated : b));
  };

  const addToReading = async () => {
    if (!currentBook) return;
    try {
      await userBooks.addBook(currentBook.book_id, 'reading');
      setCurrentBook(null);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'ajout');
    }
  };

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setError('');
    setCurrentBook(null);
    RNAnimated.loop(RNAnimated.timing(spinAnim, { toValue: 1, duration: 300, useNativeDriver: true }), { iterations: 5 }).start();
    const genre = activeFilter !== 'all' ? activeFilter : undefined;
    setTimeout(() => {
      randomizer.randomize(genre).then(book => {
        setCurrentBook(book);
        setSpinning(false);
        spinAnim.setValue(0);
      }).catch(err => {
        setError(err.message || 'Aucun livre trouvé');
        setSpinning(false);
        spinAnim.setValue(0);
      });
    }, 1500);
  };

  const spinInterpolate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.logo}>{profile?.username || 'Readigma'}</Text>
        </View>
        <NotificationBell />
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} showsVerticalScrollIndicator={false}>
        {readingBooks.length > 0 && (
          <View style={{ marginBottom: 28 }}>
            <View style={styles.readingHeaderRow}>
              <Text style={styles.eyebrow}>En cours de lecture{readingBooks.length > 1 ? ` · ${readingBooks.length}` : ''}</Text>
            </View>

            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              snapToInterval={readingCardWidth + READING_CARD_GAP} decelerationRate="fast"
              contentContainerStyle={{ gap: READING_CARD_GAP }}
              scrollEventThrottle={16}
              onScroll={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / (readingCardWidth + READING_CARD_GAP));
                setActiveReadingIndex(cur => cur === index ? cur : Math.max(0, Math.min(index, readingBooks.length - 1)));
              }}
            >
              {readingBooks.map((book) => (
                <View key={book.book_id} style={{ width: readingCardWidth }}>
                  <ReadingBookCard book={book} colors={colors} styles={styles} onUpdate={updateReadingBook} />
                </View>
              ))}
            </ScrollView>

            {readingBooks.length > 1 && (
              <View style={styles.readingDots}>
                {readingBooks.map((_, i) => (
                  <ReadingDot key={i} focused={i === activeReadingIndex} colors={colors} styles={styles} />
                ))}
              </View>
            )}
          </View>
        )}

        <Text style={styles.eyebrow}>Découverte</Text>
        <Text style={styles.subtitle}>Quel sera ton prochain livre ?</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8 }}>
          {FILTERS.map(f => (
            <Pill key={f.value} label={f.label} active={activeFilter === f.value}
              onPress={() => { setActiveFilter(f.value); setCurrentBook(null); setError(''); }} />
          ))}
        </ScrollView>

        <View style={[styles.randCard, currentBook && styles.randCardRevealed]}>
          {!currentBook ? (
            <View style={styles.placeholder}>
              <RNAnimated.View style={{ transform: [{ rotate: spinInterpolate }], marginBottom: 14 }}>
                <Feather name="shuffle" size={30} color={colors.purple} />
              </RNAnimated.View>
              <Text style={styles.placeholderText}>{spinning ? 'Choix en cours...' : 'Lance le tirage pour découvrir\nton prochain livre'}</Text>
            </View>
          ) : (
            <Animated.View entering={ZoomIn.duration(320).springify().damping(14)} style={{ width: '100%' }}>
              <TouchableOpacity style={styles.bookResult}
                onPress={() => router.push(`/book/${currentBook.book_id}`)}
                activeOpacity={0.75}>
                <View style={styles.bookCoverBig}>
                  {currentBook.cover_url ? <Image source={{ uri: currentBook.cover_url }} style={styles.bookCoverBigImg} /> : <Feather name="book" size={26} color={colors.purple} />}
                </View>
                <View style={styles.bookDetails}>
                  <Text style={styles.bookTitle} numberOfLines={2}>{currentBook.title}</Text>
                  <Text style={styles.bookAuthor}>{currentBook.author}</Text>
                  {books.normalizeTags(currentBook.genres)[0] ? <Pill label={books.normalizeTags(currentBook.genres)[0]} tone="gilt" /> : null}
                  <Text style={styles.tapHint}>Appuie pour voir le détail →</Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        {!currentBook && (
          <Button label={spinning ? 'Tirage en cours...' : 'Choisir pour moi'} onPress={spin} disabled={spinning} />
        )}

        {currentBook && (
          <Animated.View entering={FadeInDown.duration(280).delay(80)} style={styles.actionsRow}>
            <Button label="Je lis ça" onPress={addToReading} style={{ flex: 1 }} />
            <Button label="Autre livre" onPress={spin} variant="ghost" style={{ flex: 1 }} />
          </Animated.View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.eyebrow}>Ta pile</Text>
            <Text style={styles.sectionLabel}>Récemment ajoutés</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/library')} hitSlop={8}>
            <Text style={styles.seeAll}>Voir tout</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {recentBooks.length === 0 ? (
            <Text style={styles.emptyHint}>Ajoute des livres à ta pile !</Text>
          ) : recentBooks.map((book, i) => (
            <Animated.View key={i} entering={FadeInDown.duration(300).delay(i * 50)}>
              <TouchableOpacity style={styles.miniCard}
                onPress={() => router.push(`/book/${book.book_id}`)} activeOpacity={0.75}>
                <View style={styles.miniCover}>
                  {book.cover_url ? <Image source={{ uri: book.cover_url }} style={styles.miniCoverImg} /> : <Feather name="book" size={18} color={colors.purple} />}
                </View>
                <Text style={styles.miniTitle} numberOfLines={2}>{book.title}</Text>
                <Text style={styles.miniAuthor}>{book.author?.split(' ').slice(-1)[0]}</Text>
              </TouchableOpacity>
            </Animated.View>
          ))}
        </ScrollView>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  greeting: { fontSize: 11, color: colors.gray },
  logo: { fontSize: 19, fontFamily: fonts.headingBold, color: colors.purple },
  scroll: { flex: 1, paddingHorizontal: 20 },
  eyebrow: { fontSize: 10, color: colors.teal, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700' },
  subtitle: { fontSize: 18, fontFamily: fonts.heading, color: colors.white, marginTop: 4, marginBottom: 16 },
  readingCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: 16,
  },
  readingCardLink: { position: 'absolute', top: 14, right: 14, zIndex: 1 },
  readingHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  readingDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  readingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.divider },
  readingTop: { flexDirection: 'row', gap: 14, paddingRight: 22 },
  readingCover: { width: 56, height: 80, backgroundColor: colors.card2, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  readingCoverImg: { width: 56, height: 80 },
  readingInfo: { flex: 1, justifyContent: 'flex-start' },
  readingTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.white, marginBottom: 3 },
  readingAuthor: { fontSize: 11, color: colors.gray },
  progressText: { fontSize: 10, color: colors.teal, marginTop: 4 },
  readingDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 16 },
  readingActions: { gap: 10 },
  modeRow: { flexDirection: 'row', gap: 8 },
  pagesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageInput: { flex: 1, minWidth: 0, backgroundColor: colors.card2, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 10, color: colors.white, fontSize: 13, textAlign: 'center' },
  slash: { fontSize: 14, color: colors.gray },
  progressBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.purpleGlow, alignItems: 'center', justifyContent: 'center' },
  timerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.purple, borderRadius: radius.md, paddingVertical: 10 },
  timerBtnActive: { backgroundColor: colors.purple },
  timerBtnText: { fontSize: 13, fontWeight: '600', color: colors.purple, fontVariant: ['tabular-nums'] },
  timerBtnTextActive: { color: 'white' },
  filterRow: { marginBottom: 20 },
  randCard: { borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.divider, padding: 24, marginBottom: 16, minHeight: 160, alignItems: 'center', justifyContent: 'center' },
  randCardRevealed: { borderStyle: 'solid', borderColor: colors.divider },
  placeholder: { alignItems: 'center' },
  placeholderText: { fontSize: 14, color: colors.gray, textAlign: 'center', lineHeight: 22 },
  bookResult: { flexDirection: 'row', gap: 16, alignItems: 'center', width: '100%' },
  bookCoverBig: { width: 64, height: 88, backgroundColor: colors.card2, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bookCoverBigImg: { width: 64, height: 88 },
  bookDetails: { flex: 1, gap: 6 },
  bookTitle: { fontSize: 15, fontWeight: '700', color: colors.white },
  bookAuthor: { fontSize: 12, color: colors.gray },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  errorText: { color: colors.error, textAlign: 'center', fontSize: 13, marginTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 28, marginBottom: 14 },
  sectionLabel: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.white, marginTop: 3 },
  seeAll: { fontSize: 11, color: colors.lavender },
  miniCard: { width: 100, alignItems: 'center', gap: 8 },
  miniCover: { width: 64, height: 64, backgroundColor: colors.card2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  miniCoverImg: { width: 64, height: 64 },
  miniTitle: { fontSize: 11, fontWeight: '500', color: colors.white, textAlign: 'center' },
  miniAuthor: { fontSize: 10, color: colors.gray },
  emptyHint: { fontSize: 12, color: colors.gray, paddingVertical: 20 },
  tapHint: { fontSize: 10, color: colors.gray, fontStyle: 'italic' },
});
