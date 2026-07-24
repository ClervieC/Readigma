import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Animated, { FadeIn } from "react-native-reanimated";
import { radius, fonts, shadows, ColorPalette } from "../../theme";
import { useTheme } from "../../context/ThemeContext";
import * as userBooks from "../../lib/userBooks";
import * as books from "../../lib/books";
import * as timer from "../../lib/timer";
import { formatDuration } from "../../lib/timer";
import { useTimer } from "../../context/TimerContext";
import { useAuth } from "../../context/AuthContext";
import Button from "../../components/Button";
import Pill from "../../components/Pill";
import ProgressBar from "../../components/ProgressBar";
import StarRating from "../../components/StarRating";

const EMOJIS = [
  "😱",
  "🥰",
  "😭",
  "🤯",
  "😍",
  "🦋",
  "😤",
  "🫶",
  "💀",
  "🔥",
  "😢",
  "🤩",
  "😮",
  "💔",
  "⭐",
];

const STATUS_OPTIONS: {
  labelKey: string;
  icon: keyof typeof Feather.glyphMap;
  value: string;
}[] = [
  { labelKey: "book.statusToRead", icon: "bookmark", value: "to_read" },
  { labelKey: "book.statusReading", icon: "book-open", value: "reading" },
  { labelKey: "book.statusDone", icon: "check-circle", value: "done" },
  { labelKey: "book.statusDnf", icon: "x-circle", value: "dnf" },
];

const TABS = [
  { labelKey: "book.tabOverview", value: "apercu" },
  { labelKey: "book.tabReading", value: "lecture" },
  { labelKey: "book.tabReviews", value: "avis" },
] as const;

function Card({
  title,
  children,
  styles,
}: {
  title: string;
  children: React.ReactNode;
  styles: any;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function BookDetailScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] =
    useState<(typeof TABS)[number]["value"]>("apercu");
  const [currentBook, setCurrentBook] = useState<any>(null);
  const [loadingBook, setLoadingBook] = useState(true);
  const [currentPage, setCurrentPage] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [progressPercent, setProgressPercent] = useState("");
  const [progress, setProgress] = useState(0);
  const [reactions, setReactions] = useState<any[]>([]);
  const [showReactionModal, setShowReactionModal] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>([]);
  const [reactionNote, setReactionNote] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressMode, setProgressMode] = useState<"pages" | "percent">(
    "pages",
  );
  const [totalReadingTime, setTotalReadingTime] = useState(0);
  const [timerLoading, setTimerLoading] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [ratingStats, setRatingStats] = useState<{
    avg_rating: number | null;
    ratings_count: number;
  }>({ avg_rating: null, ratings_count: 0 });
  const [reviews, setReviews] = useState<any[]>([]);
  const [seriesInput, setSeriesInput] = useState("");
  const [seriesIndexInput, setSeriesIndexInput] = useState("");
  const [savingSeries, setSavingSeries] = useState(false);
  const [seriesBooks, setSeriesBooks] = useState<any[]>([]);
  const [loadingSeriesBooks, setLoadingSeriesBooks] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const {
    session: activeSession,
    elapsedSeconds,
    stop: stopGlobalTimer,
    countdown,
    countdownBookId,
    startWithCountdown,
    cancelCountdown,
  } = useTimer();
  const isCountingDown = countdown !== null && countdownBookId === id;

  useEffect(() => {
    if (!id) return;
    userBooks
      .getBookDetail(id)
      .then((book) => {
        setCurrentBook(book);
        setCurrentPage(book.current_page?.toString() || "");
        setTotalPages(book.total_pages?.toString() || "");
        setProgressPercent(book.progress_percent?.toString() || "");
        setProgress(book.progress_percent || 0);
        setProgressMode(book.progress_mode ?? "pages");
        setRating(book.rating ? parseFloat(book.rating) : 0);
        setComment(book.comment || "");
        setSeriesInput(book.series || "");
        setSeriesIndexInput(
          book.series_index != null ? String(book.series_index) : "",
        );
        setLoadingBook(false);
        if (book.status === "reading") setActiveTab("lecture");
        if (book.external_id) {
          books
            .getWorkExtras(book.external_id)
            .then((extras) => {
              setCurrentBook((cur: any) =>
                cur
                  ? {
                      ...cur,
                      description: cur.description || extras.description,
                      firstSentence: extras.firstSentence,
                      subjectPlaces: extras.subjectPlaces,
                      subjectTimes: extras.subjectTimes,
                    }
                  : cur,
              );
            })
            .catch(() => {});
        }
      })
      .catch(() => setLoadingBook(false));
    loadReactions();
    timer
      .getBookReadingTime(id)
      .then(setTotalReadingTime)
      .catch(() => {});
    userBooks
      .getBookRatingStats(id)
      .then(setRatingStats)
      .catch(() => {});
    userBooks
      .getBookReviews(id)
      .then(setReviews)
      .catch(() => {});
  }, [id]);

  const loadReactions = () => {
    userBooks
      .getReactions(id)
      .then(setReactions)
      .catch(() => {});
  };

  // "Other books in this series" is a live search (reusing the same
  // Open Library + BnF merge as the search bar) rather than a query over our
  // own catalog — most series will have only the one volume someone already
  // added, so searching our own `books` table alone would rarely find
  // anything to show.
  useEffect(() => {
    const seriesName = currentBook?.series;
    if (!seriesName) {
      setSeriesBooks([]);
      return;
    }
    setLoadingSeriesBooks(true);
    books
      .search(seriesName)
      .then((results) =>
        setSeriesBooks(
          results
            .filter((b) => b.external_id !== currentBook.external_id)
            .slice(0, 10),
        ),
      )
      .catch(() => setSeriesBooks([]))
      .finally(() => setLoadingSeriesBooks(false));
  }, [currentBook?.series]);

  const saveSeries = () => {
    const series = seriesInput.trim() || null;
    const series_index = seriesIndexInput.trim()
      ? parseFloat(seriesIndexInput)
      : null;
    setSavingSeries(true);
    books
      .updateBookSeries(id, { series, series_index })
      .then(() =>
        setCurrentBook((cur: any) => ({ ...cur, series, series_index })),
      )
      .catch(() => Alert.alert(t("common.error"), t("book.errors.saveSeries")))
      .finally(() => setSavingSeries(false));
  };

  const openSeriesBook = (book: any) => {
    books
      .addBookToDb(book)
      .then((row) => router.push(`/book/${row.id}`))
      .catch(() => Alert.alert(t("common.error"), t("book.errors.openBook")));
  };

  // A book is "being read" the moment you time it, log a page, or react to
  // it — no need to first tap "Commencer à lire" separately. No-ops once
  // already reading/done/dnf.
  const ensureReading = () => {
    if (currentBook.status !== "to_read") return Promise.resolve();
    setCurrentBook((cur: any) => ({ ...cur, status: "reading" }));
    return userBooks.addBook(id, "reading").catch(() => {});
  };

  const startTimer = () => {
    setTimerLoading(true);
    ensureReading()
      .then(() => startWithCountdown(id))
      .catch(() => Alert.alert(t("common.error"), t("book.errors.startTimer")))
      .finally(() => setTimerLoading(false));
  };

  const stopTimer = () => {
    if (isCountingDown) { cancelCountdown(); return; }
    if (!activeSession) return;
    setTimerLoading(true);
    stopGlobalTimer()
      .then(() => timer.getBookReadingTime(id))
      .then(setTotalReadingTime)
      .catch(() => Alert.alert(t("common.error"), t("book.errors.stopTimer")))
      .finally(() => setTimerLoading(false));
  };

  const removeFromLibrary = () => {
    const doRemove = () => {
      userBooks.removeBook(id).then(() => router.back());
    };
    // RN Web's Alert.alert only ever renders a single-button window.alert —
    // multi-button/destructive-style configs like this one are silently
    // dropped, so the confirm dialog (and thus the remove callback) never
    // appeared on web at all. window.confirm is the web-native equivalent —
    // same workaround as app/(tabs)/library.tsx's removeBook.
    if (Platform.OS === "web") {
      if (window.confirm(t("library.confirmRemoveBook"))) doRemove();
      return;
    }
    Alert.alert(t("library.remove"), t("library.confirmRemoveBook"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("library.remove"), style: "destructive", onPress: doRemove },
    ]);
  };

  const setOwned = (owned: boolean) => {
    if (currentBook.owned === owned) return;
    userBooks
      .updateBook(id, { owned })
      .then(() => setCurrentBook((cur: any) => ({ ...cur, owned })))
      .catch(() => Alert.alert(t("common.error"), t("book.errors.updateFailed")));
  };

  const toggleFormat = (format: "physical" | "ereader" | "audiobook") => {
    const current: string[] = currentBook.formats ?? [];
    const formats = current.includes(format)
      ? current.filter((f) => f !== format)
      : [...current, format];
    userBooks
      .updateBook(id, { formats: formats as any })
      .then(() => setCurrentBook((cur: any) => ({ ...cur, formats })))
      .catch(() => Alert.alert(t("common.error"), t("book.errors.updateFormat")));
  };

  const changeProgressMode = (mode: "pages" | "percent") => {
    setProgressMode(mode);
    if (currentBook.progress_mode === mode) return;
    setCurrentBook((cur: any) => ({ ...cur, progress_mode: mode }));
    userBooks.updateBook(id, { progress_mode: mode }).catch(() => {});
  };

  const updateProgress = () => {
    let percent = 0,
      pages = 0;
    const total = parseInt(totalPages) || 0;
    if (progressMode === "pages") {
      pages = parseInt(currentPage) || 0;
      if (total > 0) percent = Math.round((pages / total) * 100 * 100) / 100;
    } else {
      percent = parseFloat(progressPercent) || 0;
      if (percent > 100) {
        Alert.alert(t("common.error"), t("book.errors.percentOver100"));
        return;
      }
    }
    setLoading(true);
    ensureReading()
      .then(() =>
        userBooks.updateProgress(id, {
          current_page: pages || undefined,
          total_pages: total || undefined,
          progress_percent: percent,
        }),
      )
      .then((res: any) => {
        setProgress(res?.progress_percent ?? percent);
        setLoading(false);
        Alert.alert("✅", t("book.errors.progressUpdated"));
      })
      .catch(() => {
        setLoading(false);
        Alert.alert(t("common.error"), t("book.errors.updateFailed"));
      });
  };

  const changeStatus = (status: string) => {
    if (status === "done") {
      setShowFinishModal(true);
      return;
    }
    userBooks
      .addBook(id, status)
      .then(() => setCurrentBook((cur: any) => ({ ...cur, status })))
      .catch(() => Alert.alert(t("common.error"), t("book.errors.updateFailed")));
  };

  const finishBook = () => {
    userBooks
      .addBook(id, "done")
      .then(() =>
        userBooks.updateBook(id, {
          status: "done",
          rating: rating || undefined,
          comment: comment || undefined,
        }),
      )
      .then(() => {
        setShowFinishModal(false);
        setCurrentBook((cur: any) => ({ ...cur, status: "done" }));
        userBooks
          .getBookRatingStats(id)
          .then(setRatingStats)
          .catch(() => {});
        userBooks
          .getBookReviews(id)
          .then(setReviews)
          .catch(() => {});
        Alert.alert("🎉", t("book.errors.finishedCongrats"));
      })
      .catch((err: any) =>
        Alert.alert(t("common.error"), err.message || t("book.errors.saveFailed")),
      );
  };

  const toggleEmoji = (emoji: string) => {
    setSelectedEmojis((prev) =>
      prev.includes(emoji) ? prev.filter((e) => e !== emoji) : [...prev, emoji],
    );
  };

  const addReaction = () => {
    if (selectedEmojis.length === 0) {
      Alert.alert(t("common.error"), t("book.errors.chooseEmoji"));
      return;
    }
    ensureReading()
      .then(() =>
        userBooks.addReaction(id, {
          emoji: selectedEmojis.join(""),
          note: reactionNote || undefined,
          progress_percent: progress,
          page_number: parseInt(currentPage) || undefined,
          is_public: isPublic,
        }),
      )
      .then(() => {
        setShowReactionModal(false);
        setSelectedEmojis([]);
        setReactionNote("");
        loadReactions();
      })
      .catch(() => Alert.alert(t("common.error"), t("book.errors.addFailed")));
  };

  if (loadingBook || !currentBook) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator color={colors.purple} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const trackable =
    currentBook.status === "reading" || currentBook.status === "to_read";
  const contextTags = [
    ...(currentBook.subjectPlaces ?? []),
    ...(currentBook.subjectTimes ?? []),
  ].slice(0, 4);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={20} color={colors.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => setShowMoreMenu(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="more-vertical" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      {showMoreMenu && (
        <Modal
          transparent
          animationType="fade"
          onRequestClose={() => setShowMoreMenu(false)}
        >
          <TouchableOpacity
            style={styles.menuOverlay}
            activeOpacity={1}
            onPress={() => setShowMoreMenu(false)}
          >
            <View style={styles.menuSheet}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setShowMoreMenu(false);
                  router.push({
                    pathname: "/edit-book-suggestion",
                    params: { bookId: id, title: currentBook.title },
                  });
                }}
              >
                <Feather name="edit-3" size={16} color={colors.white} />
                <Text style={styles.menuRowText}>
                  {t("book.editSuggestion")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => {
                  setShowMoreMenu(false);
                  router.push({
                    pathname: "/report",
                    params: {
                      targetType: "book",
                      targetId: id,
                      label: currentBook.title,
                    },
                  });
                }}
              >
                <Feather name="flag" size={16} color={colors.error} />
                <Text style={[styles.menuRowText, { color: colors.error }]}>
                  {t("book.reportBook")}
                </Text>
              </TouchableOpacity>
              {currentBook.status && (
                <TouchableOpacity
                  style={styles.menuRow}
                  onPress={() => {
                    setShowMoreMenu(false);
                    removeFromLibrary();
                  }}
                >
                  <Feather name="trash-2" size={16} color={colors.error} />
                  <Text style={[styles.menuRowText, { color: colors.error }]}>
                    {t("library.remove")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroCover}>
            {currentBook.cover_url ? (
              <Image
                source={{ uri: currentBook.cover_url }}
                style={styles.heroCoverImg}
              />
            ) : (
              <Feather name="book" size={32} color={colors.purple} />
            )}
          </View>
          <Text style={styles.heroTitle}>{currentBook.title}</Text>
          <Text style={styles.heroAuthor}>{currentBook.author}</Text>
          <View style={styles.heroMetaRow}>
            {currentBook.published_year ? (
              <Text style={styles.year}>{currentBook.published_year}</Text>
            ) : null}
            {ratingStats.ratings_count > 0 && (
              <View style={styles.ratingBadgeRow}>
                <Feather name="star" size={11} color={colors.teal} />
                <Text style={styles.ratingBadgeText}>
                  {ratingStats.avg_rating?.toFixed(1)} ·{" "}
                  {ratingStats.ratings_count}
                </Text>
              </View>
            )}
          </View>
          {/* Same normalizeTags source as the search popup's tag row (see
              app/(tabs)/search.tsx) — used to only show the first genre here,
              which was less than what the popup showed for the same book. */}
          {(books.normalizeTags(currentBook.genres, 8).length > 0 ||
            books.normalizeTags(currentBook.tropes, 6).length > 0) && (
            <View style={styles.heroTags}>
              {books.normalizeTags(currentBook.genres, 8).map((g, i) => (
                <Pill key={`g-${i}`} label={g} tone="gilt" />
              ))}
              {books.normalizeTags(currentBook.tropes, 6).map((tr, i) => (
                <Pill key={`tr-${i}`} label={tr} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <Pill
              key={tab.value}
              label={t(tab.labelKey)}
              active={activeTab === tab.value}
              onPress={() => setActiveTab(tab.value)}
            />
          ))}
        </View>

        <Animated.View key={activeTab} entering={FadeIn.duration(180)}>
          {activeTab === "apercu" && (
            <>
              {currentBook.description ? (
                <Card title={t("book.summary")} styles={styles}>
                  {currentBook.firstSentence ? (
                    <Text style={styles.firstSentence}>
                      « {currentBook.firstSentence} »
                    </Text>
                  ) : null}
                  <Text
                    style={styles.description}
                    numberOfLines={showFullDescription ? undefined : 6}
                  >
                    {currentBook.description}
                  </Text>
                  {currentBook.description.length > 280 && (
                    <TouchableOpacity
                      onPress={() => setShowFullDescription((v) => !v)}
                      hitSlop={8}
                    >
                      <Text style={styles.readMore}>
                        {showFullDescription
                          ? t("book.readLess")
                          : t("book.readMore")}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {contextTags.length > 0 && (
                    <View style={styles.contextTags}>
                      {contextTags.map((tag: string, i: number) => (
                        <Pill key={i} label={tag} tone="gilt" />
                      ))}
                    </View>
                  )}
                </Card>
              ) : (
                <Text style={styles.emptyText}>{t("book.noSummary")}</Text>
              )}

              <Card title={t("book.series")} styles={styles}>
                {profile?.role === "admin" ? (
                  <>
                    <View style={styles.seriesRow}>
                      <TextInput
                        style={[
                          styles.input,
                          { flex: 1, minWidth: 0, textAlign: "left" },
                        ]}
                        value={seriesInput}
                        onChangeText={setSeriesInput}
                        placeholder={t("book.seriesNamePlaceholder")}
                        placeholderTextColor={colors.gray}
                      />
                      <TextInput
                        style={[styles.input, styles.seriesIndexInput]}
                        value={seriesIndexInput}
                        onChangeText={setSeriesIndexInput}
                        keyboardType="decimal-pad"
                        placeholder={t("book.seriesTomePlaceholder")}
                        placeholderTextColor={colors.gray}
                      />
                    </View>
                    <Button
                      label={savingSeries ? t("book.saving") : t("book.save")}
                      onPress={saveSeries}
                      disabled={savingSeries}
                      style={{ marginTop: 12 }}
                    />
                  </>
                ) : currentBook.series ? (
                  <Text style={styles.seriesReadOnly}>
                    {currentBook.series}
                    {currentBook.series_index
                      ? t("book.seriesTome", { index: currentBook.series_index })
                      : ""}
                  </Text>
                ) : (
                  <Text style={styles.emptyText}>{t("book.noSeries")}</Text>
                )}

                {currentBook.series ? (
                  loadingSeriesBooks ? (
                    <ActivityIndicator
                      color={colors.purple}
                      style={{ marginTop: 16 }}
                    />
                  ) : seriesBooks.length > 0 ? (
                    <>
                      <Text style={styles.seriesSubheading}>
                        {t("book.otherSeriesBooks")}
                      </Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 12 }}
                      >
                        {seriesBooks.map((b, i) => (
                          <TouchableOpacity
                            key={i}
                            style={styles.seriesBookCard}
                            onPress={() => openSeriesBook(b)}
                            activeOpacity={0.75}
                          >
                            <View style={styles.seriesBookCover}>
                              {b.cover_url ? (
                                <Image
                                  source={{ uri: b.cover_url }}
                                  style={styles.seriesBookCoverImg}
                                />
                              ) : (
                                <Feather
                                  name="book"
                                  size={18}
                                  color={colors.purple}
                                />
                              )}
                            </View>
                            <Text
                              style={styles.seriesBookTitle}
                              numberOfLines={2}
                            >
                              {b.title}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </>
                  ) : (
                    <Text style={styles.emptyText}>
                      {t("book.noOtherSeriesBooks")}
                    </Text>
                  )
                ) : null}
              </Card>
            </>
          )}

          {activeTab === "lecture" && (
            <>
              <Card title={t("book.status")} styles={styles}>
                <View style={styles.statusRow}>
                  {STATUS_OPTIONS.map((s) => {
                    const active = currentBook.status === s.value;
                    return (
                      <TouchableOpacity
                        key={s.value}
                        style={[
                          styles.statusChip,
                          active && styles.statusChipActive,
                        ]}
                        onPress={() => changeStatus(s.value)}
                      >
                        <Feather
                          name={s.icon}
                          size={16}
                          color={active ? "white" : colors.muted}
                        />
                        <Text
                          style={[
                            styles.statusChipText,
                            active && styles.statusChipTextActive,
                          ]}
                        >
                          {t(s.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Card>

              {currentBook.status === "to_read" && (
                <Card title={t("book.ownership")} styles={styles}>
                  <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                    <Pill
                      label={t("book.owned")}
                      active={currentBook.owned}
                      onPress={() => setOwned(true)}
                      tone="gilt"
                    />
                    <Pill
                      label={t("book.wishlist")}
                      active={!currentBook.owned}
                      onPress={() => setOwned(false)}
                      tone="gilt"
                    />
                  </View>
                </Card>
              )}

              <Card title={t("book.format")} styles={styles}>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  <Pill
                    label={t("book.formatPhysical")}
                    active={(currentBook.formats ?? []).includes("physical")}
                    onPress={() => toggleFormat("physical")}
                    tone="gilt"
                  />
                  <Pill
                    label={t("book.formatEreader")}
                    active={(currentBook.formats ?? []).includes("ereader")}
                    onPress={() => toggleFormat("ereader")}
                    tone="gilt"
                  />
                  <Pill
                    label={t("book.formatAudiobook")}
                    active={(currentBook.formats ?? []).includes("audiobook")}
                    onPress={() => toggleFormat("audiobook")}
                    tone="gilt"
                  />
                </View>
              </Card>

              {trackable && (
                <Card title={t("book.readingTimer")} styles={styles}>
                  {activeSession && activeSession.book_id === id ? (
                    <>
                      <Text style={styles.timerFace}>
                        {formatDuration(elapsedSeconds)}
                      </Text>
                      <Button
                        label={
                          timerLoading
                            ? t("book.loadingEllipsis")
                            : t("book.stop")
                        }
                        variant="danger"
                        onPress={stopTimer}
                        disabled={timerLoading}
                      />
                    </>
                  ) : isCountingDown ? (
                    <>
                      <Text style={styles.timerFace}>{countdown}</Text>
                      <Text style={styles.timerCountdownLabel}>
                        {t("book.startingIn")}
                      </Text>
                      <Button
                        label={t("common.cancel")}
                        variant="ghost"
                        onPress={cancelCountdown}
                      />
                    </>
                  ) : (
                    <Button
                      label={
                        timerLoading
                          ? t("book.loadingEllipsis")
                          : t("book.startSession")
                      }
                      onPress={startTimer}
                      disabled={timerLoading}
                    />
                  )}
                  {totalReadingTime > 0 && (
                    <Text style={styles.timerTotal}>
                      {t("book.totalTimeOnBook", {
                        time: formatDuration(totalReadingTime),
                      })}
                    </Text>
                  )}
                </Card>
              )}

              {trackable && (
                <Card title={t("book.myProgress")} styles={styles}>
                  <ProgressBar
                    percent={progress}
                    color={colors.teal}
                    trackColor={colors.card2}
                  />
                  <Text style={styles.progressText}>
                    {t("book.percentRead", { percent: Math.round(progress) })}
                  </Text>
                  <View
                    style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}
                  >
                    <Pill
                      label={t("book.byPages")}
                      active={progressMode === "pages"}
                      onPress={() => changeProgressMode("pages")}
                    />
                    <Pill
                      label={t("book.byPercent")}
                      active={progressMode === "percent"}
                      onPress={() => changeProgressMode("percent")}
                    />
                  </View>
                  {progressMode === "pages" ? (
                    <View style={styles.pagesRow}>
                      <View style={styles.pageInput}>
                        <Text style={styles.inputLabel}>
                          {t("book.currentPage")}
                        </Text>
                        <TextInput
                          style={styles.input}
                          value={currentPage}
                          onChangeText={setCurrentPage}
                          keyboardType="number-pad"
                          placeholder="0"
                          placeholderTextColor={colors.gray}
                          selectTextOnFocus
                        />
                      </View>
                      <Text style={styles.slash}>/</Text>
                      <View style={styles.pageInput}>
                        <Text style={styles.inputLabel}>
                          {t("book.totalPagesLabel")}
                        </Text>
                        <TextInput
                          style={styles.input}
                          value={totalPages}
                          onChangeText={setTotalPages}
                          keyboardType="number-pad"
                          placeholder="0"
                          placeholderTextColor={colors.gray}
                          selectTextOnFocus
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.percentRow}>
                      <Text style={styles.inputLabel}>
                        {t("book.percentReadLabel")}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 4,
                        }}
                      >
                        <TextInput
                          style={[styles.input, { flex: 1, minWidth: 0 }]}
                          value={progressPercent}
                          onChangeText={setProgressPercent}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={colors.gray}
                          selectTextOnFocus
                        />
                        <Text style={styles.percentSign}>%</Text>
                      </View>
                    </View>
                  )}
                  <Button
                    label={loading ? t("book.updating") : t("book.update")}
                    onPress={updateProgress}
                    disabled={loading}
                  />
                  {currentBook.status === "reading" && (
                    <Button
                      label={t("book.finishReading")}
                      variant="ghost"
                      onPress={() => changeStatus("done")}
                      style={{ marginTop: 10 }}
                    />
                  )}
                </Card>
              )}

              {currentBook.status === "done" && (
                <Card title={t("book.myRating")} styles={styles}>
                  <StarRating
                    rating={rating}
                    onChange={setRating}
                    colors={colors}
                  />
                  <TextInput
                    style={[
                      styles.input,
                      { marginTop: 12, textAlign: "left", height: 80 },
                    ]}
                    value={comment}
                    onChangeText={setComment}
                    placeholder={t("book.myReviewPlaceholder")}
                    placeholderTextColor={colors.gray}
                    multiline
                  />
                  <Button
                    label={t("book.save")}
                    onPress={() =>
                      userBooks.updateBook(id, { rating, comment }).then(() => {
                        userBooks
                          .getBookRatingStats(id)
                          .then(setRatingStats)
                          .catch(() => {});
                        userBooks
                          .getBookReviews(id)
                          .then(setReviews)
                          .catch(() => {});
                        Alert.alert("✅", t("book.ratingSaved"));
                      })
                    }
                    style={{ marginTop: 12 }}
                  />
                </Card>
              )}

              <Card title={t("book.myJourney")} styles={styles}>
                <TouchableOpacity
                  style={styles.addReactionBtn}
                  onPress={() => setShowReactionModal(true)}
                >
                  <Feather name="plus" size={14} color={colors.lavender} />
                  <Text style={styles.addReactionText}>
                    {t("book.addReaction")}
                  </Text>
                </TouchableOpacity>
                {reactions.length === 0 ? (
                  <Text style={styles.emptyText}>
                    {t("book.firstReaction")}
                  </Text>
                ) : (
                  <View style={styles.timeline}>
                    {reactions.map((r, i) => (
                      <View key={i} style={styles.timelineItem}>
                        <View style={styles.timelineLine}>
                          <View style={styles.timelineDot} />
                          {i < reactions.length - 1 && (
                            <View style={styles.timelineConnector} />
                          )}
                        </View>
                        <View style={styles.timelineContent}>
                          <View style={styles.timelineHeader}>
                            <Text style={styles.timelineEmoji}>{r.emoji}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.timelinePercent}>
                                {r.progress_percent
                                  ? `${Math.round(r.progress_percent)}%`
                                  : ""}
                                {r.page_number
                                  ? ` · Page ${r.page_number}`
                                  : ""}
                              </Text>
                              <Feather
                                name={r.is_public ? "globe" : "lock"}
                                size={10}
                                color={colors.gray}
                              />
                            </View>
                          </View>
                          {r.note ? (
                            <Text style={styles.timelineNote}>{r.note}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </>
          )}

          {activeTab === "avis" && (
            <>
              <Card title={t("book.communityReviews")} styles={styles}>
                {ratingStats.ratings_count > 0 && (
                  <View style={styles.communityHeader}>
                    <Text style={styles.communityAvg}>
                      {ratingStats.avg_rating?.toFixed(1)}
                    </Text>
                    <Feather name="star" size={20} color={colors.teal} />
                    <Text style={styles.communityCount}>
                      {t("book.reviewsCount", { count: ratingStats.ratings_count })}
                    </Text>
                  </View>
                )}
                {reviews.length === 0 ? (
                  <Text style={styles.emptyText}>{t("book.noReviews")}</Text>
                ) : (
                  reviews.map((r, i) => (
                    <View
                      key={i}
                      style={[
                        styles.reviewItem,
                        i < reviews.length - 1 && styles.reviewDivider,
                      ]}
                    >
                      <View style={styles.reviewAvatar}>
                        {r.avatar_url ? (
                          <Image
                            source={{ uri: r.avatar_url }}
                            style={styles.reviewAvatarImg}
                          />
                        ) : (
                          <Text style={styles.reviewAvatarText}>
                            {r.username?.slice(0, 2).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.reviewHeaderRow}>
                          <Text style={styles.reviewUsername}>
                            @{r.username}
                          </Text>
                          {r.rating ? (
                            <Text style={styles.reviewRating}>
                              {Number(r.rating).toFixed(2)} ★
                            </Text>
                          ) : null}
                        </View>
                        {r.comment ? (
                          <Text style={styles.reviewComment}>{r.comment}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </>
          )}
        </Animated.View>

        <View style={{ height: 30 }} />
      </ScrollView>

      <Modal visible={showReactionModal} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowReactionModal(false)}
        >
          <TouchableOpacity style={styles.modalSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{t("book.howDoYouFeel")}</Text>
            <Text style={styles.modalSubtitle}>
              {t("feed.percentOfBook", { percent: Math.round(progress) })}
            </Text>
            {selectedEmojis.length > 0 && (
              <TouchableOpacity
                style={styles.clearEmojisBtn}
                onPress={() => setSelectedEmojis([])}
              >
                <Feather name="x-circle" size={13} color={colors.muted} />
                <Text style={styles.clearEmojisText}>{t("book.clearAll")}</Text>
              </TouchableOpacity>
            )}
            <View style={styles.emojiGrid}>
              {EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.emojiBtn,
                    selectedEmojis.includes(emoji) && styles.emojiBtnSelected,
                  ]}
                  onPress={() => toggleEmoji(emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.noteInput}
              value={reactionNote}
              onChangeText={setReactionNote}
              placeholder={t("book.addNotePlaceholder")}
              placeholderTextColor={colors.gray}
              multiline
              maxLength={200}
            />
            <TouchableOpacity
              style={styles.publicToggle}
              onPress={() => setIsPublic(!isPublic)}
            >
              <Feather
                name={isPublic ? "globe" : "lock"}
                size={14}
                color={colors.lavender}
              />
              <Text style={styles.publicToggleText}>
                {isPublic
                  ? t("book.shareWithFollowers")
                  : t("book.keepPrivate")}
              </Text>
            </TouchableOpacity>
            <Button label={t("book.add")} onPress={addReaction} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showFinishModal} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowFinishModal(false)}
        >
          <TouchableOpacity style={styles.modalSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{t("book.youFinished")}</Text>
            <Text style={styles.modalSubtitle}>{currentBook.title}</Text>
            <Text style={styles.ratingLabel}>{t("book.ratingOptional")}</Text>
            <StarRating rating={rating} onChange={setRating} colors={colors} />
            <TextInput
              style={[styles.noteInput, { marginTop: 16 }]}
              value={comment}
              onChangeText={setComment}
              placeholder={t("book.reviewOptionalPlaceholder")}
              placeholderTextColor={colors.gray}
              multiline
              maxLength={500}
            />
            <Button label={t("book.finishReadingBtn")} onPress={finishBook} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 14,
    },
    menuOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    menuSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 10,
      paddingBottom: 30,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 22,
      paddingVertical: 16,
    },
    menuRowText: { fontSize: 14, fontWeight: "600", color: colors.white },
    scroll: { flex: 1, paddingHorizontal: 20 },
    hero: { alignItems: "center", paddingBottom: 20 },
    heroCover: {
      width: 128,
      height: 184,
      backgroundColor: colors.card2,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginBottom: 16,
      ...shadows.card,
    },
    heroCoverImg: { width: "100%", height: "100%" },
    heroTitle: {
      fontSize: 19,
      fontFamily: fonts.headingBold,
      color: colors.white,
      textAlign: "center",
      paddingHorizontal: 20,
    },
    heroAuthor: { fontSize: 13, color: colors.muted, marginTop: 4 },
    heroMetaRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
      flexWrap: "wrap",
      justifyContent: "center",
      marginTop: 12,
    },
    heroTags: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
      justifyContent: "center",
      marginTop: 12,
      paddingHorizontal: 20,
    },
    year: { fontSize: 11, color: colors.muted },
    ratingBadgeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    ratingBadgeText: { fontSize: 11, color: colors.muted, fontWeight: "600" },
    tabRow: {
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      marginBottom: 20,
    },
    card: { marginBottom: 24 },
    cardTitle: {
      fontSize: 12,
      fontFamily: fonts.headingBold,
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 14,
    },
    firstSentence: {
      fontSize: 13,
      color: colors.lavender,
      fontStyle: "italic",
      lineHeight: 19,
      marginBottom: 10,
    },
    description: { fontSize: 13, color: colors.muted, lineHeight: 20 },
    readMore: {
      fontSize: 12,
      color: colors.lavender,
      fontWeight: "600",
      marginTop: 8,
    },
    contextTags: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
      marginTop: 14,
    },
    seriesRow: { flexDirection: "row", gap: 8 },
    seriesIndexInput: { width: 70 },
    seriesReadOnly: { fontSize: 14, color: colors.white, fontWeight: "600" },
    seriesSubheading: {
      fontSize: 11,
      fontFamily: fonts.headingBold,
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginTop: 20,
      marginBottom: 12,
    },
    seriesBookCard: { width: 84, alignItems: "center", gap: 6 },
    seriesBookCover: {
      width: 64,
      height: 92,
      backgroundColor: colors.card2,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    seriesBookCoverImg: { width: 64, height: 92 },
    seriesBookTitle: { fontSize: 10, color: colors.white, textAlign: "center" },
    statusRow: { flexDirection: "row", gap: 8 },
    statusChip: {
      flex: 1,
      alignItems: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    statusChipActive: {
      backgroundColor: colors.purple,
      borderColor: colors.purple,
    },
    statusChipText: { fontSize: 11, color: colors.muted, fontWeight: "600" },
    statusChipTextActive: { color: "white" },
    timerFace: {
      fontSize: 36,
      fontFamily: fonts.headingBold,
      color: colors.white,
      textAlign: "center",
      marginBottom: 14,
      fontVariant: ["tabular-nums"],
    },
    timerCountdownLabel: {
      fontSize: 12,
      color: colors.muted,
      textAlign: "center",
      marginTop: -8,
      marginBottom: 14,
    },
    timerTotal: {
      fontSize: 12,
      color: colors.muted,
      textAlign: "center",
      marginTop: 12,
    },
    progressText: {
      fontSize: 12,
      color: colors.teal,
      marginTop: 6,
      marginBottom: 16,
      textAlign: "right",
    },
    pagesRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 14,
    },
    pageInput: { flex: 1 },
    inputLabel: { fontSize: 11, color: colors.muted, marginBottom: 4 },
    input: {
      backgroundColor: colors.card2,
      borderRadius: radius.sm,
      padding: 12,
      color: colors.white,
      fontSize: 16,
      textAlign: "center",
    },
    slash: { fontSize: 20, color: colors.muted, marginTop: 16 },
    percentRow: { marginBottom: 14 },
    percentSign: { fontSize: 20, color: colors.muted },
    addReactionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 14,
    },
    addReactionText: {
      color: colors.lavender,
      fontSize: 13,
      fontWeight: "600",
    },
    emptyText: { color: colors.muted, fontSize: 13 },
    timeline: { paddingLeft: 4 },
    timelineItem: { flexDirection: "row", gap: 12, marginBottom: 16 },
    timelineLine: { alignItems: "center", width: 20 },
    timelineDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.purple,
    },
    timelineConnector: {
      flex: 1,
      width: 1,
      backgroundColor: colors.divider,
      marginTop: 4,
    },
    timelineContent: { flex: 1, paddingBottom: 8 },
    timelineHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
    },
    timelineEmoji: { fontSize: 22 },
    timelinePercent: { fontSize: 12, color: colors.teal, fontWeight: "600" },
    timelineNote: { fontSize: 13, color: colors.white, lineHeight: 18 },
    communityHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 18,
    },
    communityAvg: {
      fontSize: 30,
      fontFamily: fonts.headingBold,
      color: colors.white,
    },
    communityCount: { fontSize: 12, color: colors.muted },
    reviewItem: {
      flexDirection: "row",
      gap: 12,
      paddingBottom: 14,
      marginBottom: 14,
    },
    reviewDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    reviewAvatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.purpleGlow,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      flexShrink: 0,
    },
    reviewAvatarImg: { width: 34, height: 34 },
    reviewAvatarText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.lavender,
    },
    reviewHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    reviewUsername: { fontSize: 13, fontWeight: "700", color: colors.white },
    reviewRating: { fontSize: 12, color: colors.teal, fontWeight: "600" },
    reviewComment: { fontSize: 13, color: colors.muted, lineHeight: 19 },
    ratingLabel: { fontSize: 13, color: colors.muted, marginBottom: 8 },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 40,
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: colors.divider,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 17,
      fontFamily: fonts.headingBold,
      color: colors.white,
      textAlign: "center",
    },
    modalSubtitle: {
      fontSize: 12,
      color: colors.muted,
      textAlign: "center",
      marginBottom: 20,
    },
    clearEmojisBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      alignSelf: "center",
      marginTop: -12,
      marginBottom: 12,
    },
    clearEmojisText: { fontSize: 12, color: colors.muted, fontWeight: "600" },
    emojiGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "center",
      marginBottom: 16,
    },
    emojiBtn: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: colors.card2,
      alignItems: "center",
      justifyContent: "center",
    },
    emojiBtnSelected: { borderWidth: 1, borderColor: colors.purple },
    emojiText: { fontSize: 22 },
    noteInput: {
      backgroundColor: colors.card2,
      borderRadius: radius.sm,
      padding: 12,
      color: colors.white,
      fontSize: 14,
      minHeight: 80,
      marginBottom: 12,
    },
    publicToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 12,
      marginBottom: 12,
    },
    publicToggleText: { color: colors.lavender, fontSize: 14 },
  });
