import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  useWindowDimensions,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { fonts, shadows, ColorPalette } from "../../theme";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import * as userBooks from "../../lib/userBooks";
import Pill from "../../components/Pill";
import NotificationBell from "../../components/NotificationBell";
import { onScrollToTop } from "../../lib/tabScrollEmitter";

// Spine (standing upright) vs stack (lying flat) dimensions — deliberately
// unequal so mixed rows look like a real shelf instead of a uniform grid.
const SPINE_WIDTH = 42;
const SPINE_HEIGHT = 168;
const STACK_WIDTH = 168;
const STACK_BAR_HEIGHT = 42;
const STACK_SIZE = 4; // books per lying-down pile
const SLOT_GAP = 3;
// A tilted spine's top corner swings sideways as it rotates — packing it
// edge-to-edge with its neighbor like the straight ones would clip into
// them, so tilted spines get a little breathing room the straight ones don't.
const SPINE_TILT_MARGIN = 5;
const SCREEN_PADDING = 40; // 20 on each side

// Grid mode (the previous look): plain covers in even columns, no
// spine/lean/pickup theatrics — some people just want to scan covers fast.
const COVER_WIDTH = 92;
const COVER_HEIGHT = 134;
const GRID_GAP = 18;

const TABS = [
  { label: "À lire", value: "to_read" },
  { label: "En cours", value: "reading" },
  { label: "Lus", value: "done" },
  { label: "DNF", value: "dnf" },
];

const STATUS_OPTIONS = [
  { label: "À lire", icon: "bookmark" as const, value: "to_read" },
  { label: "En cours", icon: "book-open" as const, value: "reading" },
  { label: "Lu", icon: "check" as const, value: "done" },
  { label: "Pas fini (DNF)", icon: "x" as const, value: "dnf" },
];

type Slot = { type: "spine"; book: any } | { type: "stack"; books: any[] };

// Stable per-book pseudo-random number (from the id, not Math.random()) so
// which books end up piled doesn't reshuffle on every re-render/refetch —
// only the actual set of books changes that.
function hashRatio(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((hash >>> 0) % 1000) / 1000;
}

// A row of perfectly upright spines looks stiff — real shelves always have a
// few books leaning slightly. Angle comes from the id (not Math.random()) so
// it doesn't reshuffle on every re-render, only when the book list does.
// Module-level (not just used in render) because buildRows below needs to
// know a spine will tilt — and therefore need extra width — before it packs
// a row, otherwise tilted rows silently overflow past the screen edge.
function spineTilt(id: string): number {
  return hashRatio(`${id}_tilt`) < 0.4 ? (hashRatio(`${id}_dir`) < 0.5 ? -6 : 6) : 0;
}

// Groups books into shelf rows, occasionally piling a few flat on their side
// instead of standing every single one upright — a real shelf never lines
// every book the same way, and always piling every 5th book made the
// pattern look mechanical, so where a pile starts is randomized (seeded by
// book id, see hashRatio) instead of on a fixed rhythm.
function buildRows(books: any[], maxRowWidth: number): Slot[][] {
  const rows: Slot[][] = [];
  let row: Slot[] = [];
  let rowWidth = 0;

  const push = (slot: Slot, width: number) => {
    if (row.length > 0 && rowWidth + SLOT_GAP + width > maxRowWidth) {
      rows.push(row);
      row = [];
      rowWidth = 0;
    }
    row.push(slot);
    rowWidth += (row.length > 1 ? SLOT_GAP : 0) + width;
  };

  let i = 0;
  let sinceStack = 0;
  while (i < books.length) {
    const canStack =
      books.length - i >= 2 &&
      sinceStack >= 3 &&
      hashRatio(books[i].book_id) < 0.3;
    if (canStack) {
      const stackBooks = books.slice(i, i + STACK_SIZE);
      push({ type: "stack", books: stackBooks }, STACK_WIDTH);
      i += stackBooks.length;
      sinceStack = 0;
    } else {
      const tiltWidth = spineTilt(books[i].book_id) !== 0 ? SPINE_WIDTH + SPINE_TILT_MARGIN * 2 : SPINE_WIDTH;
      push({ type: "spine", book: books[i] }, tiltWidth);
      i += 1;
      sinceStack += 1;
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

// Real per-pixel color extraction needs an image-processing lib we don't
// have installed, so this fakes it honestly: crop a sliver off the actual
// cover image (rather than guessing a color from the title) so the spine at
// least carries real colors from the real cover, not an invented palette.
function CoverSliver({
  uri,
  width,
  height,
  horizontal,
}: {
  uri?: string;
  width: number;
  height: number;
  horizontal?: boolean;
}) {
  if (!uri) return null;
  const zoom = 2.6;
  return (
    <Image
      source={{ uri }}
      resizeMode="cover"
      style={
        horizontal
          ? {
              position: "absolute",
              top: 0,
              left: 0,
              width: width * zoom,
              height,
            }
          : {
              position: "absolute",
              top: 0,
              left: 0,
              width,
              height: height * zoom,
            }
      }
    />
  );
}

export default function LibraryScreen() {
  const { colors } = useTheme();
  const { profile, setLibraryViewMode } = useAuth();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState("to_read");
  const [query, setQuery] = useState("");
  const [allBooks, setAllBooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [poppedBook, setPoppedBook] = useState<any>(null);
  // Persisted on the profile row (see AuthContext.setLibraryViewMode) so this
  // doesn't reset to 'shelf' every time the app reopens.
  const viewMode = profile?.library_view_mode ?? "shelf";
  const setViewMode = setLibraryViewMode;
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const listRef = useRef<FlatList>(null);
  const hasLoadedOnce = useRef(false);

  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(() =>
        listRef.current?.scrollToOffset({ offset: 0, animated: false }),
      );
      loadBooks();
    }, []),
  );

  useEffect(
    () =>
      onScrollToTop("library", () =>
        listRef.current?.scrollToOffset({ offset: 0, animated: true }),
      ),
    [],
  );

  // Refetching every time this tab regains focus keeps it in sync after
  // adding/removing books elsewhere — but flipping `loading` back to true
  // (and blanking the whole shelf) on every single visit, with ~300 book
  // covers each replaying their FadeInDown entrance animation, is what made
  // arriving on this tab feel like it "went crazy". Only show the loading
  // state on the true first load; a refocus refresh now swaps data in
  // silently.
  const loadBooks = () => {
    if (!hasLoadedOnce.current) setLoading(true);
    userBooks
      .getMyBooks()
      .then((res) => {
        hasLoadedOnce.current = true;
        setAllBooks(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const q = query.trim().toLowerCase();
  const filteredBooks = allBooks
    .filter((b) => b.status === activeTab)
    .filter(
      (b) =>
        !q ||
        b.title?.toLowerCase().includes(q) ||
        b.author?.toLowerCase().includes(q),
    )
    // getMyBooks() comes back newest-added first; the shelf reads like an
    // actual pile in the order books were added, oldest→newest or reversed
    // depending on sortOrder (toggle in the header).
    .sort((a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === "asc" ? diff : -diff;
    });
  const counts: any = {};
  allBooks.forEach((b) => {
    counts[b.status] = (counts[b.status] || 0) + 1;
  });

  const rows = useMemo(
    () => buildRows(filteredBooks, width - SCREEN_PADDING),
    [filteredBooks, width],
  );
  const gridColumns = Math.max(
    3,
    Math.floor((width - SCREEN_PADDING + GRID_GAP) / (COVER_WIDTH + GRID_GAP)),
  );

  const changeStatus = (status: string) => {
    userBooks.updateBook(selectedBook.book_id, { status }).then(() => {
      setSelectedBook(null);
      loadBooks();
    });
  };

  const removeBook = () => {
    const doRemove = () => {
      userBooks.removeBook(selectedBook.book_id).then(() => {
        setSelectedBook(null);
        loadBooks();
      });
    };
    // RN Web's Alert.alert only ever renders a single-button window.alert —
    // multi-button/destructive-style configs like this one are silently
    // dropped, so the confirm dialog (and thus the remove callback) never
    // appeared on web at all. window.confirm is the web-native equivalent.
    if (Platform.OS === "web") {
      if (window.confirm("Retirer ce livre de ta liste ?")) doRemove();
      return;
    }
    Alert.alert("Retirer", "Retirer ce livre de ta liste ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Retirer", style: "destructive", onPress: doRemove },
    ]);
  };

  // Tapping a spine/stack bar "picks up" that book into a centered card,
  // like lifting it off the shelf to look at it in your hands; tapping the
  // lifted cover itself is what opens the detail page — one tap to pick it
  // up, a second to actually open it.
  const onSlotPress = (book: any) => {
    if (poppedBook?.book_id === book.book_id)
      router.push(`/book/${book.book_id}`);
    else setPoppedBook(book);
  };

  const renderSpine = (book: any) => {
    const tilt = spineTilt(book.book_id);
    return (
      <TouchableOpacity
        key={book.book_id}
        style={[
          styles.spineWrap,
          tilt !== 0 && { marginHorizontal: SPINE_TILT_MARGIN },
          { transform: [{ rotate: `${tilt}deg` }] },
          poppedBook?.book_id === book.book_id && styles.slotLifted,
        ]}
        activeOpacity={0.8}
        onPress={() => onSlotPress(book)}
      >
        <View style={[styles.spine, { backgroundColor: colors.card2 }]}>
          <CoverSliver
            uri={book.cover_url}
            width={SPINE_WIDTH}
            height={SPINE_HEIGHT}
          />
          <View style={styles.spineTextBox}>
            <Text style={styles.spineTitle} numberOfLines={1}>
              {book.title}
            </Text>
            {book.author ? (
              <Text style={styles.spineAuthor} numberOfLines={1}>
                {book.author}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderStack = (books: any[]) => (
    <View key={books.map((b) => b.book_id).join("-")} style={styles.stackWrap}>
      {books.map((book, i) => (
        <TouchableOpacity
          key={book.book_id}
          style={[
            styles.stackBar,
            { backgroundColor: colors.card2, zIndex: books.length - i },
            poppedBook?.book_id === book.book_id && styles.slotLifted,
          ]}
          activeOpacity={0.8}
          onPress={() => onSlotPress(book)}
        >
          <CoverSliver
            uri={book.cover_url}
            width={STACK_WIDTH}
            height={STACK_BAR_HEIGHT}
            horizontal
          />
          <View style={styles.stackTextBox}>
            <Text style={styles.stackTitle} numberOfLines={1}>
              {book.title}
            </Text>
            {book.author ? (
              <Text style={styles.stackAuthor} numberOfLines={1}>
                {book.author}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Ma Bibliothèque</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[
                styles.viewToggleBtn,
                viewMode === "shelf" && styles.viewToggleBtnActive,
              ]}
              onPress={() => {
                setViewMode("shelf");
                setPoppedBook(null);
              }}
              hitSlop={6}
            >
              <Feather
                name="book-open"
                size={14}
                color={viewMode === "shelf" ? colors.purple : colors.gray}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewToggleBtn,
                viewMode === "grid" && styles.viewToggleBtnActive,
              ]}
              onPress={() => {
                setViewMode("grid");
                setPoppedBook(null);
              }}
              hitSlop={6}
            >
              <Feather
                name="grid"
                size={14}
                color={viewMode === "grid" ? colors.purple : colors.gray}
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => setSortOrder((cur) => (cur === "asc" ? "desc" : "asc"))}
            hitSlop={6}
          >
            <Feather
              name={sortOrder === "asc" ? "arrow-up" : "arrow-down"}
              size={17}
              color={colors.gray}
            />
          </TouchableOpacity>
          <NotificationBell />
        </View>
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
          <TouchableOpacity onPress={() => setQuery("")}>
            <Feather name="x" size={16} color={colors.gray} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabs}
        contentContainerStyle={{ gap: 8 }}
      >
        {TABS.map((tab) => (
          <Pill
            key={tab.value}
            active={activeTab === tab.value}
            onPress={() => {
              setActiveTab(tab.value);
              setPoppedBook(null);
            }}
            label={`${tab.label}${counts[tab.value] ? ` · ${counts[tab.value]}` : ""}`}
          />
        ))}
      </ScrollView>

      {loading ? (
        <Text style={styles.emptyText}>Chargement...</Text>
      ) : filteredBooks.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather
            name={q ? "search" : "book-open"}
            size={36}
            color={colors.gray}
          />
          <Text style={styles.emptyText}>
            {q ? `Aucun résultat pour "${query}"` : "Aucun livre ici"}
          </Text>
        </View>
      ) : viewMode === "grid" ? (
        // Plain even-column grid of covers — the previous default look, for
        // anyone who'd rather just scan covers than browse a shelf.
        <FlatList
          key={`grid-${gridColumns}`}
          ref={listRef}
          data={filteredBooks}
          keyExtractor={(book) => book.book_id}
          numColumns={gridColumns}
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 20 }}
          columnWrapperStyle={{ gap: GRID_GAP, marginBottom: 20 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={gridColumns * 4}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== "web"}
          renderItem={({ item: book, index }) => (
            <Animated.View
              entering={FadeInDown.duration(280).delay(
                (index % gridColumns) * 40,
              )}
            >
              <TouchableOpacity
                style={styles.gridSlot}
                activeOpacity={0.8}
                onPress={() => router.push(`/book/${book.book_id}`)}
              >
                <View style={styles.gridCover}>
                  {book.cover_url ? (
                    <Image
                      source={{ uri: book.cover_url }}
                      style={styles.bookCoverImg}
                    />
                  ) : (
                    <View style={styles.bookCoverFallback}>
                      <Feather name="book" size={22} color={colors.purple} />
                      <Text
                        style={styles.bookCoverFallbackTitle}
                        numberOfLines={3}
                      >
                        {book.title}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.gridMoreBtn}
                    hitSlop={8}
                    onPress={(e) => {
                      e.stopPropagation();
                      setSelectedBook(book);
                    }}
                  >
                    <Feather name="more-horizontal" size={13} color="#FFFFFF" />
                  </TouchableOpacity>
                  {book.rating ? (
                    <View style={styles.ratingBadge}>
                      <Text style={styles.ratingBadgeText}>{book.rating}★</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.gridTitle} numberOfLines={1}>
                  {book.title}
                </Text>
                <Text style={styles.gridAuthor} numberOfLines={1}>
                  {book.author}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        />
      ) : (
        // Rows (not individual books) are what's virtualized here — with up
        // to a few hundred books, rendering every shelf at once is what made
        // this screen janky, so a FlatList only mounts rows near the
        // viewport and recycles cells as you scroll.
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(_, i) => String(i)}
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={4}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== "web"}
          renderItem={({ item: row, index }) => (
            <Animated.View
              entering={FadeInDown.duration(280).delay(Math.min(index, 6) * 40)}
              style={[
                styles.shelf,
                { borderBottomColor: colors.teal, shadowColor: colors.teal },
              ]}
            >
              {row.map((slot) =>
                slot.type === "spine"
                  ? renderSpine(slot.book)
                  : renderStack(slot.books),
              )}
            </Animated.View>
          )}
        />
      )}

      {poppedBook && (
        <TouchableOpacity
          style={styles.pickupOverlay}
          onPress={() => setPoppedBook(null)}
          activeOpacity={1}
        >
          <Animated.View
            entering={ZoomIn.duration(220)}
            style={styles.pickupCard}
          >
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push(`/book/${poppedBook.book_id}`)}
            >
              <View style={styles.pickupCover}>
                {poppedBook.cover_url ? (
                  <Image
                    source={{ uri: poppedBook.cover_url }}
                    style={styles.bookCoverImg}
                  />
                ) : (
                  <View style={styles.bookCoverFallback}>
                    <Feather name="book" size={32} color={colors.purple} />
                    <Text
                      style={styles.bookCoverFallbackTitle}
                      numberOfLines={3}
                    >
                      {poppedBook.title}
                    </Text>
                  </View>
                )}
                {poppedBook.rating ? (
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingBadgeText}>
                      {poppedBook.rating}★
                    </Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
            <Text style={styles.pickupTitle} numberOfLines={2}>
              {poppedBook.title}
            </Text>
            {poppedBook.author ? (
              <Text style={styles.pickupAuthor} numberOfLines={1}>
                {poppedBook.author}
              </Text>
            ) : null}
            <Text style={styles.pickupHint}>
              Touche la couverture pour l'ouvrir
            </Text>
            <View style={styles.pickupActions}>
              <TouchableOpacity
                style={styles.pickupActionBtn}
                onPress={() => setSelectedBook(poppedBook)}
              >
                <Feather name="more-horizontal" size={15} color="#FFFFFF" />
                <Text style={styles.pickupActionText}>Options</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pickupActionBtn}
                onPress={() => setPoppedBook(null)}
              >
                <Feather name="corner-down-left" size={15} color="#FFFFFF" />
                <Text style={styles.pickupActionText}>Reposer</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </TouchableOpacity>
      )}

      {selectedBook && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setSelectedBook(null)}
          activeOpacity={1}
        >
          <TouchableOpacity style={styles.bottomSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{selectedBook.title}</Text>
            {STATUS_OPTIONS.map((s, i) => (
              <TouchableOpacity
                key={s.value}
                style={[
                  styles.sheetRow,
                  i < STATUS_OPTIONS.length - 1 && styles.sheetDivider,
                ]}
                onPress={() => changeStatus(s.value)}
              >
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
    title: { fontSize: 19, fontFamily: fonts.headingBold, color: colors.white },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      paddingVertical: 10,
      marginHorizontal: 20,
      marginBottom: 12,
    },
    searchInput: { flex: 1, minWidth: 0, color: colors.white, fontSize: 15 },
    tabs: { flexGrow: 0, paddingHorizontal: 20, marginBottom: 8 },
    viewToggle: {
      flexDirection: "row",
      gap: 4,
      backgroundColor: colors.card2,
      borderRadius: 999,
      padding: 3,
      marginLeft: 4,
    },
    viewToggleBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    viewToggleBtnActive: { backgroundColor: colors.purpleGlow },
    scroll: { flex: 1, paddingHorizontal: 20 },
    emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
    emptyText: {
      color: colors.gray,
      fontSize: 14,
      textAlign: "center",
      paddingTop: 40,
    },

    shelf: {
      flexDirection: "row",
      alignItems: "flex-end",
      flexWrap: "wrap",
      gap: SLOT_GAP,
      paddingBottom: 4,
      marginBottom: 30,
      borderBottomWidth: 5,
      borderRadius: 2,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 4,
    },

    // Standing spine — the book's actual thin edge, most of the shelf.
    spineWrap: { width: SPINE_WIDTH },
    spine: {
      width: SPINE_WIDTH,
      height: SPINE_HEIGHT,
      borderRadius: 3,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(0,0,0,0.15)",
      ...shadows.card,
    },
    spineTextBox: {
      position: "absolute",
      width: SPINE_HEIGHT,
      height: SPINE_WIDTH,
      top: (SPINE_HEIGHT - SPINE_WIDTH) / 2,
      left: (SPINE_WIDTH - SPINE_HEIGHT) / 2,
      transform: [{ rotate: "-90deg" }],
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.32)",
      gap: 2,
    },
    spineTitle: {
      fontSize: 11,
      fontWeight: "700",
      color: "white",
      paddingHorizontal: 6,
    },
    spineAuthor: {
      fontSize: 9,
      color: "rgba(255,255,255,0.75)",
      paddingHorizontal: 6,
    },

    // Lying-flat pile — a few books stacked on their side, seen edge-on.
    stackWrap: { width: STACK_WIDTH },
    stackBar: {
      width: STACK_WIDTH,
      height: STACK_BAR_HEIGHT,
      borderRadius: 4,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(0,0,0,0.15)",
      ...shadows.card,
      flexDirection: "row",
      alignItems: "center",
    },
    stackTextBox: {
      flex: 1,
      height: "100%",
      backgroundColor: "rgba(0,0,0,0.32)",
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingHorizontal: 8,
    },
    stackTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: "white",
      textAlign: "center",
    },
    stackAuthor: {
      fontSize: 10,
      textAlign: "center",
      color: "rgba(255,255,255,0.75)",
    },

    // The slot a lifted book left behind fades out, reinforcing that it's now
    // "in your hands" in the centered card rather than on the shelf.
    slotLifted: { opacity: 0.25 },

    // The picked-up book: a centered, larger card over a dimmed backdrop —
    // like holding the book up to look at it, instead of a small inline peek.
    pickupOverlay: {
      position: "absolute",
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.65)",
      alignItems: "center",
      justifyContent: "center",
      padding: 30,
    },
    pickupCard: { alignItems: "center", maxWidth: 260 },
    pickupCover: {
      width: 168,
      height: 244,
      backgroundColor: colors.card2,
      borderRadius: 8,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 10,
    },
    // Literal white/light grays here, not colors.white/colors.gray — those
    // flip to dark text in the light theme, but pickupOverlay's backdrop is
    // always dark regardless of theme, so themed text was going invisible.
    pickupTitle: {
      fontSize: 16,
      fontFamily: fonts.headingBold,
      color: "#FFFFFF",
      textAlign: "center",
      marginTop: 16,
    },
    pickupAuthor: {
      fontSize: 13,
      color: "rgba(255,255,255,0.7)",
      textAlign: "center",
      marginTop: 3,
    },
    pickupHint: {
      fontSize: 11,
      color: "rgba(255,255,255,0.55)",
      textAlign: "center",
      marginTop: 10,
    },
    pickupActions: { flexDirection: "row", gap: 24, marginTop: 18 },
    pickupActionBtn: { alignItems: "center", gap: 4 },
    pickupActionText: { fontSize: 11, color: "#FFFFFF", fontWeight: "600" },

    bookCoverImg: { width: "100%", height: "100%" },
    bookCoverFallback: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 8,
      gap: 8,
    },
    bookCoverFallbackTitle: {
      fontSize: 10,
      color: colors.gray,
      textAlign: "center",
      lineHeight: 13,
    },
    ratingBadge: {
      position: "absolute",
      left: 6,
      bottom: 6,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 2,
    },
    ratingBadgeText: { fontSize: 10, color: colors.teal, fontWeight: "700" },

    // Grid mode.
    gridSlot: { width: COVER_WIDTH },
    gridCover: {
      width: COVER_WIDTH,
      height: COVER_HEIGHT,
      backgroundColor: colors.card2,
      borderRadius: 5,
      overflow: "hidden",
      ...shadows.card,
    },
    gridMoreBtn: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
    },
    gridTitle: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.white,
      marginTop: 8,
    },
    gridAuthor: { fontSize: 10, color: colors.gray, marginTop: 1 },

    overlay: {
      position: "absolute",
      inset: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    bottomSheet: {
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
    sheetTitle: {
      fontSize: 15,
      fontFamily: fonts.headingBold,
      color: colors.white,
      textAlign: "center",
      marginBottom: 16,
    },
    sheetRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
    },
    sheetDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    sheetBtnText: { color: colors.white, fontSize: 14, fontWeight: "500" },
    sheetBtnDangerText: {
      color: colors.error,
      fontSize: 14,
      fontWeight: "500",
    },
  });
