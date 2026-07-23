import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Animated as RNAnimated,
  Image,
  TextInput,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Animated, {
  FadeInDown,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from "react-native-reanimated";
import { radius, fonts, ColorPalette } from "../../theme";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useTimer } from "../../context/TimerContext";
import * as userBooks from "../../lib/userBooks";
import * as books from "../../lib/books";
import * as badges from "../../lib/badges";
import { formatDuration } from "../../lib/timer";
import Pill from "../../components/Pill";
import Button from "../../components/Button";
import NotificationBell from "../../components/NotificationBell";
import ProgressBar from "../../components/ProgressBar";
import { onScrollToTop } from "../../lib/tabScrollEmitter";

// Returns a translation key rather than translated text directly — this is
// a plain function, not a component, so it has no useTranslation() of its
// own; the call site below resolves the key with its own `t`.
function getGreetingKey() {
  const hour = new Date().getHours();
  if (hour < 6) return "discover.greetingEvening";
  if (hour < 18) return "discover.greetingMorning";
  return "discover.greetingEvening";
}

const ALL_FILTER = { labelKey: "discover.allFilter", value: "all" };

// `books.genres` mixes real genres with trope/theme-ish subject tags (Open
// Library/Google Books subjects aren't structured — see normalizeTags in
// lib/books.ts), so "Découverte"'s filter pills are matched against this
// curated whitelist rather than showing every raw tag. Each genre has a
// stable, language-independent `id` used for matching/state, plus a
// `labelKey` used only for display so it can follow the active language.
const KNOWN_GENRES: { id: string; labelKey: string; match: string[] }[] = [
  { id: "fantasy", labelKey: "discover.genres.fantasy", match: ["fantasy", "fantastique"] },
  {
    id: "scifi",
    labelKey: "discover.genres.scifi",
    match: ["science fiction", "science-fiction", "sci-fi"],
  },
  { id: "romance", labelKey: "discover.genres.romance", match: ["romance", "love stor"] },
  { id: "thriller", labelKey: "discover.genres.thriller", match: ["thriller"] },
  {
    id: "mystery",
    labelKey: "discover.genres.mystery",
    match: ["mystery", "detective", "policier", "crime", "polar"],
  },
  { id: "horror", labelKey: "discover.genres.horror", match: ["horror", "horreur"] },
  { id: "youngAdult", labelKey: "discover.genres.youngAdult", match: ["young adult"] },
  { id: "historical", labelKey: "discover.genres.historical", match: ["historical", "historique"] },
  { id: "biography", labelKey: "discover.genres.biography", match: ["biography", "autobiography", "biographie"] },
  { id: "poetry", labelKey: "discover.genres.poetry", match: ["poetry", "poésie", "poesie"] },
  { id: "adventure", labelKey: "discover.genres.adventure", match: ["adventure", "aventure"] },
  { id: "drama", labelKey: "discover.genres.drama", match: ["drama", "drame"] },
  { id: "dystopia", labelKey: "discover.genres.dystopia", match: ["dystopia", "dystopie"] },
  { id: "contemporary", labelKey: "discover.genres.contemporary", match: ["contemporary", "contemporain"] },
  { id: "fiction", labelKey: "discover.genres.fiction", match: ["fiction"] },
];

// Within a series, only the earliest not-yet-read tome should ever be
// proposed — `books` is already just the "to_read" pool, so a tome already
// finished won't appear here at all; this only needs to pick the lowest
// series_index among the ones still left, so a random draw can't jump ahead
// to tome 4 while tome 3 is still unread.
function dedupeSeries(books: userBooks.UserBook[]): userBooks.UserBook[] {
  const bySeries = new Map<string, userBooks.UserBook>();
  const result: userBooks.UserBook[] = [];
  for (const b of books) {
    if (!b.series) {
      result.push(b);
      continue;
    }
    const current = bySeries.get(b.series);
    if (!current || (b.series_index ?? Infinity) < (current.series_index ?? Infinity)) {
      bySeries.set(b.series, b);
    }
  }
  return [...result, ...bySeries.values()];
}

function matchKnownGenres(rawTags: string[]): Set<string> {
  const found = new Set<string>();
  for (const raw of rawTags) {
    const lower = raw.toLowerCase();
    for (const genre of KNOWN_GENRES) {
      if (genre.match.some((m) => lower.includes(m))) found.add(genre.id);
    }
  }
  return found;
}

// Animates width + color on focus instead of just snapping between the two
// styles, so the pager dots actually read as feedback for the swipe.
function ReadingDot({
  focused,
  colors,
  styles,
}: {
  focused: boolean;
  colors: ColorPalette;
  styles: any;
}) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: 220 });
  }, [focused]);

  const dotStyle = useAnimatedStyle(() => ({
    width: 6 + progress.value * 10,
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.divider, colors.purple],
    ),
  }));

  return <Animated.View style={[styles.readingDot, dotStyle]} />;
}

function ReadingBookCard({
  book,
  colors,
  styles,
  onUpdate,
  onFinish,
}: {
  book: any;
  colors: ColorPalette;
  styles: any;
  onUpdate: (b: any) => void;
  onFinish: (bookId: string) => void;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    session: timerSession,
    elapsedSeconds,
    stop: stopTimer,
    countdown,
    countdownBookId,
    startWithCountdown,
    cancelCountdown,
  } = useTimer();
  const [finishing, setFinishing] = useState(false);

  // A lightweight "mark done" straight from the card — no rating/comment
  // prompt here (that's still available from the book's own detail page);
  // this is for the common case of just wanting it off the "en cours" list.
  const finishBook = () => {
    setFinishing(true);
    userBooks
      .updateBook(book.book_id, { status: "done" })
      .then(() => onFinish(book.book_id))
      .catch(() =>
        Alert.alert(t("common.error"), t("discover.errors.finishBookFailed")),
      )
      .finally(() => setFinishing(false));
  };

  // Mode is set from the book's detail page (where both options make sense) and
  // just followed here — mid-book you're filling this in on the fly, not
  // re-deciding how you track progress, so the toggle would only add clutter.
  const progressMode: "pages" | "percent" = book.progress_mode ?? "pages";
  const [pageInput, setPageInput] = useState(
    book.current_page ? String(book.current_page) : "",
  );
  const [totalInput, setTotalInput] = useState(
    book.total_pages ? String(book.total_pages) : "",
  );
  const [percentInput, setPercentInput] = useState(
    book.progress_percent ? String(book.progress_percent) : "",
  );
  const [progressLoading, setProgressLoading] = useState(false);
  const [timerLoading, setTimerLoading] = useState(false);

  const isTimingThisBook = timerSession?.book_id === book.book_id;
  const isCountingDown = countdown !== null && countdownBookId === book.book_id;

  const toggleTimer = () => {
    if (isCountingDown) {
      cancelCountdown();
      return;
    }
    if (isTimingThisBook) {
      setTimerLoading(true);
      stopTimer()
        .catch(() => Alert.alert(t("common.error"), t("discover.errors.timerFailed")))
        .finally(() => setTimerLoading(false));
      return;
    }
    startWithCountdown(book.book_id);
  };

  const updateReadingProgress = () => {
    // A blur/submit can fire mid-edit (e.g. field cleared then tapped away from);
    // bail out instead of silently zeroing progress that was already saved.
    if (progressMode === "pages" ? !pageInput.trim() : !percentInput.trim())
      return;
    let percent = 0,
      pages = 0;
    const total = parseInt(totalInput) || 0;
    if (progressMode === "pages") {
      pages = parseInt(pageInput) || 0;
      if (total > 0) percent = Math.round((pages / total) * 100 * 100) / 100;
    } else {
      percent = parseFloat(percentInput) || 0;
      if (percent > 100) {
        Alert.alert(t("common.error"), t("book.errors.percentOver100"));
        return;
      }
    }
    setProgressLoading(true);
    userBooks
      .updateProgress(book.book_id, {
        current_page: pages || undefined,
        total_pages: total || undefined,
        progress_percent: percent,
      })
      .then((res: any) =>
        onUpdate({
          ...book,
          current_page: pages || book.current_page,
          total_pages: total || book.total_pages,
          progress_percent: res?.progress_percent ?? percent,
        }),
      )
      .catch(() =>
        Alert.alert(t("common.error"), t("discover.errors.updateProgressFailed")),
      )
      .finally(() => setProgressLoading(false));
  };

  return (
    <View style={styles.readingCard}>
      <TouchableOpacity
        style={styles.readingCardLink}
        onPress={() => router.push(`/book/${book.book_id}`)}
        hitSlop={8}
      >
        <Feather name="arrow-up-right" size={15} color={colors.gray} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.readingTop}
        onPress={() => router.push(`/book/${book.book_id}`)}
        activeOpacity={0.75}
      >
        <View style={styles.readingCover}>
          {book.cover_url ? (
            <Image
              source={{ uri: book.cover_url }}
              style={styles.readingCoverImg}
            />
          ) : (
            <Feather name="book" size={20} color={colors.purple} />
          )}
        </View>
        <View style={styles.readingInfo}>
          <Text style={styles.readingTitle} numberOfLines={2}>
            {book.title}
          </Text>
          <Text style={styles.readingAuthor} numberOfLines={1}>
            {book.author}
          </Text>
          <View style={{ flex: 1 }} />
          <ProgressBar
            percent={book.progress_percent || 0}
            color={colors.teal}
            trackColor={colors.card2}
            height={5}
          />
          <Text style={styles.progressText}>
            {t("discover.percentRead", { percent: Math.round(book.progress_percent || 0) })}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.readingDivider} />

      <View style={styles.readingActionsRow}>
        {progressMode === "pages" ? (
          <View style={styles.pagesRow}>
            <Feather
              name="hash"
              size={13}
              color={colors.gray}
              style={styles.pagesRowIcon}
            />
            <TextInput
              style={styles.pageInput}
              value={pageInput}
              onChangeText={setPageInput}
              keyboardType="number-pad"
              placeholder={t("discover.page")}
              placeholderTextColor={colors.gray}
              selectTextOnFocus
              onBlur={updateReadingProgress}
              onSubmitEditing={updateReadingProgress}
              returnKeyType="done"
            />
            <Text style={styles.slash}>/</Text>
            <TextInput
              style={styles.pageInput}
              value={totalInput}
              onChangeText={setTotalInput}
              keyboardType="number-pad"
              placeholder={t("discover.total")}
              placeholderTextColor={colors.gray}
              selectTextOnFocus
              onBlur={updateReadingProgress}
              onSubmitEditing={updateReadingProgress}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={styles.progressBtn}
              onPress={updateReadingProgress}
              disabled={progressLoading}
              hitSlop={6}
            >
              {progressLoading ? (
                <ActivityIndicator size="small" color={colors.purple} />
              ) : (
                <Feather name="check" size={15} color={colors.purple} />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.pagesRow}>
            <TextInput
              style={[styles.pageInput, { width: 65 }]}
              value={percentInput}
              onChangeText={setPercentInput}
              keyboardType="decimal-pad"
              placeholder={t("discover.percentPlaceholder")}
              placeholderTextColor={colors.gray}
              selectTextOnFocus
              onBlur={updateReadingProgress}
              onSubmitEditing={updateReadingProgress}
              returnKeyType="done"
            />
            <Feather
              name="percent"
              size={13}
              color={colors.gray}
              style={styles.pagesRowIcon}
            />
            <TouchableOpacity
              style={styles.progressBtn}
              onPress={updateReadingProgress}
              disabled={progressLoading}
              hitSlop={6}
            >
              {progressLoading ? (
                <ActivityIndicator size="small" color={colors.purple} />
              ) : (
                <Feather name="check" size={15} color={colors.purple} />
              )}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.timerBtn,
            (isTimingThisBook || isCountingDown) && styles.timerBtnActive,
          ]}
          onPress={toggleTimer}
          disabled={timerLoading}
        >
          {timerLoading ? (
            <ActivityIndicator size="small" color={colors.purple} />
          ) : (
            <Feather
              name={isCountingDown ? "x" : isTimingThisBook ? "pause" : "play"}
              size={13}
              color={isTimingThisBook || isCountingDown ? "white" : colors.purple}
            />
          )}
          <Text
            style={[
              styles.timerBtnText,
              (isTimingThisBook || isCountingDown) && styles.timerBtnTextActive,
            ]}
          >
            {isCountingDown
              ? t("discover.startingIn", { count: countdown })
              : isTimingThisBook
                ? formatDuration(elapsedSeconds)
                : t("discover.timerShort")}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.finishReadingBtn}
        onPress={finishBook}
        disabled={finishing}
      >
        {finishing ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          <Feather name="check-circle" size={14} color={colors.teal} />
        )}
        <Text style={styles.finishReadingBtnText}>{t("book.finishReading")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const READING_CARD_GAP = 12;

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const readingCardWidth = windowWidth - 40; // matches scroll's paddingHorizontal 20 each side
  const [activeFilter, setActiveFilter] = useState("all");
  const [spinning, setSpinning] = useState(false);
  const [currentBook, setCurrentBook] = useState<any>(null);
  const [recentBooks, setRecentBooks] = useState<any[]>([]);
  const [toReadBooks, setToReadBooks] = useState<userBooks.UserBook[]>([]);
  const [toReadGenres, setToReadGenres] = useState<string[]>([]);
  const [readingBooks, setReadingBooks] = useState<userBooks.UserBook[]>([]);
  const [activeReadingIndex, setActiveReadingIndex] = useState(0);
  const [error, setError] = useState("");
  const [streakDays, setStreakDays] = useState(0);
  const spinAnim = useRef(new RNAnimated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ y: 0, animated: false }),
      );
      userBooks
        .getMyBooks("to_read")
        .then((res) => {
          setRecentBooks(res.slice(0, 6));
          setToReadBooks(res);
          const genreSet = new Set<string>();
          res.forEach((b: any) =>
            matchKnownGenres(books.normalizeTags(b.genres, 20)).forEach((g) =>
              genreSet.add(g),
            ),
          );
          setToReadGenres([...genreSet].sort((a, b) => a.localeCompare(b)));
        })
        .catch(() => {});
      userBooks
        .getMyBooks("reading")
        .then(setReadingBooks)
        .catch(() => {});
      badges
        .getBadgeStats()
        .then((s) => setStreakDays(s.streak_days))
        .catch(() => {});
    }, []),
  );

  useEffect(
    () =>
      onScrollToTop("index", () =>
        scrollRef.current?.scrollTo({ y: 0, animated: true }),
      ),
    [],
  );

  const updateReadingBook = (updated: any) => {
    setReadingBooks((cur) =>
      cur.map((b) => (b.book_id === updated.book_id ? updated : b)),
    );
  };

  // Marking a book done takes it out of the "en cours" carousel entirely
  // (it's now a "reading" book_id status subquery, done books don't belong
  // in it) rather than just patching its fields in place like updateReadingBook.
  const removeReadingBook = (bookId: string) => {
    setReadingBooks((cur) => cur.filter((b) => b.book_id !== bookId));
  };

  const addToReading = async () => {
    if (!currentBook) return;
    try {
      await userBooks.addBook(currentBook.book_id, "reading");
      setCurrentBook(null);
    } catch (err: any) {
      setError(err.message || t("search.addError"));
    }
  };

  const spin = () => {
    if (spinning) return;
    setSpinning(true);
    setError("");
    setCurrentBook(null);
    RNAnimated.loop(
      RNAnimated.timing(spinAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      { iterations: 5 },
    ).start();
    // Filtered client-side against the same curated whitelist as the pills
    // themselves (see matchKnownGenres) rather than via the randomize_book
    // RPC's exact-string genre match — the raw tags on `books.genres` rarely
    // equal a clean canonical label, so an exact match would silently return
    // nothing.
    const pool = dedupeSeries(
      activeFilter === "all"
        ? toReadBooks
        : toReadBooks.filter((b) =>
            matchKnownGenres(books.normalizeTags(b.genres, 20)).has(
              activeFilter,
            ),
          ),
    );

    setTimeout(() => {
      if (pool.length === 0) {
        setError(t("discover.noBookFound"));
        setSpinning(false);
        spinAnim.setValue(0);
        return;
      }
      const book = pool[Math.floor(Math.random() * pool.length)];
      setCurrentBook(book);
      setSpinning(false);
      spinAnim.setValue(0);
    }, 1500);
  };

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const filters = useMemo(
    () => [
      ALL_FILTER,
      ...KNOWN_GENRES.filter((g) => toReadGenres.includes(g.id)).map((g) => ({
        labelKey: g.labelKey,
        value: g.id,
      })),
    ],
    [toReadGenres],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t(getGreetingKey())},</Text>
          <Text style={styles.logo}>{profile?.username || "Readigma"}</Text>
        </View>
        <NotificationBell />
      </View>

      {streakDays > 0 && (
        <View style={styles.streakBanner}>
          <Feather name="zap" size={13} color={colors.warning} />
          <Text style={styles.streakBannerText}>
            {t("discover.streakDays", { count: streakDays })}
          </Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {readingBooks.length > 0 && (
          <View style={{ marginBottom: 28 }}>
            <View style={styles.readingHeaderRow}>
              <Text style={styles.eyebrow}>
                {t("discover.currentlyReading")}
                {readingBooks.length > 1 ? ` · ${readingBooks.length}` : ""}
              </Text>
            </View>

            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={readingCardWidth + READING_CARD_GAP}
              decelerationRate="fast"
              contentContainerStyle={{ gap: READING_CARD_GAP }}
              scrollEventThrottle={16}
              onScroll={(e) => {
                const index = Math.round(
                  e.nativeEvent.contentOffset.x /
                    (readingCardWidth + READING_CARD_GAP),
                );
                setActiveReadingIndex((cur) =>
                  cur === index
                    ? cur
                    : Math.max(0, Math.min(index, readingBooks.length - 1)),
                );
              }}
            >
              {readingBooks.map((book) => (
                <View key={book.book_id} style={{ width: readingCardWidth }}>
                  <ReadingBookCard
                    book={book}
                    colors={colors}
                    styles={styles}
                    onUpdate={updateReadingBook}
                    onFinish={removeReadingBook}
                  />
                </View>
              ))}
            </ScrollView>

            {readingBooks.length > 1 && (
              <View style={styles.readingDots}>
                {readingBooks.map((_, i) => (
                  <ReadingDot
                    key={i}
                    focused={i === activeReadingIndex}
                    colors={colors}
                    styles={styles}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        <Text style={styles.eyebrow}>{t("discover.sectionTitle")}</Text>
        <Text style={styles.subtitle}>{t("discover.subtitle")}</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={{ gap: 8 }}
        >
          {filters.map((f) => (
            <Pill
              key={f.value}
              label={t(f.labelKey)}
              active={activeFilter === f.value}
              onPress={() => {
                setActiveFilter(f.value);
                setCurrentBook(null);
                setError("");
              }}
            />
          ))}
        </ScrollView>

        <View style={[styles.randCard, currentBook && styles.randCardRevealed]}>
          {!currentBook ? (
            <View style={styles.placeholder}>
              <RNAnimated.View
                style={{
                  transform: [{ rotate: spinInterpolate }],
                  marginBottom: 14,
                }}
              >
                <Feather name="shuffle" size={30} color={colors.purple} />
              </RNAnimated.View>
              <Text style={styles.placeholderText}>
                {spinning
                  ? t("discover.picking")
                  : t("discover.spinPlaceholder")}
              </Text>
            </View>
          ) : (
            <Animated.View
              entering={ZoomIn.duration(320).springify().damping(14)}
              style={{ width: "100%" }}
            >
              <TouchableOpacity
                style={styles.bookResult}
                onPress={() => router.push(`/book/${currentBook.book_id}`)}
                activeOpacity={0.75}
              >
                <View style={styles.bookCoverBig}>
                  {currentBook.cover_url ? (
                    <Image
                      source={{ uri: currentBook.cover_url }}
                      style={styles.bookCoverBigImg}
                    />
                  ) : (
                    <Feather name="book" size={26} color={colors.purple} />
                  )}
                </View>
                <View style={styles.bookDetails}>
                  <Text style={styles.bookTitle} numberOfLines={2}>
                    {currentBook.title}
                  </Text>
                  <Text style={styles.bookAuthor}>{currentBook.author}</Text>
                  {books.normalizeTags(currentBook.genres).length > 0 ? (
                    <Pill
                      label={books.normalizeTags(currentBook.genres)[0]}
                      tone="gilt"
                    />
                  ) : null}
                  <Text style={styles.tapHint}>
                    {t("discover.tapToSeeDetail")}
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        {!currentBook && (
          <Button
            label={spinning ? t("discover.picking") : t("discover.pickForMe")}
            onPress={spin}
            disabled={spinning}
          />
        )}

        {currentBook && (
          <Animated.View
            entering={FadeInDown.duration(280).delay(80)}
            style={styles.actionsRow}
          >
            <Button
              label={t("discover.iReadThis")}
              onPress={addToReading}
              style={{ flex: 1 }}
            />
            <Button
              label={t("discover.anotherBook")}
              onPress={spin}
              variant="ghost"
              style={{ flex: 1 }}
            />
          </Animated.View>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.eyebrow}>{t("discover.myPile")}</Text>
            <Text style={styles.sectionLabel}>{t("discover.recentlyAdded")}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/library")} hitSlop={8}>
            <Text style={styles.seeAll}>{t("discover.seeAll")}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10 }}
        >
          {recentBooks.length === 0 ? (
            <Text style={styles.emptyHint}>{t("discover.addBooksToPile")}</Text>
          ) : (
            recentBooks.map((book, i) => (
              <Animated.View
                key={i}
                entering={FadeInDown.duration(300).delay(i * 50)}
              >
                <TouchableOpacity
                  style={styles.miniCard}
                  onPress={() => router.push(`/book/${book.book_id}`)}
                  activeOpacity={0.75}
                >
                  <View style={styles.miniCover}>
                    {book.cover_url ? (
                      <Image
                        source={{ uri: book.cover_url }}
                        style={styles.miniCoverImg}
                      />
                    ) : (
                      <Feather name="book" size={18} color={colors.purple} />
                    )}
                  </View>
                  <Text style={styles.miniTitle} numberOfLines={2}>
                    {book.title}
                  </Text>
                  <Text style={styles.miniAuthor}>
                    {book.author?.split(" ").slice(-1)[0]}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            ))
          )}
        </ScrollView>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    greeting: { fontSize: 11, color: colors.gray },
    logo: { fontSize: 19, fontFamily: fonts.headingBold, color: colors.purple },
    streakBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      marginHorizontal: 20,
      marginBottom: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.md,
      backgroundColor: colors.card2,
    },
    streakBannerText: { fontSize: 11, fontWeight: "600", color: colors.warning },
    scroll: { flex: 1, paddingHorizontal: 20 },
    eyebrow: {
      fontSize: 10,
      color: colors.teal,
      textTransform: "uppercase",
      letterSpacing: 1,
      fontWeight: "700",
    },
    subtitle: {
      fontSize: 18,
      fontFamily: fonts.heading,
      color: colors.white,
      marginTop: 4,
      marginBottom: 16,
    },
    readingCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    readingCardLink: { position: "absolute", top: 14, right: 14, zIndex: 1 },
    readingHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 14,
    },
    readingDots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
      marginTop: 12,
    },
    readingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.divider,
    },
    readingTop: { flexDirection: "row", gap: 14, paddingRight: 22 },
    readingCover: {
      width: 56,
      height: 80,
      backgroundColor: colors.card2,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    readingCoverImg: { width: 56, height: 80 },
    readingInfo: { flex: 1, justifyContent: "flex-start" },
    readingTitle: {
      fontSize: 15,
      fontFamily: fonts.headingBold,
      color: colors.white,
      marginBottom: 3,
    },
    readingAuthor: { fontSize: 11, color: colors.gray },
    progressText: { fontSize: 10, color: colors.teal, marginTop: 4 },
    readingDivider: {
      height: 1,
      backgroundColor: colors.divider,
      marginVertical: 16,
    },
    readingActions: { gap: 10 },
    readingActionsRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 20,
    },
    pagesRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 0,
    },
    pagesRowIcon: { marginRight: -2 },
    pageInput: {
      width: 40,
      backgroundColor: colors.card2,
      borderRadius: radius.sm,
      paddingVertical: 8,
      paddingHorizontal: 4,
      color: colors.white,
      fontSize: 13,
      textAlign: "center",
    },
    slash: { fontSize: 14, color: colors.gray },
    progressBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.purpleGlow,
      alignItems: "center",
      justifyContent: "center",
    },
    timerBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 9,
      borderRadius: radius.md,
      backgroundColor: colors.purpleGlow,
    },
    timerBtnActive: { backgroundColor: colors.purple },
    timerBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.purple,
      fontVariant: ["tabular-nums"],
    },
    timerBtnTextActive: { color: "white" },
    finishReadingBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginTop: 10,
      paddingVertical: 9,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.teal,
    },
    finishReadingBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.teal,
    },
    filterRow: { marginBottom: 20 },
    randCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.divider,
      padding: 24,
      marginBottom: 16,
      minHeight: 160,
      alignItems: "center",
      justifyContent: "center",
    },
    randCardRevealed: { borderStyle: "solid", borderColor: colors.divider },
    placeholder: { alignItems: "center" },
    placeholderText: {
      fontSize: 14,
      color: colors.gray,
      textAlign: "center",
      lineHeight: 22,
    },
    bookResult: {
      flexDirection: "row",
      gap: 16,
      alignItems: "center",
      width: "100%",
    },
    bookCoverBig: {
      width: 64,
      height: 88,
      backgroundColor: colors.card2,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    bookCoverBigImg: { width: 64, height: 88 },
    bookDetails: { flex: 1, gap: 6 },
    bookTitle: { fontSize: 15, fontWeight: "700", color: colors.white },
    bookAuthor: { fontSize: 12, color: colors.gray },
    actionsRow: { flexDirection: "row", gap: 10, marginTop: 12 },
    errorText: {
      color: colors.error,
      textAlign: "center",
      fontSize: 13,
      marginTop: 8,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 28,
      marginBottom: 14,
    },
    sectionLabel: {
      fontSize: 15,
      fontFamily: fonts.headingBold,
      color: colors.white,
      marginTop: 3,
    },
    seeAll: { fontSize: 11, color: colors.lavender },
    miniCard: { width: 100, alignItems: "center", gap: 8 },
    miniCover: {
      width: 64,
      height: 64,
      backgroundColor: colors.card2,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    miniCoverImg: { width: 64, height: 64 },
    miniTitle: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.white,
      textAlign: "center",
    },
    miniAuthor: { fontSize: 10, color: colors.gray },
    emptyHint: { fontSize: 12, color: colors.gray, paddingVertical: 20 },
    tapHint: { fontSize: 10, color: colors.gray, fontStyle: "italic" },
  });
