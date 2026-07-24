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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Animated, {
  FadeInDown,
  FadeOutUp,
  ZoomIn,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { fonts, shadows, ColorPalette } from "../../theme";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import * as userBooks from "../../lib/userBooks";
import * as shelfFrames from "../../lib/shelfFrames";
import * as badges from "../../lib/badges";
import Pill from "../../components/Pill";
import NotificationBell from "../../components/NotificationBell";
import { onScrollToTop } from "../../lib/tabScrollEmitter";
import * as ImagePicker from "expo-image-picker";

// Spine (standing upright) vs stack (lying flat) dimensions — deliberately
// unequal so mixed rows look like a real shelf instead of a uniform grid.
const SPINE_WIDTH = 42;
const SPINE_HEIGHT = 168;
const STACK_WIDTH = 168;
const STACK_BAR_HEIGHT = 42;
const STACK_SIZE = 4; // books per lying-down pile
const SLOT_GAP = 3;
const SHELF_GAP_SIZE = 36;
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
// Cover + title + author + the gridSlot's own bottom margin — the vertical
// footprint a drag needs to convert finger movement into "how many rows".
const GRID_CELL_HEIGHT = COVER_HEIGHT + 34;

const TABS = [
  { labelKey: "library.tabs.toRead", value: "to_read" },
  { labelKey: "library.tabs.reading", value: "reading" },
  { labelKey: "library.tabs.read", value: "done" },
  { labelKey: "library.tabs.dnf", value: "dnf" },
];

const STATUS_OPTIONS = [
  { labelKey: "library.status.toRead", icon: "bookmark" as const, value: "to_read" },
  { labelKey: "library.status.reading", icon: "book-open" as const, value: "reading" },
  { labelKey: "library.status.read", icon: "check" as const, value: "done" },
  { labelKey: "library.status.dnf", icon: "x" as const, value: "dnf" },
];

// Shown once, automatically, the first time edit mode is entered — see
// EDIT_TUTORIAL_STEPS/showEditTutorial below.
const EDIT_TUTORIAL_SEEN_KEY = "readigma_edit_tutorial_seen";

type Slot =
  | { type: "spine"; book: any; gapBefore: boolean; gapAfter: boolean }
  | { type: "stack"; books: any[]; gapBefore: boolean; gapAfter: boolean }
  | { type: "frame"; frame: any };
// A frame takes the same shelf width as 3 standing spines (plus the gaps
// between them), so it reads as "one furniture piece the size of 3 books"
// rather than an arbitrary fixed size. A plant (and a candle, sized the
// same way) takes the same as 2, a clock (small, round) takes barely more
// than a single book.
const FRAME_WIDTH = SPINE_WIDTH * 3 + SLOT_GAP * 2;
const PLANT_WIDTH = SPINE_WIDTH * 2 + SLOT_GAP;
const CLOCK_WIDTH = SPINE_WIDTH + 20;
const CANDLE_WIDTH = PLANT_WIDTH;
const decorWidth = (kind: string) =>
  kind === "plant"
    ? PLANT_WIDTH
    : kind === "clock"
      ? CLOCK_WIDTH
      : kind === "candle"
        ? CANDLE_WIDTH
        : FRAME_WIDTH;

// User-supplied plant art (see assets/plants) — a stable hash-picked one per
// frame id, same reasoning as spineTilt, so a given plant doesn't change
// which image it shows on every re-render.
const PLANT_IMAGES = [
  require("../../assets/plants/plante1.png"),
  require("../../assets/plants/plante2.png"),
  require("../../assets/plants/plante3.png"),
  require("../../assets/plants/plante4.png"),
];
function plantImageFor(frameId: string) {
  const index = Math.floor(
    hashRatio(`${frameId}_plant_art`) * PLANT_IMAGES.length,
  );
  return PLANT_IMAGES[Math.min(index, PLANT_IMAGES.length - 1)];
}

// Same idea as PLANT_IMAGES/plantImageFor, just for the candle art (see
// assets/bougie) — a stable hash-picked candle per frame id.
const CANDLE_IMAGES = [
  require("../../assets/bougie/bougie1.png"),
  require("../../assets/bougie/bougie2.png"),
  require("../../assets/bougie/bougie3.png"),
  require("../../assets/bougie/bougie4.png"),
];
function candleImageFor(frameId: string) {
  const index = Math.floor(
    hashRatio(`${frameId}_candle_art`) * CANDLE_IMAGES.length,
  );
  return CANDLE_IMAGES[Math.min(index, CANDLE_IMAGES.length - 1)];
}

// A real, ticking clock (not a static graphic) — its own tiny component,
// not state hoisted onto LibraryScreen, so its interval only re-renders
// this clock face rather than the entire shelf on every tick.
function LiveClockFace({
  colors,
  styles,
}: {
  colors: ColorPalette;
  styles: any;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return (
    <View style={styles.clockRing}>
      <Text style={styles.clockDigits}>
        {hh}:{mm}
      </Text>
    </View>
  );
}
type Row =
  | { type: "books"; slots: Slot[] }
  | { type: "empty"; anchorId: string };

// Stable per-book pseudo-random number (from the id, not Math.random()) so
// which books end up piled doesn't reshuffle on every re-render/refetch —
// only the actual set of books changes that.
function hashRatio(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((hash >>> 0) % 1000) / 1000;
}

// A row of perfectly upright spines looks stiff — real shelves always have a
// few books leaning slightly. A user's manual_tilt choice (see the tilt
// button in reorder mode) always wins; otherwise the angle comes from the
// id (not Math.random()) so it doesn't reshuffle on every re-render, only
// when the book list does. Module-level (not just used in render) because
// buildRows below needs to know a spine will tilt — and therefore need
// extra width — before it packs a row, otherwise tilted rows silently
// overflow past the screen edge.
function spineTilt(book: any): number {
  if (book.manual_tilt === -1) return -6;
  if (book.manual_tilt === 1) return 6;
  if (book.manual_tilt === 0) return 0;
  return hashRatio(`${book.book_id}_tilt`) < 0.4
    ? hashRatio(`${book.book_id}_dir`) < 0.5
      ? -6
      : 6
    : 0;
}

// A hung picture is never perfectly level — a small stable tilt (seeded by
// id, same reasoning as spineTilt) sells the "leaning on the shelf" look,
// unless the user picked one explicitly (see the tilt button in reorder
// mode / cycleFrameTilt), which always wins.
function frameTilt(frame: { id: string; manual_tilt?: number | null }): number {
  if (frame.manual_tilt === -1) return -4;
  if (frame.manual_tilt === 1) return 4;
  if (frame.manual_tilt === 0) return 0;
  return hashRatio(`${frame.id}_frame_tilt`) < 0.5 ? -3 : 3;
}

// Groups books into shelf rows, occasionally piling a few flat on their side
// instead of standing every single one upright — a real shelf never lines
// every book the same way. Once a user manually piles anything in a status
// (see stackBooks/unstackBook), those explicit pile_id groupings are used
// exclusively — books with no pile_id in that case just stand as spines, no
// auto-piling mixed in, so the shelf matches what was actually arranged.
// Until then, piling is automatic and randomized (seeded by book id, see
// hashRatio) instead of on a fixed rhythm, purely for visual variety.
function buildRows(
  books: any[],
  maxRowWidth: number,
  frames: any[] = [],
): Row[] {
  const rows: Row[] = [];
  let row: Slot[] = [];
  let rowWidth = 0;

  const flushRow = () => {
    if (row.length > 0) rows.push({ type: "books", slots: row });
    row = [];
    rowWidth = 0;
  };

  // A frame's `position` is a raw book count — "this many books come before
  // it". Interleaved in as the main loop below processes books/piles, not
  // appended after, so it can land between two books rather than always at
  // the very end.
  const sortedFrames = [...frames].sort((a, b) => a.position - b.position);
  let frameIndex = 0;
  let booksSoFar = 0;
  const pushFramesUpTo = (bookCount: number) => {
    while (
      frameIndex < sortedFrames.length &&
      sortedFrames[frameIndex].position <= bookCount
    ) {
      push(
        { type: "frame", frame: sortedFrames[frameIndex] },
        decorWidth(sortedFrames[frameIndex].kind),
        null,
      );
      frameIndex++;
    }
  };

  const push = (slot: Slot, width: number, anchorBook: any) => {
    // shelf_break_before forces this book onto its own fresh row — the only
    // way to get a single book standing alone on a shelf — regardless of
    // whether the current row still has room left.
    if (
      row.length > 0 &&
      (anchorBook?.shelf_break_before ||
        rowWidth + SLOT_GAP + width > maxRowWidth)
    ) {
      flushRow();
    }
    row.push(slot);
    rowWidth += (row.length > 1 ? SLOT_GAP : 0) + width;
  };

  const pushSpine = (book: any) => {
    const tiltWidth =
      spineTilt(book) !== 0 ? SPINE_WIDTH + SPINE_TILT_MARGIN * 2 : SPINE_WIDTH;
    const gapWidth =
      (book.shelf_gap_before ? SHELF_GAP_SIZE : 0) +
      (book.shelf_gap_after ? SHELF_GAP_SIZE : 0);
    push(
      {
        type: "spine",
        book,
        gapBefore: !!book.shelf_gap_before,
        gapAfter: !!book.shelf_gap_after,
      },
      tiltWidth + gapWidth,
      book,
    );
  };

  const hasManualPiles = books.some((b) => b.pile_id);

  if (hasManualPiles) {
    const used = new Set<string>();
    for (const book of books) {
      if (used.has(book.book_id)) continue;
      if (book.pile_id) {
        const group = books.filter(
          (b) => !used.has(b.book_id) && b.pile_id === book.pile_id,
        );
        group.forEach((b) => used.add(b.book_id));
        const anchor = group[0];
        const gapWidth =
          (anchor.shelf_gap_before ? SHELF_GAP_SIZE : 0) +
          (anchor.shelf_gap_after ? SHELF_GAP_SIZE : 0);
        pushFramesUpTo(booksSoFar);
        push(
          {
            type: "stack",
            books: group,
            gapBefore: !!anchor.shelf_gap_before,
            gapAfter: !!anchor.shelf_gap_after,
          },
          STACK_WIDTH + gapWidth,
          anchor,
        );
        booksSoFar += group.length;
      } else {
        used.add(book.book_id);
        pushFramesUpTo(booksSoFar);
        pushSpine(book);
        booksSoFar += 1;
      }
    }
  } else {
    let i = 0;
    let sinceStack = 0;
    while (i < books.length) {
      const canStack =
        books.length - i >= 2 &&
        sinceStack >= 3 &&
        hashRatio(books[i].book_id) < 0.3;
      pushFramesUpTo(i);
      if (canStack) {
        const stackBooks = books.slice(i, i + STACK_SIZE);
        const anchor = stackBooks[0];
        const gapWidth =
          (anchor.shelf_gap_before ? SHELF_GAP_SIZE : 0) +
          (anchor.shelf_gap_after ? SHELF_GAP_SIZE : 0);
        push(
          {
            type: "stack",
            books: stackBooks,
            gapBefore: !!anchor.shelf_gap_before,
            gapAfter: !!anchor.shelf_gap_after,
          },
          STACK_WIDTH + gapWidth,
          anchor,
        );
        i += stackBooks.length;
        sinceStack = 0;
      } else {
        pushSpine(books[i]);
        i += 1;
        sinceStack += 1;
      }
    }
    booksSoFar = books.length;
  }
  // Any frame positioned at/after the last book still needs pushing.
  pushFramesUpTo(booksSoFar);
  flushRow();
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

// Real drag-and-drop for reorder mode's grid view: the book follows your
// finger freely (no live reflow while dragging — much simpler and still
// reads fine), and on release, its drop position is converted back to a
// grid index and spliced into the list. Every other tile then animates to
// its new slot via `layout` (LinearTransition) on the parent — including
// sliding into any gap left behind, so there's no such thing as an
// unreachable "empty spot": every index in the list is a valid drop target.
// Shelf view (spines/stacks) keeps the simpler tap-to-swap from before —
// its tiles aren't uniform-sized, so there's no clean way to turn a drop
// point into "which slot is this nearest to".
function DraggableGridBook({
  index,
  columns,
  cellWidth,
  cellHeight,
  disabled,
  onDragMove,
  onDragUpdateY,
  onDrop,
  onDragEnd,
  onTap,
  edgeZoneTop,
  edgeZoneBottom,
  children,
}: {
  index: number;
  columns: number;
  cellWidth: number;
  cellHeight: number;
  disabled: boolean;
  onDragMove: (fromIndex: number, deltaCols: number, deltaRows: number) => void;
  onDragUpdateY: (absoluteY: number) => void;
  onDrop: () => void;
  // Same reasoning as DraggableShelfBook's onDragEnd (see its own doc
  // comment) — always runs, even on a cancelled/interrupted gesture where
  // onEnd is skipped, so auto-scroll can never get stuck running forever.
  onDragEnd?: () => void;
  onTap: () => void;
  // Absolute-Y thresholds for the auto-scroll edge zones (top/bottom), so
  // onDragUpdateY only crosses the JS bridge when the finger actually
  // transitions between zones rather than on every single move frame.
  edgeZoneTop: number;
  edgeZoneBottom: number;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const scale = useSharedValue(1);
  const lastZone = useSharedValue<0 | 1 | -1>(0);
  // The book's own live index, and the delta already reported for the
  // current drag — both as shared values (not plain closures) because this
  // component doesn't unmount/remount as the list reorders around it (same
  // key), so the *same* gesture instance keeps running throughout a drag
  // while `index` keeps changing under it.
  const indexSV = useSharedValue(index);
  const startIndexSV = useSharedValue(index);
  const lastDeltaCols = useSharedValue(0);
  const lastDeltaRows = useSharedValue(0);
  // Compensates for the tile's own base position jumping when the list
  // reorders mid-drag (see the index effect below) — without this, the tile
  // would visually snap away from the finger every time it crosses into a
  // new cell, instead of continuing to follow it smoothly.
  const compensateX = useSharedValue(0);
  const compensateY = useSharedValue(0);

  useEffect(() => {
    if (dragging.value && index !== indexSV.value) {
      const prevCol = indexSV.value % columns;
      const prevRow = Math.floor(indexSV.value / columns);
      const col = index % columns;
      const row = Math.floor(index / columns);
      compensateX.value -= (col - prevCol) * cellWidth;
      compensateY.value -= (row - prevRow) * cellHeight;
    }
    indexSV.value = index;
  }, [index]);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    // Keep ordinary taps available for selecting a book. The drag starts only
    // after a deliberate movement, rather than claiming every touch instantly.
    .minDistance(8)
    .onStart(() => {
      dragging.value = true;
      scale.value = withSpring(1.04, { damping: 18 });
      startIndexSV.value = indexSV.value;
      lastDeltaCols.value = 0;
      lastDeltaRows.value = 0;
      compensateX.value = 0;
      compensateY.value = 0;
      lastZone.value = 0;
    })
    .onUpdate((e) => {
      translateX.value = e.translationX + compensateX.value;
      translateY.value = e.translationY + compensateY.value;
      const deltaCols = Math.round(
        (e.translationX + compensateX.value) / cellWidth,
      );
      const deltaRows = Math.round(
        (e.translationY + compensateY.value) / cellHeight,
      );
      if (
        deltaCols !== lastDeltaCols.value ||
        deltaRows !== lastDeltaRows.value
      ) {
        lastDeltaCols.value = deltaCols;
        lastDeltaRows.value = deltaRows;
        runOnJS(onDragMove)(startIndexSV.value, deltaCols, deltaRows);
      }
      const zone =
        e.absoluteY < edgeZoneTop ? -1 : e.absoluteY > edgeZoneBottom ? 1 : 0;
      if (zone !== lastZone.value) {
        lastZone.value = zone;
        runOnJS(onDragUpdateY)(e.absoluteY);
      }
    })
    .onEnd(() => {
      runOnJS(onDrop)();
      translateX.value = withSpring(0, { damping: 18 });
      translateY.value = withSpring(0, { damping: 18 });
      scale.value = withSpring(1, { damping: 18 });
      dragging.value = false;
    })
    // Same reasoning as DraggableShelfBook's onFinalize — always runs, even
    // when onEnd is skipped by a cancelled/interrupted gesture, so
    // auto-scroll can never get stuck running forever.
    .onFinalize(() => {
      if (onDragEnd) runOnJS(onDragEnd)();
    });

  const tap = Gesture.Tap().onEnd(() => runOnJS(onTap)());
  const gesture = disabled ? tap : Gesture.Exclusive(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: dragging.value ? 10 : 0,
    opacity: dragging.value ? 0.85 : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        layout={LinearTransition.springify().damping(18)}
        style={animatedStyle}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

// Real drag-and-drop for shelf reorder mode: unlike the grid (uniform cells,
// so a drop point converts cleanly to "which index"), spines/stacks/tilts
// have no uniform size — so instead of cell math, every tile reports its own
// on-screen frame (via onLayout + measure) into a shared ref, and a drop is
// resolved by literally checking which other tile's frame the finger ended
// up over. Land on another book → the two pile together. Land elsewhere →
// it reorders to that spot instead. One gesture, no menu.
//
// Frames are measured fresh at the *start* of every drag (onDragStart, up
// in LibraryScreen, remeasures every mounted tile) rather than trusted from
// mount time — this list lives in a ScrollView, and a frame measured once on
// layout goes stale the moment the user scrolls, silently breaking every
// drop (they'd land nowhere near where they were actually dropped, which
// read as "stacking stopped working").
// Below this much total finger movement, onEnd still fires (the pan did
// cross the activation offset) but it's almost certainly a tap that jittered
// slightly rather than an intentional drag — natural touch noise on release
// is often a few pixels past the 10px activation threshold. Without this
// guard, an ordinary tap could occasionally resolve to a *different* nearest
// neighbor than the book's own original spot and silently reorder it, which
// read as "the book disappears and reappears somewhere else" for a tap that
// never meant to move anything.
const MIN_DRAG_DISTANCE = 12;

function DraggableShelfBook({
  bookId,
  disabled,
  registerRef,
  onDragStart,
  onDragUpdateY,
  onDragUpdate,
  onDrop,
  onDragEnd,
  onTap,
  style,
  edgeZoneTop,
  edgeZoneBottom,
  children,
}: {
  bookId: string;
  disabled: boolean;
  registerRef: (id: string, ref: View | null) => void;
  onDragStart: () => void;
  onDragUpdateY: (absoluteY: number) => void;
  onDragUpdate: (bookId: string, x: number, y: number) => void;
  onDrop: (bookId: string, x: number, y: number) => void;
  // Always called when the gesture ends, unlike onDrop above (which only
  // fires past MIN_DRAG_DISTANCE) — cleanup that must never be skipped
  // (stopping auto-scroll, the remeasure loop) goes here, not in onDrop. A
  // drag that ends right as it crossed into the auto-scroll edge zone but
  // before clearing that distance threshold used to leave the auto-scroll
  // interval running forever, since onDrop (where stopAutoScroll lived)
  // never fired — the page would keep getting yanked down/up with no way
  // to stop it.
  onDragEnd?: () => void;
  onTap?: () => void;
  style?: any;
  // Absolute-Y thresholds for the auto-scroll edge zones (top/bottom), so
  // onDragUpdateY only crosses the JS bridge when the finger actually
  // transitions between zones rather than on every single move frame.
  edgeZoneTop: number;
  edgeZoneBottom: number;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const scale = useSharedValue(1);
  const lastZone = useSharedValue<0 | 1 | -1>(0);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    // Without an activation distance, the pan claims the touch on the very
    // first move and wins the gesture arena against nested touchables — the
    // tilt button (↻) and pile "x" unstack button both live inside this same
    // draggable tile, so a light tap on either was getting swallowed as a
    // (near-zero-distance) drag instead of reaching the button's onPress.
    // minDistance preserves taps on the nested buttons while allowing a drag
    // in *any* direction. Using both X and Y active offsets here required a
    // diagonal movement before the gesture could activate.
    .minDistance(8)
    .onStart(() => {
      dragging.value = true;
      scale.value = withSpring(1.04, { damping: 18 });
      lastZone.value = 0;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      const zone =
        e.absoluteY < edgeZoneTop ? -1 : e.absoluteY > edgeZoneBottom ? 1 : 0;
      if (zone !== lastZone.value) {
        lastZone.value = zone;
        runOnJS(onDragUpdateY)(e.absoluteY);
      }
      if (Math.hypot(e.translationX, e.translationY) >= MIN_DRAG_DISTANCE) {
        runOnJS(onDragUpdate)(bookId, e.absoluteX, e.absoluteY);
      }
    })
    .onEnd((e) => {
      if (Math.hypot(e.translationX, e.translationY) >= MIN_DRAG_DISTANCE) {
        runOnJS(onDrop)(bookId, e.absoluteX, e.absoluteY);
      }
      translateX.value = withSpring(0, { damping: 18 });
      translateY.value = withSpring(0, { damping: 18 });
      scale.value = withSpring(1, { damping: 18 });
      dragging.value = false;
    })
    // Runs after onEnd on a normal release *and* on a cancelled/failed
    // gesture (a notification pull-down, the OS stealing the touch, etc.) —
    // onEnd alone can be skipped in those cases, which is exactly when this
    // cleanup matters most.
    .onFinalize(() => {
      if (onDragEnd) runOnJS(onDragEnd)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: dragging.value ? 10 : 0,
    opacity: dragging.value ? 0.85 : 1,
  }));

  const tap = Gesture.Tap().onEnd(() => {
    if (onTap) runOnJS(onTap)();
  });

  return (
    <GestureDetector gesture={onTap ? Gesture.Exclusive(pan, tap) : pan}>
      <Animated.View
        ref={(node: any) => registerRef(bookId, node)}
        layout={LinearTransition.springify().damping(18)}
        style={[style, animatedStyle]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

// A small grip icon that drags a *group* of books at once — an entire pile
// (via its front cover) or an entire shelf row (via the row's left edge) —
// instead of a single book. The group's own tiles are still individually
// wrapped in DraggableShelfBook, so they already animate into their new
// slots via layout transition once handleGroupDragUpdate reorders them
// underneath; this handle itself only needs to report finger position, not
// visually carry the whole group along with it.
function DraggableHandle({
  groupIds,
  onDragStart,
  onDragUpdateY,
  onDragUpdate,
  onDrop,
  onDragEnd,
  edgeZoneTop,
  edgeZoneBottom,
  children,
}: {
  groupIds: string[];
  onDragStart: () => void;
  onDragUpdateY: (absoluteY: number) => void;
  onDragUpdate: (groupIds: string[], x: number, y: number) => void;
  onDrop: (groupIds: string[], x: number, y: number) => void;
  // Always called on gesture end — see the identical prop on
  // DraggableShelfBook for why this can't just live inside onDrop.
  onDragEnd?: () => void;
  // Absolute-Y thresholds for the auto-scroll edge zones (top/bottom), so
  // onDragUpdateY only crosses the JS bridge when the finger actually
  // transitions between zones rather than on every single move frame.
  edgeZoneTop: number;
  edgeZoneBottom: number;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const lastZone = useSharedValue<0 | 1 | -1>(0);

  const pan = Gesture.Pan()
    // Was activeOffsetX/Y([-10,10]) — that pairing requires the movement to
    // exceed both axes' ranges, which in practice needed a diagonal drag to
    // activate (see the identical fix/comment on DraggableShelfBook's own
    // pan above). A pure vertical drag — exactly what moving a pile to
    // another shelf row needs — lost the gesture arena to the parent
    // ScrollView's scroll instead of activating, so the pile followed the
    // finger via onUpdate but onEnd saw a cancelled/near-zero translation
    // and never persisted, snapping back to its old spot. minDistance
    // activates on movement in any direction, matching what already works
    // for single-book drags.
    .minDistance(10)
    .onStart(() => {
      dragging.value = true;
      lastZone.value = 0;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      const zone =
        e.absoluteY < edgeZoneTop ? -1 : e.absoluteY > edgeZoneBottom ? 1 : 0;
      if (zone !== lastZone.value) {
        lastZone.value = zone;
        runOnJS(onDragUpdateY)(e.absoluteY);
      }
      if (Math.hypot(e.translationX, e.translationY) >= MIN_DRAG_DISTANCE) {
        runOnJS(onDragUpdate)(groupIds, e.absoluteX, e.absoluteY);
      }
    })
    .onEnd((e) => {
      if (Math.hypot(e.translationX, e.translationY) >= MIN_DRAG_DISTANCE) {
        runOnJS(onDrop)(groupIds, e.absoluteX, e.absoluteY);
      }
      translateX.value = withSpring(0, { damping: 18 });
      translateY.value = withSpring(0, { damping: 18 });
      dragging.value = false;
    })
    .onFinalize(() => {
      if (onDragEnd) runOnJS(onDragEnd)();
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    opacity: dragging.value ? 0.6 : 1,
    // zIndex on the handle's own *content* (e.g. pileGrip) only wins against
    // its own siblings — the book bars stacked after it in the tree still
    // painted over it without this on the wrapper itself.
    zIndex: 20,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

const SALON_IMAGE = require("../../assets/salon.jpg");
// assets/salon.jpg is a fixed 7019×4988 illustration with 4 distinct pieces
// of furniture holding books; each is mapped to one status and given a
// percentage-based (not pixel) hit zone so it still lines up correctly
// whatever width the image actually renders at on a given device — see
// SALON_IMAGE_ASPECT_RATIO below, which is what keeps that percentage
// mapping valid (the image is always shown at its native ratio, never
// cropped/stretched).
const SALON_IMAGE_ASPECT_RATIO = 7019 / 4988;
const SALON_SHELF_ZONES: {
  status: string;
  labelKey: string;
  icon: keyof typeof Feather.glyphMap;
  top: `${number}%`;
  left: `${number}%`;
  width: `${number}%`;
  height: `${number}%`;
}[] = [
  // Left wall shelf (3 tiers)
  {
    status: "dnf",
    labelKey: "library.tabs.dnf",
    icon: "x-circle",
    top: "35%",
    left: "9%",
    width: "23%",
    height: "29%",
  },
  // Middle wall cabinet above the chair (3 tiers)
  {
    status: "done",
    labelKey: "library.status.read",
    icon: "check-circle",
    top: "27%",
    left: "36%",
    width: "23%",
    height: "26%",
  },
  // Small side table stacked with books, in front of the chair
  {
    status: "reading",
    labelKey: "library.status.reading",
    icon: "book-open",
    top: "56%",
    left: "35%",
    width: "11%",
    height: "30%",
  },
  // Tall rolling bookshelf on the right (4 tiers)
  {
    status: "to_read",
    labelKey: "library.status.toRead",
    icon: "bookmark",
    top: "34%",
    left: "66%",
    width: "25%",
    height: "50%",
  },
];

// The room is now a real illustration (assets/salon.jpg) instead of a
// hand-drawn approximation — each piece of furniture in the image gets an
// invisible percentage-positioned tap zone (see SALON_SHELF_ZONES) handing
// off to the exact same per-status shelf browsing UI already used by
// viewMode "shelf" (see roomZoomed in LibraryScreen).
function RoomView({
  colors,
  styles,
  onOpenShelf,
}: {
  colors: ColorPalette;
  styles: any;
  onOpenShelf: (status: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ScrollView
      style={styles.roomScroll}
      contentContainerStyle={styles.roomFloor}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.roomHint}>{t('library.tapShelfToOpen')}</Text>

      <View style={styles.salonCard}>
        <View
          style={[
            styles.salonImageWrap,
            { aspectRatio: SALON_IMAGE_ASPECT_RATIO },
          ]}
        >
          <Image
            source={SALON_IMAGE}
            style={styles.salonImage}
            resizeMode="contain"
          />
          {SALON_SHELF_ZONES.map((zone) => (
            <TouchableOpacity
              key={zone.status}
              style={[
                styles.salonShelfZone,
                {
                  top: zone.top,
                  left: zone.left,
                  width: zone.width,
                  height: zone.height,
                },
              ]}
              activeOpacity={0.7}
              accessibilityLabel={t(zone.labelKey)}
              onPress={() => onOpenShelf(zone.status)}
            >
              <View
                style={[
                  styles.salonShelfBadge,
                  { backgroundColor: colors.purple },
                ]}
              >
                <Feather name={zone.icon} size={11} color="#FFFFFF" />
                <Text style={styles.salonShelfBadgeText}>{t(zone.labelKey)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

export default function LibraryScreen() {
  const { colors } = useTheme();
  const { profile, setLibraryViewMode } = useAuth();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState("to_read");
  // Only meaningful for the "to_read" tab — possession (owned vs wishlist)
  // is independent of reading status, but not worth surfacing as a filter
  // on reading/done/dnf shelves where a book is owned by definition.
  const [ownedFilter, setOwnedFilter] = useState<"all" | "owned" | "wishlist">("all");
  const [query, setQuery] = useState("");
  const [allBooks, setAllBooks] = useState<any[]>([]);
  const [allFrames, setAllFrames] = useState<shelfFrames.ShelfFrame[]>([]);
  // How many decoration slots (frame/plant/clock) badges have unlocked so
  // far — see lib/badges.ts's syncDecorationUnlocks. Placing a new one is
  // gated on allFrames.length < decorationsUnlocked (see
  // requireDecorationSlot below).
  const [decorationsUnlocked, setDecorationsUnlocked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<any>(null);
  const [poppedBook, setPoppedBook] = useState<any>(null);
  // Persisted on the profile row (see AuthContext.setLibraryViewMode) so this
  // doesn't reset to 'shelf' every time the app reopens.
  const viewMode = profile?.library_view_mode ?? "shelf";
  const setViewMode = setLibraryViewMode;
  // viewMode "shelf" now starts on a wide "room" view of several bookshelf
  // cabinets (one per status) — tapping one zooms into that shelf's actual
  // books, reusing the exact same shelf browsing UI (see RoomView above).
  // Local/unpersisted: reopening the tab always starts back at the room,
  // not mid-zoom.
  const [roomZoomed, setRoomZoomed] = useState(false);
  const [sortOrder, setSortOrder] = useState<
    "manual" | "asc" | "desc" | "author"
  >("manual");
  const [showSortSheet, setShowSortSheet] = useState(false);
  // The frame picker flow: null (closed), a top-level sheet offering
  // "choisir un livre" / "depuis ma galerie" / (when editing) "supprimer",
  // or the book-cover sub-sheet once "choisir un livre" is picked.
  const [framePicker, setFramePicker] = useState<
    | null
    | { step: "menu"; frame: shelfFrames.ShelfFrame | null }
    | { step: "book"; frame: shelfFrames.ShelfFrame | null }
  >(null);
  // Tap-to-place flow for a brand new frame: a translucent, dashed "ghost"
  // frame sits among the books at `position` (a raw book count) — books
  // shift to make room for it, same as if it were really there — and
  // dragging it (or tapping it) opens the content picker, which creates the
  // real frame there. A plant has no content step, so it skips this
  // entirely and is placed directly (see addPlantDirectly). An already-
  // placed piece is repositioned by dragging it directly, same as a book
  // (see handleFrameDragUpdate/handleFrameDrop) — no ghost needed.
  const [framePlacement, setFramePlacement] = useState<{
    position: number;
  } | null>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [showEditTutorial, setShowEditTutorial] = useState(false);
  // While the FlatList re-settles onto the restored scroll offset (see the
  // reorderMode effect below), it's kept invisible instead of visibly
  // rendering at the top and then jumping — that jump-then-correct sequence
  // was the "flash" back to the wrong spot before landing on the right one.
  const [restoringScroll, setRestoringScroll] = useState(false);
  // Drives the floating "scroll to top" button — shown once any of the
  // four scrollable containers below (grid/shelf × normal/reorder) has
  // scrolled far enough down to be worth a shortcut back up.
  const [showScrollTop, setShowScrollTop] = useState(false);
  // Grid mode only — tap-to-swap, no menu, since grid has no "pile" concept.
  const [reorderSelectedId, setReorderSelectedId] = useState<string | null>(
    null,
  );
  const [spacingSelectedId, setSpacingSelectedId] = useState<string | null>(
    null,
  );
  const [stackTargetId, setStackTargetId] = useState<string | null>(null);
  // Shelf mode's drag-and-drop (see DraggableShelfBook): every mounted
  // tile's own View ref, remeasured fresh into shelfFramesRef right when a
  // drag starts (not just once on layout — this list scrolls, and a frame
  // measured once at mount goes stale the moment it does).
  const shelfViewRefs = useRef<Record<string, View | null>>({});
  const shelfFramesRef = useRef<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const registerShelfRef = (id: string, ref: View | null) => {
    shelfViewRefs.current[id] = ref;
  };
  const remeasureShelfFrames = () => {
    Object.entries(shelfViewRefs.current).forEach(([id, ref]) => {
      ref?.measureInWindow((x, y, width, height) => {
        shelfFramesRef.current[id] = { x, y, width, height };
      });
    });
  };
  // Auto-scroll while dragging near the top/bottom edge — without this,
  // reorder mode's ScrollViews can't scroll during an active drag (the pan
  // gesture owns the touch), so there was no way to drag a book up to a row
  // above the current viewport at all.
  const reorderScrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  // Search bar + category pills collapse away on a downward scroll and
  // reappear on an upward one, freeing up space for the shelf — same idea as
  // most feed apps' collapsing toolbars. In reorder mode they stay hidden
  // outright regardless of scroll direction, since that mode already needs
  // all the vertical room it can get (see the reorderMode effect below).
  // Actually unmounted (not just animated to zero size) when collapsed —
  // an ancestor's height/overflow doesn't change a descendant's own layout
  // box, so a purely visual collapse would still leave the search input
  // sitting there at full size for anything checking "is this on screen"
  // (assistive tech, e2e tests) even though a sighted user can't see it.
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const lastScrollYRef = useRef(0);
  const SCROLL_HIDE_THRESHOLD = 12;
  const handleToolbarScroll = (y: number) => {
    if (reorderMode) return;
    const delta = y - lastScrollYRef.current;
    if (y <= 0) {
      setToolbarCollapsed(false);
    } else if (delta > SCROLL_HIDE_THRESHOLD) {
      setToolbarCollapsed(true);
      lastScrollYRef.current = y;
    } else if (delta < -SCROLL_HIDE_THRESHOLD) {
      setToolbarCollapsed(false);
      lastScrollYRef.current = y;
    }
  };
  useEffect(() => {
    setToolbarCollapsed(reorderMode);
    lastScrollYRef.current = 0;
  }, [reorderMode]);
  const autoScrollDirRef = useRef<0 | 1 | -1>(0);
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const EDGE_ZONE = 90;
  // Counts auto-scroll ticks so remeasureShelfFrames (one measureInWindow
  // bridge call per mounted tile) only runs every 3rd tick instead of every
  // 16ms — on a long shelf with 50+ tiles, remeasuring on every tick was
  // saturating the native bridge and made the auto-scroll itself stutter.
  const autoScrollTickRef = useRef(0);
  const stopAutoScroll = () => {
    autoScrollDirRef.current = 0;
    autoScrollTickRef.current = 0;
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  };
  const startAutoScroll = (dir: 1 | -1) => {
    autoScrollDirRef.current = dir;
    if (autoScrollIntervalRef.current) return;
    autoScrollIntervalRef.current = setInterval(() => {
      scrollOffsetRef.current = Math.max(
        0,
        scrollOffsetRef.current + autoScrollDirRef.current * 14,
      );
      reorderScrollRef.current?.scrollTo({
        y: scrollOffsetRef.current,
        animated: false,
      });
      // Every tile's frame was only ever captured once, at drag-start — once
      // auto-scroll actually moves the shelf under the dragged finger, those
      // frames go stale immediately and every subsequent hit-test (live
      // preview *and* the final drop) lands against the pre-scroll
      // positions, which reads as random/wrong drop targets. Re-measuring on
      // every scroll tick keeps them live for the rest of the drag — but not
      // literally every tick (see autoScrollTickRef above).
      autoScrollTickRef.current += 1;
      if (autoScrollTickRef.current % 3 === 0) remeasureShelfFrames();
    }, 16);
  };
  const handleDragAutoScroll = (absoluteY: number) => {
    if (absoluteY < EDGE_ZONE) startAutoScroll(-1);
    else if (absoluteY > height - EDGE_ZONE) startAutoScroll(1);
    else stopAutoScroll();
  };
  useEffect(() => stopAutoScroll, []);

  // A continuous remeasure loop here (independent of auto-scroll) was tried
  // to keep frames fresh through the live-preview reflow, but it raced with
  // that same reflow's own layout animations often enough to break ordinary
  // drags (a book would visibly follow the finger and then snap back with
  // nothing persisted) — reverted. Frames are refreshed at drag-start and on
  // every auto-scroll tick (see startAutoScroll above), same as before.
  const startDragRemeasure = () => {};
  const stopDragRemeasure = () => {};

  // Always runs when a drag gesture ends, success or not — passed as
  // onDragEnd to DraggableShelfBook/DraggableHandle, separate from onDrop
  // (which only fires past MIN_DRAG_DISTANCE and does the actual reorder/
  // persist). A drag that ends right after entering the auto-scroll edge
  // zone but before clearing that distance threshold used to leave
  // startAutoScroll's interval running forever — stopAutoScroll lived only
  // inside onDrop, which never fired — scrolling the page on its own with
  // no way to stop it.
  const endDrag = () => {
    stopAutoScroll();
    stopDragRemeasure();
    lastShelfTargetRef.current = null;
    setStackTargetId(null);
  };

  const listRef = useRef<FlatList>(null);
  const hasLoadedOnce = useRef(false);
  // Counts in-flight order/stack saves (persistOrder, doStack, doUnstack) —
  // loadBooks skips overwriting local state while any of these are still
  // pending, since a fast refocus-triggered read can otherwise resolve
  // before a slower write actually commits and silently revert a reorder
  // the user just made.
  const pendingWritesRef = useRef(0);

  // Shared by both "screen regained focus" (below) and "reorder mode just
  // toggled off" (the effect further down) — same virtualized-FlatList
  // problem either way: right after it (re)appears, scrollToOffset only
  // knows an *estimate* of where offset y actually is, so a single jump
  // lands roughly right and then visibly corrects itself as real rows
  // measure in. Retrying while hidden (restoringScroll) turns that into a
  // clean reveal already in the right place instead of a flash-then-jump.
  const restoreScrollPosition = () => {
    const y = scrollOffsetRef.current;
    if (y <= 0) return () => {};
    if (reorderMode) {
      requestAnimationFrame(() => {
        reorderScrollRef.current?.scrollTo({ y, animated: false });
      });
      return () => {};
    }
    setRestoringScroll(true);
    const attempts = [0, 50, 150, 300];
    const timers = attempts.map((delay) =>
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: y, animated: false });
        if (delay === attempts[attempts.length - 1]) setRestoringScroll(false);
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  };

  useFocusEffect(
    useCallback(() => {
      // Regaining focus after pushing/popping the book detail screen (or any
      // other pushed route) should land back exactly where you were, not
      // snap to the top — only a genuinely fresh mount has nothing to
      // restore (scrollOffsetRef is still 0 then, so this is a no-op).
      const cleanup = restoreScrollPosition();
      loadBooks();
      loadFrames();
      badges
        .syncDecorationUnlocks()
        .then(setDecorationsUnlocked)
        .catch(() => {});
      // Cleans up any title+author duplicates that predate addBookSmart
      // (see app/(tabs)/search.tsx) — e.g. the same book once added via two
      // different search providers. Runs after the initial paint above and
      // only reloads if it actually found something to merge.
      userBooks
        .mergeDuplicates()
        .then((count) => {
          if (count > 0) loadBooks();
        })
        .catch(() => {});
      return cleanup;
    }, [reorderMode]),
  );

  useEffect(
    () =>
      onScrollToTop("library", () =>
        listRef.current?.scrollToOffset({ offset: 0, animated: true }),
      ),
    [],
  );

  // Switching in/out of reorder mode swaps the FlatList for a ScrollView (or
  // vice versa) — they're different component instances, so each one mounts
  // fresh at the top on its own. Restoring the last known offset onto
  // whichever one just mounted is what keeps you where you were instead of
  // getting bounced back to the top every time you tap the edit icon.
  const isMountRef = useRef(true);
  useEffect(() => {
    if (isMountRef.current) {
      isMountRef.current = false;
      return;
    }
    return restoreScrollPosition();
  }, [reorderMode]);

  // Floating "scroll to top" button — scrolls whichever of the four
  // containers (grid/shelf × normal/reorder) is currently mounted.
  const scrollToTop = () => {
    if (reorderMode)
      reorderScrollRef.current?.scrollTo({ y: 0, animated: true });
    else listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

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
        // A write still in flight (reorder/stack/unstack) may not be
        // reflected in this read yet — applying it now would clobber the
        // optimistic local state with stale server data. The next focus
        // event, once the write has settled, will pick up the real order.
        if (pendingWritesRef.current === 0) setAllBooks(res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const loadFrames = () => {
    Promise.all(
      TABS.map((tab) => shelfFrames.getShelfFrames(tab.value).catch(() => [])),
    ).then((results) => setAllFrames(results.flat()));
  };

  // Content-only edit of an already-placed frame — its position doesn't
  // change, just what it shows.
  const openFramePicker = (frame: shelfFrames.ShelfFrame) =>
    setFramePicker({ step: "menu", frame });

  // Roughly "where the user currently is" — counts real books (spines=1,
  // piles=all their books) across rows already scrolled past, using the
  // same approximate row height the shelf actually renders at. Centered on
  // the *middle* of the visible viewport, not its top edge — the top edge
  // is often a row that's barely peeking into view (or already scrolled
  // past), which read as placing things above where the user was actually
  // looking.
  const ROW_HEIGHT_ESTIMATE = SPINE_HEIGHT + 40;
  const estimatePlacementPosition = () => {
    const estimatedRowIndex = Math.max(
      0,
      Math.round((scrollOffsetRef.current + height / 2) / ROW_HEIGHT_ESTIMATE),
    );
    let position = 0;
    for (let i = 0; i < Math.min(estimatedRowIndex, rows.length); i++) {
      const row = rows[i];
      if (row.type !== "books") continue;
      for (const slot of row.slots) {
        if (slot.type === "spine") position += 1;
        else if (slot.type === "stack") position += slot.books.length;
      }
    }
    return position;
  };
  // Placing a new decoration is gated on having an unused badge-earned slot
  // — see lib/badges.ts's syncDecorationUnlocks. Blocks and explains (with a
  // shortcut to the badges screen) instead of silently doing nothing.
  const requireDecorationSlot = () => {
    if (allFrames.length >= decorationsUnlocked) {
      Alert.alert(
        t("library.noMoreDecorations"),
        decorationsUnlocked === 0
          ? t("library.unlockFirstDecoration")
          : t("library.unlockedDecorations", { count: decorationsUnlocked }),
        [
          { text: t("library.viewBadges"), onPress: () => router.push("/badges") },
          { text: t("common.ok"), style: "cancel" },
        ],
      );
      return false;
    }
    return true;
  };

  const beginFramePlacement = () => {
    if (!requireDecorationSlot()) return;
    setFramePlacement({ position: estimatePlacementPosition() });
  };
  // A plant has no content to pick afterward, so the ghost-then-confirm
  // step (needed for a frame) is just friction — it's placed right away at
  // the estimated spot, and can still be dragged to reposition once it's
  // real, same as a frame.
  const addPlantDirectly = () => {
    if (!requireDecorationSlot()) return;
    placeFrame(estimatePlacementPosition(), "plant");
  };
  // Same reasoning as the plant — a clock has nothing to configure, so it's
  // placed directly rather than going through the ghost/confirm flow.
  const addClockDirectly = () => {
    if (!requireDecorationSlot()) return;
    placeFrame(estimatePlacementPosition(), "clock");
  };
  // Same reasoning as the plant/clock — a candle is purely decorative too.
  const addCandleDirectly = () => {
    if (!requireDecorationSlot()) return;
    placeFrame(estimatePlacementPosition(), "candle");
  };

  // Tapping/dropping the ghost places it — the piece is created right away
  // (a plant needs nothing more; a frame starts empty). Choosing what a
  // frame shows (book cover or photo) is a separate step, done afterward by
  // tapping the now-real frame (see openFramePicker).
  const placeFrame = (position: number, kind: shelfFrames.ShelfFrameKind) => {
    setFramePlacement(null);
    transferShelfBreak(filteredBooks[position]?.book_id, `frame:new`);
    shelfFrames
      .addShelfFrame(activeTab, position, kind)
      .then((created) => setAllFrames((cur) => [...cur, created]))
      .catch(() => Alert.alert(t("common.error"), t("library.errors.addFrame")));
  };

  const confirmFramePlacement = () => {
    if (!framePlacement) return;
    placeFrame(framePlacement.position, "frame");
  };

  const pickFrameImage = async (source: "camera" | "gallery") => {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert(
        t("library.permissionDenied"),
        source === "camera"
          ? t("library.cameraAccessNeeded")
          : t("library.galleryAccessNeeded"),
      );
      return;
    }
    const options = {
      allowsEditing: true,
      aspect: [3, 4] as [number, number],
      quality: 0.6,
      base64: true,
    };
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            ...options,
          });
    if (result.canceled || !result.assets[0].base64) return;
    const imageUrl = `data:image/jpeg;base64,${result.assets[0].base64}`;
    const editingFrame = framePicker?.frame;
    setFramePicker(null);
    if (!editingFrame) return;
    setAllFrames((cur) =>
      cur.map((f) =>
        f.id === editingFrame.id
          ? { ...f, image_url: imageUrl, book_id: null }
          : f,
      ),
    );
    shelfFrames
      .setShelfFrameContent(editingFrame.id, { imageUrl })
      .catch(() => Alert.alert(t("common.error"), t("library.errors.editFrame")));
  };

  const pickFrameBook = (book: any) => {
    const editingFrame = framePicker?.frame;
    setFramePicker(null);
    if (!editingFrame) return;
    setAllFrames((cur) =>
      cur.map((f) =>
        f.id === editingFrame.id
          ? { ...f, book_id: book.book_id, image_url: null }
          : f,
      ),
    );
    shelfFrames
      .setShelfFrameContent(editingFrame.id, { bookId: book.book_id })
      .catch(() => Alert.alert(t("common.error"), t("library.errors.editFrame")));
  };

  const deleteFrame = (frame: shelfFrames.ShelfFrame) => {
    setFramePicker(null);
    setAllFrames((cur) => cur.filter((f) => f.id !== frame.id));
    shelfFrames
      .removeShelfFrame(frame.id)
      .catch(() => Alert.alert(t("common.error"), t("library.errors.removeFrame")));
  };

  const frameImageUri = (frame: shelfFrames.ShelfFrame) =>
    frame.image_url ||
    (frame.book_id
      ? allBooks.find((b) => b.book_id === frame.book_id)?.cover_url
      : null);

  const renderFrameSlot = (
    frame: shelfFrames.ShelfFrame & { __ghost?: boolean },
  ) => {
    // A plant is purely decorative — no content picker, no tilt (it just
    // stands straight on the shelf), only move/delete like a frame.
    if (frame.kind === "plant") {
      return (
        <View key={`frame-${frame.id}`} style={styles.plantWrap}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.plantBox}
            onPress={() => {
              if (frame.__ghost) confirmFramePlacement();
            }}
          >
            {frame.__ghost ? (
              <Feather name="check" size={18} color={colors.purple} />
            ) : (
              <Image
                source={plantImageFor(frame.id)}
                style={styles.plantImage}
                resizeMode="cover"
              />
            )}
          </TouchableOpacity>
          {reorderMode && !frame.__ghost ? (
            <TouchableOpacity
              style={styles.frameDeleteBtn}
              hitSlop={8}
              onPress={() => deleteFrame(frame)}
            >
              <Feather name="x" size={12} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    // A candle, exactly like the plant above — purely decorative, no
    // content picker, no tilt, only move/delete.
    if (frame.kind === "candle") {
      return (
        <View key={`frame-${frame.id}`} style={styles.candleWrap}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.candleBox}
            onPress={() => {
              if (frame.__ghost) confirmFramePlacement();
            }}
          >
            {frame.__ghost ? (
              <Feather name="check" size={18} color={colors.purple} />
            ) : (
              <Image
                source={candleImageFor(frame.id)}
                style={styles.candleImage}
                resizeMode="cover"
              />
            )}
          </TouchableOpacity>
          {reorderMode && !frame.__ghost ? (
            <TouchableOpacity
              style={styles.frameDeleteBtn}
              hitSlop={8}
              onPress={() => deleteFrame(frame)}
            >
              <Feather name="x" size={12} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    // A clock is purely decorative too, and (unlike a frame) is never a
    // ghost — it's placed directly (see addClockDirectly) since there's
    // nothing to configure afterward.
    if (frame.kind === "clock") {
      return (
        <View key={`frame-${frame.id}`} style={styles.clockWrap}>
          <LiveClockFace colors={colors} styles={styles} />
          {reorderMode ? (
            <TouchableOpacity
              style={styles.frameDeleteBtn}
              hitSlop={8}
              onPress={() => deleteFrame(frame)}
            >
              <Feather name="x" size={12} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    return (
      <View key={`frame-${frame.id}`} style={styles.frameWrap}>
        <View
          style={[
            styles.frameShadow,
            { transform: [{ rotate: `${frameTilt(frame) * 1.4}deg` }] },
          ]}
        />
        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            styles.frameBox,
            { transform: [{ rotate: `${frameTilt(frame)}deg` }] },
            frame.__ghost && styles.frameBoxGhost,
          ]}
          onPress={() => {
            if (frame.__ghost) confirmFramePlacement();
            else if (reorderMode) openFramePicker(frame);
          }}
        >
          {frame.__ghost ? (
            <Feather name="check" size={22} color={colors.purple} />
          ) : frameImageUri(frame) ? (
            <Image
              source={{ uri: frameImageUri(frame)! }}
              style={styles.frameImage}
            />
          ) : (
            <View style={styles.frameEmpty}>
              <Feather name="image" size={20} color={colors.gray} />
            </View>
          )}
          {reorderMode && !frame.__ghost ? (
            <TouchableOpacity
              style={styles.tiltBtn}
              hitSlop={8}
              onPress={() => cycleFrameTilt(frame)}
            >
              <Feather name="rotate-cw" size={11} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
        {reorderMode && !frame.__ghost ? (
          <TouchableOpacity
            style={styles.frameDeleteBtn}
            hitSlop={8}
            onPress={() => deleteFrame(frame)}
          >
            <Feather name="x" size={12} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const q = query.trim().toLowerCase();
  // Memoized so its array identity only changes when one of its actual
  // inputs does — without this, buildRows's row-packing/pile-grouping pass
  // (via the `rows` useMemo below, keyed on filteredBooks) re-ran on every
  // single render, including every drag-preview tick, since a fresh
  // `.filter().sort()` array defeats a useMemo dependency check even when
  // its contents are equivalent.
  const filteredBooks = useMemo(
    () =>
      allBooks
        .filter((b) => b.status === activeTab)
        .filter(
          (b) =>
            activeTab !== "to_read" ||
            ownedFilter === "all" ||
            (ownedFilter === "owned" ? b.owned : !b.owned),
        )
        .filter(
          (b) =>
            !q ||
            b.title?.toLowerCase().includes(q) ||
            b.author?.toLowerCase().includes(q),
        )
        // "manual" (the default) shows your own arrangement — manually placed
        // books (shelf_position, via reorder mode) first in their saved order,
        // anything never placed falling back to date added. Explicitly picking
        // "asc"/"desc" from the sort sheet instead sorts *everything* by date,
        // ignoring shelf_position for the view — but never touches or clears
        // it, so switching back to "Mon organisation" restores it exactly.
        .sort((a, b) => {
          if (sortOrder === "manual") {
            if (a.shelf_position != null && b.shelf_position != null)
              return a.shelf_position - b.shelf_position;
            if (a.shelf_position != null) return -1;
            if (b.shelf_position != null) return 1;
            return (
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
            );
          }
          if (sortOrder === "author") {
            return (a.author || "").localeCompare(b.author || "");
          }
          const diff =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          return sortOrder === "asc" ? diff : -diff;
        }),
    [allBooks, activeTab, ownedFilter, q, sortOrder],
  );
  const counts: any = {};
  allBooks.forEach((b) => {
    counts[b.status] = (counts[b.status] || 0) + 1;
  });

  const activeFrames = useMemo(
    () => allFrames.filter((f) => f.status === activeTab),
    [allFrames, activeTab],
  );
  // While placing a brand new frame, a ghost stands in at the tentative
  // position — buildRows treats it exactly like a real frame, so books
  // shift for it.
  const framesForRows = useMemo(() => {
    if (!framePlacement) return activeFrames;
    return [
      ...activeFrames,
      {
        id: "__ghost__",
        status: activeTab,
        position: framePlacement.position,
        kind: "frame",
        book_id: null,
        image_url: null,
        __ghost: true,
      } as any,
    ];
  }, [activeFrames, framePlacement, activeTab]);
  const rows = useMemo(
    () => buildRows(filteredBooks, width - SCREEN_PADDING, framesForRows),
    [filteredBooks, width, framesForRows],
  );
  // The spacing popup (Gauche/Droite/Nouvelle ligne) floats above the
  // selected book, and the shelf's first row has no room above it for that
  // — so extra scroll padding is only reserved right when it's actually
  // needed (a single book in that first row is selected), not permanently.
  // Piles deliberately don't get this treatment — their popup just overlays
  // freely like a single book's, no space reserved/calculated for it.
  const firstRow = rows[0];
  const spacingSelectedInFirstRow =
    !!spacingSelectedId &&
    firstRow?.type === "books" &&
    firstRow.slots.some(
      (slot) =>
        slot.type === "spine" && slot.book.book_id === spacingSelectedId,
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
        setPoppedBook(null);
        loadBooks();
      });
    };
    // RN Web's Alert.alert only ever renders a single-button window.alert —
    // multi-button/destructive-style configs like this one are silently
    // dropped, so the confirm dialog (and thus the remove callback) never
    // appeared on web at all. window.confirm is the web-native equivalent.
    if (Platform.OS === "web") {
      if (window.confirm(t("library.confirmRemoveBook"))) doRemove();
      return;
    }
    Alert.alert(t("library.remove"), t("library.confirmRemoveBook"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("library.remove"), style: "destructive", onPress: doRemove },
    ]);
  };

  // Shared by both reorder interactions below: writes a full new order for
  // the current status back to allBooks (so the sort in filteredBooks picks
  // it up) and persists it. Every id in `ids` always gets a position, so
  // there's no such thing as an unreachable "empty" slot in the list.
  const persistOrder = (ids: string[]) => {
    setAllBooks((cur) =>
      cur.map((b) =>
        b.status === activeTab
          ? { ...b, shelf_position: ids.indexOf(b.book_id) }
          : b,
      ),
    );
    pendingWritesRef.current++;
    userBooks
      .saveShelfOrder(ids)
      .catch(() => Alert.alert(t("common.error"), t("library.errors.saveOrder")))
      .finally(() => {
        pendingWritesRef.current--;
      });
  };

  // Reorders a book within its own pile (see renderStack: the pile's
  // top-to-bottom order is that group's relative order within filteredBooks,
  // not their own individual shelf_position values) — swaps it with its
  // pile neighbor one step up/down, leaving every other book's position
  // untouched, then persists the same way a drag-drop does.
  const moveBookInPile = (book: any, direction: "up" | "down") => {
    if (!book.pile_id) return;
    const ids = filteredBooks.map((b) => b.book_id);
    const pileIndices = filteredBooks
      .map((b, i) => (b.pile_id === book.pile_id ? i : -1))
      .filter((i) => i !== -1);
    const posInPile = pileIndices.indexOf(ids.indexOf(book.book_id));
    const swapWith = direction === "up" ? posInPile - 1 : posInPile + 1;
    if (swapWith < 0 || swapWith >= pileIndices.length) return;
    const idxA = pileIndices[posInPile];
    const idxB = pileIndices[swapWith];
    [ids[idxA], ids[idxB]] = [ids[idxB], ids[idxA]];
    persistOrder(ids);
  };

  // Grid-only tap-to-swap: first tap picks a book up, a second tap on a
  // different book swaps their places. No "pile" concept in grid mode, so
  // there's nothing to disambiguate — unlike shelf mode's drag (below).
  const swapBooks = (book: any) => {
    if (!reorderSelectedId) {
      setReorderSelectedId(book.book_id);
      return;
    }
    if (reorderSelectedId === book.book_id) {
      setReorderSelectedId(null);
      return;
    }
    const ids = filteredBooks.map((b) => b.book_id);
    const iA = ids.indexOf(reorderSelectedId);
    const iB = ids.indexOf(book.book_id);
    [ids[iA], ids[iB]] = [ids[iB], ids[iA]];
    persistOrder(ids);
    setReorderSelectedId(null);
  };

  // Merges two books into one manual pile — whichever of the two is already
  // in a pile "wins" (the other joins it); if neither is, a new pile is
  // created keyed off the target's id. Doesn't handle merging two *different*
  // existing piles into each other — an edge case rare enough not to be
  // worth the extra bookkeeping here.
  const doStack = (movedId: string, targetId: string) => {
    const moveBookInit = filteredBooks.find((x) => x.book_id === movedId);
    const targetBookInit = filteredBooks.find((x) => x.book_id === targetId);
    if (!moveBookInit || !targetBookInit) return;
    const existingPileId =
      targetBookInit.pile_id ?? moveBookInit.pile_id ?? null;
    if (existingPileId) {
      const pileSize = filteredBooks.filter(
        (x) => x.pile_id === existingPileId,
      ).length;
      if (pileSize >= STACK_SIZE) {
        Alert.alert(
          t("library.pileFull"),
          t("library.pileFullMessage", { count: STACK_SIZE }),
        );
        return;
      }
    }
    // stackBooks(moveBook, targetBook, existingPileId) always updates
    // moveBook's pile_id and only touches targetBook's when existingPileId
    // was null — so whichever of the two already had a pile has to be
    // passed as "targetBook" for the other to correctly join *its* pile.
    const [moveBook, targetBook] = targetBookInit.pile_id
      ? [moveBookInit, targetBookInit]
      : moveBookInit.pile_id
        ? [targetBookInit, moveBookInit]
        : [moveBookInit, targetBookInit];
    pendingWritesRef.current++;
    userBooks
      .stackBooks(moveBook.book_id, targetBook.book_id, existingPileId)
      .then(() => {
        const pileId = existingPileId ?? targetBook.book_id;
        setAllBooks((cur) =>
          cur.map((x) => {
            // Guard against a stale write: if this book's pile_id has
            // already changed since this call was issued (e.g. it was
            // dragged elsewhere and unstacked before this network request
            // resolved), applying this pileId now would silently snap it
            // back into a pile it no longer belongs to.
            if (x.book_id === moveBook.book_id) {
              if (x.pile_id !== moveBook.pile_id) return x;
              return { ...x, pile_id: pileId };
            }
            if (!existingPileId && x.book_id === targetBook.book_id) {
              if (x.pile_id !== targetBook.pile_id) return x;
              return { ...x, pile_id: pileId };
            }
            return x;
          }),
        );
      })
      .catch(() => Alert.alert(t("common.error"), t("library.errors.stackBooks")))
      .finally(() => {
        pendingWritesRef.current--;
      });
  };

  const doUnstack = (book: any) => {
    setAllBooks((cur) =>
      cur.map((x) =>
        x.book_id === book.book_id ? { ...x, pile_id: null } : x,
      ),
    );
    pendingWritesRef.current++;
    userBooks
      .unstackBook(book.book_id)
      .catch(() => Alert.alert(t("common.error"), t("library.errors.unstackBook")))
      .finally(() => {
        pendingWritesRef.current--;
      });
  };

  // Clears a book's forced line break — see toggleShelfBreak.
  const removeShelfBreak = (anchorId: string) => {
    setAllBooks((cur) =>
      cur.map((b) =>
        b.book_id === anchorId ? { ...b, shelf_break_before: false } : b,
      ),
    );
    userBooks
      .setShelfBreak(anchorId, false)
      .catch(() => Alert.alert(t("common.error"), t("library.errors.removeShelf")));
  };

  const toggleShelfGap = (side: "before" | "after") => {
    if (!spacingSelectedId) return;
    const book = allBooks.find((item) => item.book_id === spacingSelectedId);
    if (!book) return;
    const field = side === "before" ? "shelf_gap_before" : "shelf_gap_after";
    const value = !book[field];
    setAllBooks((current) =>
      current.map((item) =>
        item.book_id === book.book_id ? { ...item, [field]: value } : item,
      ),
    );
    userBooks
      .setShelfGap(book.book_id, side, value)
      .catch(() => Alert.alert(t("common.error"), t("library.errors.editSpacing")));
  };

  // Forces the selected book onto its own new shelf row, so it can stand
  // alone instead of packing next to whatever fits before it.
  const toggleShelfBreak = () => {
    if (!spacingSelectedId) return;
    const book = allBooks.find((item) => item.book_id === spacingSelectedId);
    if (!book) return;
    const value = !book.shelf_break_before;
    setAllBooks((current) =>
      current.map((item) =>
        item.book_id === book.book_id
          ? { ...item, shelf_break_before: value }
          : item,
      ),
    );
    userBooks
      .setShelfBreak(book.book_id, value)
      .catch(() => Alert.alert(t("common.error"), t("library.errors.editShelf")));
  };

  // Cycles a spine's tilt: left → right → straight → left. Deliberately
  // only these three explicit states — cycling back through "automatic"
  // (null) used to be one of the stops, but the automatic angle is a hashed
  // guess that isn't necessarily straight, so there was no reliable way to
  // actually get a book standing straight again.
  const cycleTilt = (book: any) => {
    const next = book.manual_tilt === -1 ? 1 : book.manual_tilt === 1 ? 0 : -1;
    setAllBooks((cur) =>
      cur.map((x) =>
        x.book_id === book.book_id ? { ...x, manual_tilt: next } : x,
      ),
    );
    userBooks
      .setManualTilt(book.book_id, next)
      .catch(() =>
        Alert.alert(t("common.error"), t("library.errors.changeTilt")),
      );
  };

  // Same left/right/straight cycle as cycleTilt, for a frame.
  const cycleFrameTilt = (frame: shelfFrames.ShelfFrame) => {
    const next =
      frame.manual_tilt === -1 ? 1 : frame.manual_tilt === 1 ? 0 : -1;
    setAllFrames((cur) =>
      cur.map((f) => (f.id === frame.id ? { ...f, manual_tilt: next } : f)),
    );
    shelfFrames
      .setShelfFrameTilt(frame.id, next)
      .catch(() =>
        Alert.alert(t("common.error"), t("library.errors.changeTilt")),
      );
  };

  // Shared by the live preview and the actual drop: landing in the *center*
  // of another book's measured frame piles the two together; landing in its
  // outer margin (or anywhere else) instead means "next to this book, on
  // whichever side" — that margin is what makes it possible to place a book
  // immediately to the left/right of a pile without merging into it, and
  // for "holes" to open up anywhere in the row rather than only between
  // whole slots.
  // Keep a small edge strip for precise left/right reordering, but make most
  // of a book a valid stacking target so merging two books doesn't require a
  // pixel-perfect drop in its center.
  const STACK_HIT_MARGIN = 0.14;
  // Piles render each member as its own overlapping DraggableShelfBook (for
  // per-book unstack), so testing against individual member frames meant the
  // *whole* footprint of a pile was one big overlapping stack of "center
  // zones" — there was no way to land in the gap just past its left/right
  // edge, since every member's own margin still covered that space. Grouping
  // by pile_id into one union bounding box first, then applying the margin
  // to that single box, is what actually opens up a landing spot beside it.
  type Frame = { x: number; y: number; width: number; height: number };
  // excludeIds covers both the single-book drag (a Set of one) and group
  // drags (a whole pile or a whole shelf row moving together) — those never
  // want to test a hit against one of their own members.
  const resolveShelfDrop = (excludeIds: Set<string>, x: number, y: number) => {
    const frames = shelfFramesRef.current;
    const targets: { id: string; frame: Frame }[] = [];
    const pileBoxes = new Map<string, Frame>();
    const pileRep = new Map<string, string>();
    for (const other of filteredBooks) {
      if (excludeIds.has(other.book_id)) continue;
      const f = frames[other.book_id];
      if (!f) continue;
      if (other.pile_id) {
        if (!pileRep.has(other.pile_id))
          pileRep.set(other.pile_id, other.book_id);
        const box = pileBoxes.get(other.pile_id);
        if (!box) {
          pileBoxes.set(other.pile_id, { ...f });
        } else {
          const x2 = Math.max(box.x + box.width, f.x + f.width);
          const y2 = Math.max(box.y + box.height, f.y + f.height);
          box.x = Math.min(box.x, f.x);
          box.y = Math.min(box.y, f.y);
          box.width = x2 - box.x;
          box.height = y2 - box.y;
        }
      } else {
        targets.push({ id: other.book_id, frame: f });
      }
    }
    for (const [pileId, box] of pileBoxes) {
      const rep = pileRep.get(pileId);
      if (rep) targets.push({ id: rep, frame: box });
    }
    for (const t of targets) {
      const f = t.frame;
      const mx = f.width * STACK_HIT_MARGIN;
      const my = f.height * STACK_HIT_MARGIN;
      if (
        x >= f.x + mx &&
        x <= f.x + f.width - mx &&
        y >= f.y + my &&
        y <= f.y + f.height - my
      ) {
        return { type: "stack" as const, targetId: t.id };
      }
    }
    // Frames are never a stack/merge target (checked above) — only ever an
    // insertion point, so they only join the nearest-neighbor search below.
    const frameTargets: { id: string; frame: Frame }[] = [];
    for (const fr of activeFrames) {
      const key = `frame:${fr.id}`;
      if (excludeIds.has(key)) continue;
      const f = frames[key];
      if (!f) continue;
      frameTargets.push({ id: key, frame: f });
    }
    let nearestId: string | null = null;
    let nearestFrame: Frame | null = null;
    let nearestDist = Infinity;
    for (const t of [...targets, ...frameTargets]) {
      const f = t.frame;
      const dist = Math.hypot(
        x - (f.x + f.width / 2),
        y - (f.y + f.height / 2),
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestId = t.id;
        nearestFrame = f;
      }
    }
    // Empty shelves (see the "+" divider between rows, addShelfBreak) have
    // no books of their own to hit-test against, so they're registered
    // separately under an "empty:<anchorId>" key — any landing inside that
    // whole box fills the shelf, no center-vs-edge distinction needed since
    // there's nothing there to accidentally merge into.
    for (const row of rows) {
      if (row.type !== "empty") continue;
      const f = frames[`empty:${row.anchorId}`];
      if (!f) continue;
      if (x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height) {
        return {
          type: "fill-empty" as const,
          anchorId: row.anchorId,
          frame: f,
        };
      }
    }
    if (!nearestId || !nearestFrame) return null;
    return {
      type: "reorder" as const,
      targetId: nearestId,
      frame: nearestFrame,
      after: x > nearestFrame.x + nearestFrame.width / 2,
    };
  };

  const lastShelfTargetRef = useRef<string | null>(null);
  // Snapshot of a book's neighbor right before a drag starts — the live
  // preview reorders filteredBooks continuously as the drag moves, so by
  // drop time the book's OLD neighbor (needed to hand off shelf_break_before
  // to whichever book is now first in the row the dragged book vacated) can
  // no longer be recovered from filteredBooks itself. See handleShelfDrop's
  // plain-reorder branch.
  const dragOriginRef = useRef<{
    bookId: string;
    nextId: string | null;
    index: number;
  } | null>(null);

  // A frame's `position` IS a raw book-count index, so when the drop target
  // is a frame (id prefixed "frame:"), that number already tells us where
  // to insert within a flat book-id array — no `indexOf` needed (the frame
  // isn't in that array at all).
  // `fullIds` is the id list BEFORE the dragged book/group was spliced out —
  // a frame's `position` is a raw count against that original list, so if
  // any of the removed ids used to sit before the frame, the raw count now
  // overshoots by that many slots against the already-shrunk `bookIds`.
  // Defaults to `bookIds` itself for callers that never remove anything
  // (dragging a frame doesn't remove a book from the list).
  const resolveTargetBookIndex = (
    targetId: string,
    bookIds: string[],
    fullIds: string[] = bookIds,
  ) => {
    if (targetId.startsWith("frame:")) {
      const targetFrame = activeFrames.find(
        (f) => `frame:${f.id}` === targetId,
      );
      if (!targetFrame) return bookIds.length;
      const removedBefore = fullIds
        .slice(0, targetFrame.position)
        .filter((id) => !bookIds.includes(id)).length;
      return targetFrame.position - removedBefore;
    }
    const idx = bookIds.indexOf(targetId);
    return idx === -1 ? bookIds.length : idx;
  };

  // "Nouvelle ligne" (shelf_break_before) forces one specific book to always
  // start a fresh row — but if it stayed pinned to that exact book forever,
  // nothing could ever land to its left again (any book/frame dropped there
  // would keep getting bumped back to the previous row, since the flagged
  // book would still force its own break right after it). Transferring the
  // flag onto whichever book is now actually first at that spot keeps the
  // row boundary in place while unblocking insertion to the left. Frames/
  // plants can't carry the flag themselves (they're not part of this
  // book-only break system — see buildRows), so a break just clears when
  // one lands there instead of moving.
  const transferShelfBreak = (
    nextBookId: string | undefined,
    newFirstId: string,
  ) => {
    if (!nextBookId) return;
    const nextBook = filteredBooks.find((b) => b.book_id === nextBookId);
    if (!nextBook?.shelf_break_before || nextBookId === newFirstId) return;
    setAllBooks((cur) =>
      cur.map((b) => {
        if (b.book_id === nextBookId)
          return { ...b, shelf_break_before: false };
        if (b.book_id === newFirstId && !newFirstId.startsWith("frame:"))
          return { ...b, shelf_break_before: true };
        return b;
      }),
    );
    userBooks
      .setShelfBreak(nextBookId, false)
      .catch(() => Alert.alert(t("common.error"), t("library.errors.moveShelf")));
    if (!newFirstId.startsWith("frame:")) {
      userBooks
        .setShelfBreak(newFirstId, true)
        .catch(() => Alert.alert(t("common.error"), t("library.errors.moveShelf")));
    }
  };

  // Live preview while still dragging: re-sorts the underlying list (local
  // state only, nothing persisted yet) every time the drop target actually
  // changes, so the other books visibly shift out of the way *before* the
  // book is dropped — same idea as the grid's live preview, adapted to
  // shelf's non-uniform tiles via the real measured frames instead of cell
  // math. The dragged tile itself just follows the raw finger position (no
  // compensation trick) rather than trying to visually anchor itself to the
  // reflow — that compensation math turned out to only work reliably in one
  // drag direction.
  const handleShelfDragUpdate = (bookId: string, x: number, y: number) => {
    const resolved = resolveShelfDrop(new Set([bookId]), x, y);
    if (!resolved) {
      setStackTargetId(null);
      return;
    }
    if (resolved.type === "stack") {
      if (resolved.targetId !== stackTargetId)
        setStackTargetId(resolved.targetId);
      return;
    }
    if (stackTargetId) setStackTargetId(null);
    const targetId =
      resolved.type === "fill-empty" ? resolved.anchorId : resolved.targetId;
    if (targetId === lastShelfTargetRef.current) return;
    lastShelfTargetRef.current = targetId;
    const fullIds = filteredBooks.map((b) => b.book_id);
    const ids = fullIds.slice();
    const currentIndex = ids.indexOf(bookId);
    if (currentIndex === -1) return;
    ids.splice(currentIndex, 1);
    let targetIndex = resolveTargetBookIndex(targetId, ids, fullIds);
    if (resolved.type === "reorder" && resolved.after) targetIndex += 1;
    targetIndex = Math.max(0, Math.min(ids.length, targetIndex));
    ids.splice(targetIndex, 0, bookId);
    const posById = new Map(ids.map((id, i) => [id, i]));
    setAllBooks((cur) =>
      cur.map((b) =>
        b.status === activeTab
          ? { ...b, shelf_position: posById.get(b.book_id) ?? b.shelf_position }
          : b,
      ),
    );
  };

  // The live preview above already left the list in the right order — this
  // only needs to check "did it actually land ON a book" for piling (that's
  // deliberately not previewed live, only decided at the moment of drop),
  // whether it landed in an empty shelf (which transfers the shelf_break
  // flag from the old anchor onto the dropped book, since it's the one
  // starting that row now), and otherwise just persists whatever order is
  // already showing.
  const handleShelfDrop = (bookId: string, x: number, y: number) => {
    stopAutoScroll();
    stopDragRemeasure();
    lastShelfTargetRef.current = null;
    setStackTargetId(null);
    const dragged = filteredBooks.find((b) => b.book_id === bookId);
    if (!dragged) return;
    const resolved = resolveShelfDrop(new Set([bookId]), x, y);
    if (resolved?.type === "stack") {
      // Reject before touching anything if the target pile is already at
      // capacity — doStack (below) rejects too, but only after the reorder/
      // persist below already ran, which used to leave the book visibly and
      // permanently moved next to a pile it never actually joined.
      const targetBook = filteredBooks.find(
        (b) => b.book_id === resolved.targetId,
      );
      const existingPileId = targetBook?.pile_id ?? dragged.pile_id ?? null;
      if (existingPileId) {
        const pileSize = filteredBooks.filter(
          (b) => b.pile_id === existingPileId,
        ).length;
        if (pileSize >= STACK_SIZE) {
          Alert.alert(
            t("library.pileFull"),
            t("library.pileFullMessage", { count: STACK_SIZE }),
          );
          return;
        }
      }
      // Move the dragged book beside its target first. This makes the newly
      // created pile appear where it was dropped (rather than back at the
      // book's old location) and saves that order at the same time.
      const ids = filteredBooks.map((b) => b.book_id);
      const currentIndex = ids.indexOf(bookId);
      ids.splice(currentIndex, 1);
      ids.splice(ids.indexOf(resolved.targetId), 0, bookId);
      setAllBooks((current) =>
        current.map((book) =>
          book.status === activeTab
            ? { ...book, shelf_position: ids.indexOf(book.book_id) }
            : book,
        ),
      );
      persistOrder(ids);
      doStack(bookId, resolved.targetId);
      return;
    }
    const ids = filteredBooks.map((b) => b.book_id);
    if (resolved?.type === "fill-empty") {
      const currentIndex = ids.indexOf(bookId);
      ids.splice(currentIndex, 1);
      ids.splice(ids.indexOf(resolved.anchorId), 0, bookId);
      setAllBooks((cur) =>
        cur.map((b) => {
          if (b.book_id === resolved.anchorId)
            return { ...b, shelf_break_before: false };
          if (b.book_id === bookId) return { ...b, shelf_break_before: true };
          return b;
        }),
      );
      userBooks
        .setShelfBreak(resolved.anchorId, false)
        .catch(() => Alert.alert(t("common.error"), t("library.errors.moveShelf")));
      userBooks
        .setShelfBreak(bookId, true)
        .catch(() => Alert.alert(t("common.error"), t("library.errors.moveShelf")));
    } else {
      const idx = ids.indexOf(bookId);
      transferShelfBreak(ids[idx + 1], bookId);
      // The book's own drag may also have vacated a row-starting spot it
      // used to force via shelf_break_before — hand that off to whichever
      // book is now first there, using the pre-drag neighbor snapshotted at
      // drag-start (filteredBooks has already been reordered by now, so its
      // current neighbor is the NEW one, not the vacated one).
      const origin = dragOriginRef.current;
      if (
        origin &&
        origin.bookId === bookId &&
        origin.nextId &&
        idx !== origin.index
      ) {
        transferShelfBreak(bookId, origin.nextId);
      }
    }
    dragOriginRef.current = null;
    persistOrder(ids);
    if (dragged.pile_id) doUnstack(dragged);
  };

  // Moving a whole block (a pile via its grip handle, or an entire shelf row
  // via the row's grip handle) at once: same hit-testing as a single book,
  // just excluding every id already in the group and re-inserting the whole
  // group as one contiguous run instead of a single id. Deliberately never
  // merges into another pile on drop (that's a lot of extra edge cases for
  // a block move) — landing on a pile just reorders the block next to it.
  const handleGroupDragUpdate = (groupIds: string[], x: number, y: number) => {
    const excludeSet = new Set(groupIds);
    const resolved = resolveShelfDrop(excludeSet, x, y);
    if (!resolved) return;
    const targetId =
      resolved.type === "fill-empty" ? resolved.anchorId : resolved.targetId;
    if (targetId === lastShelfTargetRef.current) return;
    lastShelfTargetRef.current = targetId;
    const ids = filteredBooks.map((b) => b.book_id);
    const remaining = ids.filter((id) => !excludeSet.has(id));
    let targetIndex = resolveTargetBookIndex(targetId, remaining, ids);
    if (resolved.type === "reorder" && resolved.after) targetIndex += 1;
    else if (resolved.type === "stack") {
      // "stack" carries no left/right info by itself — approximate it from
      // the target pile/book's own bounding box the same way "reorder" does,
      // so dropping on the right half of a pile doesn't always insert the
      // group immediately before it regardless of which side was dropped on.
      const f = shelfFramesRef.current[resolved.targetId];
      if (f && x > f.x + f.width / 2) targetIndex += 1;
    }
    targetIndex = Math.max(0, Math.min(remaining.length, targetIndex));
    remaining.splice(targetIndex, 0, ...groupIds);
    const posById = new Map(remaining.map((id, i) => [id, i]));
    setAllBooks((cur) =>
      cur.map((b) =>
        b.status === activeTab
          ? { ...b, shelf_position: posById.get(b.book_id) ?? b.shelf_position }
          : b,
      ),
    );
  };

  const handleGroupDrop = (groupIds: string[], _x: number, _y: number) => {
    stopAutoScroll();
    stopDragRemeasure();
    lastShelfTargetRef.current = null;
    const ids = filteredBooks.map((b) => b.book_id);
    const lastIdx = ids.indexOf(groupIds[groupIds.length - 1]);
    transferShelfBreak(ids[lastIdx + 1], groupIds[0]);
    persistOrder(ids);
  };

  // A frame drags exactly like a single book — same resolveShelfDrop
  // hit-testing — except what moves is its `position` (a book-count index)
  // in local allFrames state, not a book's shelf_position.
  const handleFrameDragUpdate = (frameKey: string, x: number, y: number) => {
    const frameId = frameKey.slice("frame:".length);
    const resolved = resolveShelfDrop(new Set([frameKey]), x, y);
    if (!resolved) return;
    const targetId =
      resolved.type === "fill-empty" ? resolved.anchorId : resolved.targetId;
    if (targetId === lastShelfTargetRef.current) return;
    lastShelfTargetRef.current = targetId;
    const ids = filteredBooks.map((b) => b.book_id);
    let position = resolveTargetBookIndex(targetId, ids);
    if (resolved.type === "reorder" && resolved.after) position += 1;
    position = Math.max(0, Math.min(ids.length, position));
    // The not-yet-created ghost isn't in allFrames — its tentative position
    // lives in framePlacement instead.
    if (frameId === "__ghost__") {
      setFramePlacement((cur) => cur && { ...cur, position });
    } else {
      setAllFrames((cur) =>
        cur.map((f) => (f.id === frameId ? { ...f, position } : f)),
      );
    }
  };

  const handleFrameDrop = (frameKey: string, _x: number, _y: number) => {
    stopAutoScroll();
    stopDragRemeasure();
    lastShelfTargetRef.current = null;
    const frameId = frameKey.slice("frame:".length);
    // Dropping the ghost places it right away (empty) — see placeFrame.
    if (frameId === "__ghost__") {
      if (framePlacement) placeFrame(framePlacement.position, "frame");
      return;
    }
    const frame = allFrames.find((f) => f.id === frameId);
    if (!frame) return;
    transferShelfBreak(filteredBooks[frame.position]?.book_id, frameKey);
    shelfFrames
      .setShelfFramePosition(frameId, frame.position)
      .catch(() => Alert.alert(t("common.error"), t("library.errors.moveFrame")));
  };

  // Free drag-and-drop for the grid view: converts how far the book moved
  // (from where the drag *started*, cumulative — not incremental) into a
  // row/column delta, then a target index, and re-sorts every time that
  // target changes — live, while still dragging, so the other tiles visibly
  // shift out of the way before the book is actually dropped. Persisting to
  // the DB only happens once, on release (handleGridDrop below); this just
  // updates local state so it's cheap to call on every threshold crossing.
  // Always re-finds the dragged book by id (not by trusting fromIndex as a
  // *current* array position) since it may already have moved from earlier
  // calls in the same drag.
  const handleGridDragMove = (
    bookId: string,
    fromIndex: number,
    deltaCols: number,
    deltaRows: number,
  ) => {
    const ids = filteredBooks.map((b) => b.book_id);
    const targetIndex = Math.max(
      0,
      Math.min(ids.length - 1, fromIndex + deltaRows * gridColumns + deltaCols),
    );
    const currentIndex = ids.indexOf(bookId);
    if (currentIndex === -1 || currentIndex === targetIndex) return;
    ids.splice(currentIndex, 1);
    ids.splice(targetIndex, 0, bookId);
    const posById = new Map(ids.map((id, i) => [id, i]));
    setAllBooks((cur) =>
      cur.map((b) =>
        b.status === activeTab
          ? { ...b, shelf_position: posById.get(b.book_id) ?? b.shelf_position }
          : b,
      ),
    );
  };

  // The live preview above already left allBooks/filteredBooks in the
  // correct final order — this just writes it to the DB once, on release.
  const handleGridDrop = () => {
    stopAutoScroll();
    const ids = filteredBooks.map((b) => b.book_id);
    userBooks
      .saveShelfOrder(ids)
      .catch(() => Alert.alert(t("common.error"), t("library.errors.saveOrder")));
  };

  // Tapping a spine/stack bar "picks up" that book into a centered card,
  // like lifting it off the shelf to look at it in your hands; tapping the
  // lifted cover itself is what opens the detail page — one tap to pick it
  // up, a second to actually open it. Only reachable outside reorder mode —
  // shelf reorder mode renders its own drag-only variant (see below) instead
  // of going through this at all.
  const onSlotPress = (book: any) => {
    if (poppedBook?.book_id === book.book_id)
      router.push(`/book/${book.book_id}`);
    else setPoppedBook(book);
  };

  // Just the visual — no touch handling of its own. Normal browsing wraps
  // this in a TouchableOpacity (renderSpine, below); reorder mode instead
  // wraps it in DraggableShelfBook's GestureDetector, which needs to be the
  // only thing handling touches on that tile, not a second nested handler.
  const renderSpineVisual = (
    book: any,
    gapBefore = false,
    gapAfter = false,
  ) => {
    const tilt = spineTilt(book);
    return (
      <View
        style={[
          styles.spineWrap,
          gapBefore && { marginLeft: SHELF_GAP_SIZE },
          gapAfter && { marginRight: SHELF_GAP_SIZE },
          tilt !== 0 && { marginHorizontal: SPINE_TILT_MARGIN },
          { transform: [{ rotate: `${tilt}deg` }] },
          poppedBook?.book_id === book.book_id && styles.slotLifted,
        ]}
      >
        {reorderMode && spacingSelectedId === book.book_id ? (
          <View style={styles.spacingBookActions}>
            <TouchableOpacity
              style={styles.spacingBookActionBtn}
              onPress={() => toggleShelfGap("before")}
            >
              <Feather name="chevron-left" size={14} color="#FFFFFF" />
              <Text style={styles.spacingBookActionText}>{t("library.spacingLeft")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.spacingBookActionBtn}
              onPress={() => toggleShelfGap("after")}
            >
              <Text style={styles.spacingBookActionText}>{t("library.spacingRight")}</Text>
              <Feather name="chevron-right" size={14} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.spacingBookActionBtn,
                book.shelf_break_before && styles.spacingBookActionBtnActive,
              ]}
              onPress={toggleShelfBreak}
            >
              <Feather name="corner-down-left" size={14} color="#FFFFFF" />
              <Text style={styles.spacingBookActionText}>{t("library.spacingNewLine")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View
          style={[
            styles.spine,
            { backgroundColor: colors.card2 },
            reorderMode &&
              stackTargetId === book.book_id &&
              styles.slotStackTarget,
            reorderMode &&
              spacingSelectedId === book.book_id &&
              styles.slotStackTarget,
          ]}
        >
          <CoverSliver
            uri={book.cover_url}
            width={SPINE_WIDTH}
            height={SPINE_HEIGHT}
          />
          {reorderMode ? (
            <TouchableOpacity
              style={styles.tiltBtn}
              hitSlop={8}
              onPress={() => cycleTilt(book)}
            >
              <Feather name="rotate-cw" size={11} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
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
      </View>
    );
  };

  const renderSpine = (book: any, gapBefore = false, gapAfter = false) => (
    <TouchableOpacity
      key={book.book_id}
      activeOpacity={0.8}
      onPress={() => onSlotPress(book)}
    >
      {renderSpineVisual(book, gapBefore, gapAfter)}
    </TouchableOpacity>
  );

  const renderStack = (books: any[], gapBefore = false, gapAfter = false) => (
    <View
      key={books.map((b) => b.book_id).join("-")}
      style={[
        styles.stackWrap,
        gapBefore && { marginLeft: SHELF_GAP_SIZE },
        gapAfter && { marginRight: SHELF_GAP_SIZE },
      ]}
    >
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
        <Text style={styles.title}>{t("library.title")}</Text>
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
              accessibilityLabel={t("library.viewShelf")}
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
              accessibilityLabel={t("library.viewGrid")}
            >
              <Feather
                name="grid"
                size={14}
                color={viewMode === "grid" ? colors.purple : colors.gray}
              />
            </TouchableOpacity>
          </View>
          {!(viewMode === "shelf" && !roomZoomed) && (
            <>
              <TouchableOpacity
                onPress={() => setShowSortSheet(true)}
                hitSlop={6}
              >
                <Feather
                  name="sliders"
                  size={17}
                  color={
                    sortOrder === "manual" && ownedFilter === "all"
                      ? colors.gray
                      : colors.purple
                  }
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const nextReorderMode = !reorderMode;
                  setReorderMode(nextReorderMode);
                  // Manual positioning needs the actual saved order. A date
                  // sort would immediately re-sort the books after every drop
                  // and make a successful drag look like it had been ignored.
                  if (nextReorderMode) {
                    setSortOrder("manual");
                    AsyncStorage.getItem(EDIT_TUTORIAL_SEEN_KEY).then(
                      (seen) => {
                        if (seen) return;
                        setShowEditTutorial(true);
                        AsyncStorage.setItem(EDIT_TUTORIAL_SEEN_KEY, "1");
                      },
                    );
                  }
                  setReorderSelectedId(null);
                  setSpacingSelectedId(null);
                  setPoppedBook(null);
                }}
                hitSlop={6}
                accessibilityLabel={t("library.editModeTitle")}
                style={[
                  styles.editToggle,
                  reorderMode && {
                    backgroundColor: colors.purpleGlow,
                  },
                ]}
              >
                <Feather
                  name="edit-2"
                  size={17}
                  color={reorderMode ? colors.purple : colors.gray}
                />
              </TouchableOpacity>
            </>
          )}
          <NotificationBell />
        </View>
      </View>

      {reorderMode && (
        <View style={styles.reorderBanner}>
          <Feather name="edit-2" size={13} color={colors.purple} />
          <Text style={styles.reorderBannerText}>
            {viewMode === "grid"
              ? t("library.gridDragHint")
              : t("library.shelfDragHint")}
          </Text>
          <TouchableOpacity
            onPress={() => setShowEditTutorial(true)}
            hitSlop={8}
          >
            <Feather name="help-circle" size={15} color={colors.purple} />
          </TouchableOpacity>
        </View>
      )}

      {framePlacement && (
        <View style={styles.reorderBanner}>
          <Feather name="image" size={13} color={colors.purple} />
          <Text style={styles.reorderBannerText}>
            {t("library.frameDragHint")}
          </Text>
          <TouchableOpacity onPress={() => setFramePlacement(null)}>
            <Text style={styles.reorderBannerCancel}>{t("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {viewMode === "shelf" && !roomZoomed ? (
        <RoomView
          colors={colors}
          styles={styles}
          onOpenShelf={(status) => {
            setActiveTab(status);
            setRoomZoomed(true);
          }}
        />
      ) : (
        <>
          {viewMode === "shelf" && roomZoomed && (
            <View style={styles.roomBackRow}>
              {/* Hidden in reorder mode — that mode already needs all the
                  vertical room it can get (see toolbarHidden above), and the
                  edit toggle itself remains available to exit reorder mode. */}
              {!reorderMode && (
                <TouchableOpacity
                  style={styles.backToRoomBtn}
                  onPress={() => {
                    setRoomZoomed(false);
                    setShowScrollTop(false);
                  }}
                >
                  <Feather name="arrow-left" size={14} color={colors.white} />
                  <Text style={styles.backToRoomText}>{t("library.backToRoom")}</Text>
                </TouchableOpacity>
              )}
              {reorderMode && !framePlacement ? (
                <View style={styles.addDecorRow}>
                  <Text style={styles.decorCounter}>
                    {allFrames.length}/{decorationsUnlocked}
                  </Text>
                  <TouchableOpacity
                    style={styles.addFrameBtn}
                    onPress={addPlantDirectly}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons
                      name="flower-tulip"
                      size={17}
                      color={colors.gray}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.addFrameBtn}
                    onPress={addClockDirectly}
                    hitSlop={6}
                  >
                    <Feather name="clock" size={17} color={colors.gray} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.addFrameBtn}
                    onPress={addCandleDirectly}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons
                      name="candle"
                      size={17}
                      color={colors.gray}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.addFrameBtn}
                    onPress={beginFramePlacement}
                    hitSlop={6}
                  >
                    <Feather name="image" size={17} color={colors.gray} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          )}

          {!toolbarCollapsed && (
            <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutUp.duration(150)}>
              <View style={styles.searchBar}>
                <Feather name="search" size={17} color={colors.gray} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t("library.searchPlaceholder")}
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
                    label={`${t(tab.labelKey)}${counts[tab.value] ? ` · ${counts[tab.value]}` : ""}`}
                  />
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {loading ? (
            <Text style={styles.emptyText}>{t("feed.loading")}</Text>
          ) : filteredBooks.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather
                name={q ? "search" : "book-open"}
                size={36}
                color={colors.gray}
              />
              <Text style={styles.emptyText}>
                {q ? t("library.noResultsFor", { query }) : t("library.noBooksHere")}
              </Text>
            </View>
          ) : viewMode === "grid" && reorderMode ? (
            // Reorder mode's grid: not virtualized (every tile has to be mounted
            // at once for drag-and-drop to work), so this trades the FlatList's
            // windowing for real free-drag placement — acceptable since reorder
            // mode is a short, deliberate editing session, not everyday
            // browsing (which still gets the fast virtualized grid below).
            <ScrollView
              ref={reorderScrollRef}
              style={styles.scroll}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                setShowScrollTop(e.nativeEvent.contentOffset.y > 400);
                handleToolbarScroll(e.nativeEvent.contentOffset.y);
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: GRID_GAP,
                  justifyContent: "center",
                }}
              >
                {filteredBooks.map((book, index) => (
                  <DraggableGridBook
                    key={book.book_id}
                    index={index}
                    columns={gridColumns}
                    cellWidth={COVER_WIDTH + GRID_GAP}
                    cellHeight={GRID_CELL_HEIGHT + GRID_GAP}
                    disabled={false}
                    onDragMove={(fromIndex, deltaCols, deltaRows) =>
                      handleGridDragMove(
                        book.book_id,
                        fromIndex,
                        deltaCols,
                        deltaRows,
                      )
                    }
                    onDragUpdateY={handleDragAutoScroll}
                    onDrop={handleGridDrop}
                    onDragEnd={endDrag}
                    onTap={() => swapBooks(book)}
                    edgeZoneTop={EDGE_ZONE}
                    edgeZoneBottom={height - EDGE_ZONE}
                  >
                    <View style={styles.gridSlot}>
                      <View
                        style={[
                          styles.gridCover,
                          reorderSelectedId === book.book_id &&
                            styles.slotSelected,
                        ]}
                      >
                        {book.cover_url ? (
                          <Image
                            source={{ uri: book.cover_url }}
                            style={styles.bookCoverImg}
                          />
                        ) : (
                          <View style={styles.bookCoverFallback}>
                            <Feather
                              name="book"
                              size={22}
                              color={colors.purple}
                            />
                            <Text
                              style={styles.bookCoverFallbackTitle}
                              numberOfLines={3}
                            >
                              {book.title}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.gridTitle} numberOfLines={1}>
                        {book.title}
                      </Text>
                      <Text style={styles.gridAuthor} numberOfLines={1}>
                        {book.author}
                      </Text>
                    </View>
                  </DraggableGridBook>
                ))}
              </View>
            </ScrollView>
          ) : viewMode === "grid" ? (
            // Plain even-column grid of covers — the previous default look, for
            // anyone who'd rather just scan covers than browse a shelf.
            <FlatList
              key={`grid-${gridColumns}`}
              ref={listRef}
              data={filteredBooks}
              keyExtractor={(book) => book.book_id}
              numColumns={gridColumns}
              style={[styles.scroll, restoringScroll && { opacity: 0 }]}
              contentContainerStyle={{ paddingBottom: 20 }}
              columnWrapperStyle={{
                gap: GRID_GAP,
                marginBottom: 20,
                justifyContent: "center",
              }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                setShowScrollTop(e.nativeEvent.contentOffset.y > 400);
                handleToolbarScroll(e.nativeEvent.contentOffset.y);
              }}
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
                    onPress={() =>
                      reorderMode
                        ? swapBooks(book)
                        : router.push(`/book/${book.book_id}`)
                    }
                  >
                    <View
                      style={[
                        styles.gridCover,
                        reorderSelectedId === book.book_id &&
                          styles.slotSelected,
                      ]}
                    >
                      {book.cover_url ? (
                        <Image
                          source={{ uri: book.cover_url }}
                          style={styles.bookCoverImg}
                        />
                      ) : (
                        <View style={styles.bookCoverFallback}>
                          <Feather
                            name="book"
                            size={22}
                            color={colors.purple}
                          />
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
                        <Feather
                          name="more-horizontal"
                          size={13}
                          color="#FFFFFF"
                        />
                      </TouchableOpacity>
                      {book.rating ? (
                        <View style={styles.ratingBadge}>
                          <Text style={styles.ratingBadgeText}>
                            {book.rating}★
                          </Text>
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
          ) : reorderMode ? (
            // Shelf reorder mode: still the real shelf look (spines, stacks,
            // tilt — all through the same buildRows/renderSpine/renderStack as
            // normal browsing), just not virtualized, so drag-and-drop can
            // measure and target every tile at once. Drop a book on another to
            // pile them; drop it elsewhere to reorder — see handleShelfDrop.
            <ScrollView
              ref={reorderScrollRef}
              style={styles.scroll}
              // Extra top padding, reserved only while it's actually needed
              // — the spacing popup (Gauche/Droite/Nouvelle ligne) floats
              // above the selected book, and the shelf's first row has no
              // room above it for that.
              contentContainerStyle={{
                paddingTop: spacingSelectedInFirstRow ? 120 : 0,
                paddingBottom: 20,
              }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                setShowScrollTop(e.nativeEvent.contentOffset.y > 400);
                handleToolbarScroll(e.nativeEvent.contentOffset.y);
              }}
            >
              {rows.map((row, index) => (
                <View key={index}>
                  {row.type === "empty" ? (
                    <View
                      ref={(node: any) =>
                        registerShelfRef(`empty:${row.anchorId}`, node)
                      }
                      style={[
                        styles.shelf,
                        styles.emptyShelf,
                        {
                          borderBottomColor: colors.teal,
                          shadowColor: colors.teal,
                        },
                      ]}
                    >
                      <Text style={styles.emptyShelfText}>{t("library.emptyShelf")}</Text>
                      <TouchableOpacity
                        style={styles.emptyShelfRemove}
                        hitSlop={8}
                        onPress={() => removeShelfBreak(row.anchorId)}
                      >
                        <Feather name="x" size={13} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      <View
                        style={[
                          styles.shelf,
                          {
                            borderBottomColor: colors.teal,
                            shadowColor: colors.teal,
                          },
                        ]}
                      >
                        {row.slots.map((slot) =>
                          slot.type === "spine" ? (
                            <DraggableShelfBook
                              key={slot.book.book_id}
                              bookId={slot.book.book_id}
                              disabled={false}
                              registerRef={registerShelfRef}
                              onDragStart={() => {
                                lastShelfTargetRef.current = null;
                                setStackTargetId(null);
                                remeasureShelfFrames();
                                startDragRemeasure();
                                const ids0 = filteredBooks.map(
                                  (b) => b.book_id,
                                );
                                const i0 = ids0.indexOf(slot.book.book_id);
                                dragOriginRef.current =
                                  i0 === -1
                                    ? null
                                    : {
                                        bookId: slot.book.book_id,
                                        nextId: ids0[i0 + 1] ?? null,
                                        index: i0,
                                      };
                              }}
                              onDragUpdateY={handleDragAutoScroll}
                              onDragUpdate={handleShelfDragUpdate}
                              onDrop={handleShelfDrop}
                              onDragEnd={endDrag}
                              edgeZoneTop={EDGE_ZONE}
                              edgeZoneBottom={height - EDGE_ZONE}
                              onTap={() =>
                                setSpacingSelectedId((current) =>
                                  current === slot.book.book_id
                                    ? null
                                    : slot.book.book_id,
                                )
                              }
                              style={[
                                slot.gapBefore && {
                                  marginLeft: SHELF_GAP_SIZE,
                                },
                                slot.gapAfter && {
                                  marginRight: SHELF_GAP_SIZE,
                                },
                              ]}
                            >
                              {renderSpineVisual(slot.book)}
                            </DraggableShelfBook>
                          ) : slot.type === "frame" ? (
                            <DraggableShelfBook
                              key={`frame:${slot.frame.id}`}
                              bookId={`frame:${slot.frame.id}`}
                              disabled={false}
                              registerRef={registerShelfRef}
                              onDragStart={() => {
                                lastShelfTargetRef.current = null;
                                setStackTargetId(null);
                                remeasureShelfFrames();
                                startDragRemeasure();
                              }}
                              onDragUpdateY={handleDragAutoScroll}
                              onDragUpdate={handleFrameDragUpdate}
                              onDrop={handleFrameDrop}
                              onDragEnd={endDrag}
                              edgeZoneTop={EDGE_ZONE}
                              edgeZoneBottom={height - EDGE_ZONE}
                            >
                              {renderFrameSlot(slot.frame)}
                            </DraggableShelfBook>
                          ) : (
                            <View
                              key={slot.books.map((b) => b.book_id).join("-")}
                              style={[
                                slot.gapBefore && {
                                  marginLeft: SHELF_GAP_SIZE,
                                },
                                slot.gapAfter && {
                                  marginRight: SHELF_GAP_SIZE,
                                },
                              ]}
                            >
                              <DraggableHandle
                                groupIds={slot.books.map((b) => b.book_id)}
                                onDragStart={() => {
                                  lastShelfTargetRef.current = null;
                                  remeasureShelfFrames();
                                  startDragRemeasure();
                                }}
                                onDragUpdateY={handleDragAutoScroll}
                                onDragUpdate={handleGroupDragUpdate}
                                onDrop={handleGroupDrop}
                                onDragEnd={endDrag}
                                edgeZoneTop={EDGE_ZONE}
                                edgeZoneBottom={height - EDGE_ZONE}
                              >
                                <View style={styles.pileGrip}>
                                  <Feather
                                    name="menu"
                                    size={12}
                                    color="#FFFFFF"
                                  />
                                  <Text style={styles.pileGripText}>
                                    Déplacer la pile
                                  </Text>
                                </View>
                              </DraggableHandle>
                              <View style={styles.stackWrap}>
                                {spacingSelectedId === slot.books[0].book_id ? (
                                  <View style={styles.stackSpacingBookActions}>
                                    <TouchableOpacity
                                      style={styles.spacingBookActionBtn}
                                      onPress={() => toggleShelfGap("before")}
                                    >
                                      <Feather
                                        name="chevron-left"
                                        size={14}
                                        color="#FFFFFF"
                                      />
                                      <Text
                                        style={styles.spacingBookActionText}
                                      >
                                        Gauche
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.spacingBookActionBtn}
                                      onPress={() => toggleShelfGap("after")}
                                    >
                                      <Text
                                        style={styles.spacingBookActionText}
                                      >
                                        Droite
                                      </Text>
                                      <Feather
                                        name="chevron-right"
                                        size={14}
                                        color="#FFFFFF"
                                      />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[
                                        styles.spacingBookActionBtn,
                                        slot.books[0].shelf_break_before &&
                                          styles.spacingBookActionBtnActive,
                                      ]}
                                      onPress={toggleShelfBreak}
                                    >
                                      <Feather
                                        name="corner-down-left"
                                        size={14}
                                        color="#FFFFFF"
                                      />
                                      <Text
                                        style={styles.spacingBookActionText}
                                      >
                                        Nouvelle ligne
                                      </Text>
                                    </TouchableOpacity>
                                  </View>
                                ) : null}
                                {slot.books.map((book, i) => (
                                  <DraggableShelfBook
                                    key={book.book_id}
                                    bookId={book.book_id}
                                    disabled={false}
                                    registerRef={registerShelfRef}
                                    onDragStart={() => {
                                      lastShelfTargetRef.current = null;
                                      setStackTargetId(null);
                                      remeasureShelfFrames();
                                      startDragRemeasure();
                                    }}
                                    onDragUpdateY={handleDragAutoScroll}
                                    onDragUpdate={handleShelfDragUpdate}
                                    onDrop={handleShelfDrop}
                                    onDragEnd={endDrag}
                                    edgeZoneTop={EDGE_ZONE}
                                    edgeZoneBottom={height - EDGE_ZONE}
                                    onTap={() =>
                                      setSpacingSelectedId((current) =>
                                        current === slot.books[0].book_id
                                          ? null
                                          : slot.books[0].book_id,
                                      )
                                    }
                                  >
                                    <View
                                      style={[
                                        styles.stackBar,
                                        {
                                          backgroundColor: colors.card2,
                                          zIndex: slot.books.length - i,
                                        },
                                        stackTargetId ===
                                          slot.books[0].book_id &&
                                          styles.slotStackTarget,
                                        i === 0 &&
                                          spacingSelectedId ===
                                            slot.books[0].book_id &&
                                          styles.slotStackTarget,
                                      ]}
                                    >
                                      <CoverSliver
                                        uri={book.cover_url}
                                        width={STACK_WIDTH}
                                        height={STACK_BAR_HEIGHT}
                                        horizontal
                                      />
                                      <View style={styles.stackTextBox}>
                                        <Text
                                          style={styles.stackTitle}
                                          numberOfLines={1}
                                        >
                                          {book.title}
                                        </Text>
                                        {book.author ? (
                                          <Text
                                            style={styles.stackAuthor}
                                            numberOfLines={1}
                                          >
                                            {book.author}
                                          </Text>
                                        ) : null}
                                      </View>
                                      {book.pile_id ? (
                                        <TouchableOpacity
                                          style={styles.unstackBtn}
                                          hitSlop={8}
                                          onPress={() => doUnstack(book)}
                                        >
                                          <Feather
                                            name="x"
                                            size={12}
                                            color="#FFFFFF"
                                          />
                                        </TouchableOpacity>
                                      ) : null}
                                    </View>
                                  </DraggableShelfBook>
                                ))}
                              </View>
                            </View>
                          ),
                        )}
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          ) : (
            // Rows (not individual books) are what's virtualized here — with up
            // to a few hundred books, rendering every shelf at once is what made
            // this screen janky, so a FlatList only mounts rows near the
            // viewport and recycles cells as you scroll.
            <FlatList
              ref={listRef}
              data={rows}
              keyExtractor={(_, i) => String(i)}
              style={[styles.scroll, restoringScroll && { opacity: 0 }]}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                setShowScrollTop(e.nativeEvent.contentOffset.y > 400);
                handleToolbarScroll(e.nativeEvent.contentOffset.y);
              }}
              initialNumToRender={4}
              windowSize={7}
              removeClippedSubviews={Platform.OS !== "web"}
              renderItem={({ item: row, index }) =>
                row.type === "empty" ? (
                  <Animated.View
                    entering={FadeInDown.duration(280).delay(
                      Math.min(index, 6) * 40,
                    )}
                    style={[
                      styles.shelf,
                      styles.emptyShelf,
                      {
                        borderBottomColor: colors.teal,
                        shadowColor: colors.teal,
                      },
                    ]}
                  >
                    <Text style={styles.emptyShelfText}>{t("library.emptyShelf")}</Text>
                  </Animated.View>
                ) : (
                  <Animated.View
                    entering={FadeInDown.duration(280).delay(
                      Math.min(index, 6) * 40,
                    )}
                    style={[
                      styles.shelf,
                      {
                        borderBottomColor: colors.teal,
                        shadowColor: colors.teal,
                      },
                    ]}
                  >
                    {row.slots.map((slot: Slot) =>
                      slot.type === "spine"
                        ? renderSpine(slot.book, slot.gapBefore, slot.gapAfter)
                        : slot.type === "frame"
                          ? renderFrameSlot(slot.frame)
                          : renderStack(
                              slot.books,
                              slot.gapBefore,
                              slot.gapAfter,
                            ),
                    )}
                  </Animated.View>
                )
              }
            />
          )}
        </>
      )}

      {showScrollTop && !(viewMode === "shelf" && !roomZoomed) && (
        <TouchableOpacity
          style={styles.scrollTopBtn}
          onPress={scrollToTop}
          hitSlop={8}
        >
          <Feather name="arrow-up" size={18} color="#FFFFFF" />
        </TouchableOpacity>
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
            {poppedBook.series ? (
              <Text style={styles.pickupSeries} numberOfLines={1}>
                {poppedBook.series}
                {poppedBook.series_index
                  ? t("book.seriesTome", { index: poppedBook.series_index })
                  : ""}
              </Text>
            ) : null}
            <Text style={styles.pickupHint}>
              {t("library.tapCoverToOpen")}
            </Text>
            {reorderMode && poppedBook.pile_id ? (
              <View style={styles.pickupActions}>
                <TouchableOpacity
                  style={styles.pickupActionBtn}
                  onPress={() => moveBookInPile(poppedBook, "up")}
                >
                  <Feather name="chevron-up" size={15} color="#FFFFFF" />
                  <Text style={styles.pickupActionText}>{t("library.moveUp")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pickupActionBtn}
                  onPress={() => moveBookInPile(poppedBook, "down")}
                >
                  <Feather name="chevron-down" size={15} color="#FFFFFF" />
                  <Text style={styles.pickupActionText}>{t("library.moveDown")}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.pickupActions}>
              <TouchableOpacity
                style={styles.pickupActionBtn}
                onPress={() => setSelectedBook(poppedBook)}
              >
                <Feather name="more-horizontal" size={15} color="#FFFFFF" />
                <Text style={styles.pickupActionText}>{t("library.options")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pickupActionBtn}
                onPress={() => setPoppedBook(null)}
              >
                <Feather name="corner-down-left" size={15} color="#FFFFFF" />
                <Text style={styles.pickupActionText}>{t("library.putBack")}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </TouchableOpacity>
      )}

      {showEditTutorial && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setShowEditTutorial(false)}
          activeOpacity={1}
        >
          <TouchableOpacity style={styles.bottomSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t("library.editModeTitle")}</Text>
            <View style={styles.tutorialRow}>
              <Feather name="move" size={16} color={colors.purple} />
              <Text style={styles.tutorialText}>
                {t("library.tutorial.dragBook")}
              </Text>
            </View>
            <View style={styles.tutorialRow}>
              <Feather name="minus-square" size={16} color={colors.purple} />
              <Text style={styles.tutorialText}>
                {t("library.tutorial.addSpace")}
              </Text>
            </View>
            <View style={styles.tutorialRow}>
              <Feather name="image" size={16} color={colors.purple} />
              <Text style={styles.tutorialText}>
                {t("library.tutorial.addDecor")}
              </Text>
            </View>
            <View style={styles.tutorialRow}>
              <Feather name="x-circle" size={16} color={colors.purple} />
              <Text style={styles.tutorialText}>
                {t("library.tutorial.removeDecor")}
              </Text>
            </View>
            <View style={styles.tutorialRow}>
              <Feather name="grid" size={16} color={colors.purple} />
              <Text style={styles.tutorialText}>
                {t("library.tutorial.gridDrag")}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.tutorialCloseBtn}
              onPress={() => setShowEditTutorial(false)}
            >
              <Text style={styles.tutorialCloseBtnText}>{t("library.gotIt")}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {showSortSheet && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setShowSortSheet(false)}
          activeOpacity={1}
        >
          <TouchableOpacity style={styles.bottomSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t("library.sortTitle")}</Text>
            <TouchableOpacity
              style={[styles.sheetRow, styles.sheetDivider]}
              onPress={() => {
                setSortOrder("manual");
                setShowSortSheet(false);
              }}
            >
              <Feather name="sliders" size={16} color={colors.white} />
              <Text style={styles.sheetBtnText}>{t("library.sortManual")}</Text>
              {sortOrder === "manual" && (
                <Feather
                  name="check"
                  size={16}
                  color={colors.purple}
                  style={{ marginLeft: "auto" }}
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetRow, styles.sheetDivider]}
              onPress={() => {
                setSortOrder("asc");
                setShowSortSheet(false);
              }}
            >
              <Feather name="arrow-up" size={16} color={colors.white} />
              <Text style={styles.sheetBtnText}>
                {t("library.sortOldest")}
              </Text>
              {sortOrder === "asc" && (
                <Feather
                  name="check"
                  size={16}
                  color={colors.purple}
                  style={{ marginLeft: "auto" }}
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetRow, styles.sheetDivider]}
              onPress={() => {
                setSortOrder("desc");
                setShowSortSheet(false);
              }}
            >
              <Feather name="arrow-down" size={16} color={colors.white} />
              <Text style={styles.sheetBtnText}>
                {t("library.sortNewest")}
              </Text>
              {sortOrder === "desc" && (
                <Feather
                  name="check"
                  size={16}
                  color={colors.purple}
                  style={{ marginLeft: "auto" }}
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetRow, activeTab === "to_read" && styles.sheetDivider]}
              onPress={() => {
                setSortOrder("author");
                setShowSortSheet(false);
              }}
            >
              <Feather name="user" size={16} color={colors.white} />
              <Text style={styles.sheetBtnText}>{t("library.sortAuthor")}</Text>
              {sortOrder === "author" && (
                <Feather
                  name="check"
                  size={16}
                  color={colors.purple}
                  style={{ marginLeft: "auto" }}
                />
              )}
            </TouchableOpacity>

            {activeTab === "to_read" && (
              <>
                <Text style={[styles.sheetTitle, { marginTop: 16, marginBottom: 4 }]}>
                  {t("library.filterTitle")}
                </Text>
                {[
                  { value: "all" as const, icon: "layers" as const, labelKey: "library.ownedFilters.all" },
                  { value: "owned" as const, icon: "check-circle" as const, labelKey: "library.ownedFilters.owned" },
                  { value: "wishlist" as const, icon: "heart" as const, labelKey: "library.ownedFilters.wishlist" },
                ].map((f, i, arr) => (
                  <TouchableOpacity
                    key={f.value}
                    style={[styles.sheetRow, i < arr.length - 1 && styles.sheetDivider]}
                    onPress={() => {
                      setOwnedFilter(f.value);
                      setShowSortSheet(false);
                    }}
                  >
                    <Feather name={f.icon} size={16} color={colors.white} />
                    <Text style={styles.sheetBtnText}>{t(f.labelKey)}</Text>
                    {ownedFilter === f.value && (
                      <Feather
                        name="check"
                        size={16}
                        color={colors.purple}
                        style={{ marginLeft: "auto" }}
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {framePicker?.step === "menu" && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setFramePicker(null)}
          activeOpacity={1}
        >
          <TouchableOpacity style={styles.bottomSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>
              {framePicker.frame ? t("library.editFrameTitle") : t("library.addFrameTitle")}
            </Text>
            <TouchableOpacity
              style={[styles.sheetRow, styles.sheetDivider]}
              onPress={() =>
                setFramePicker({ step: "book", frame: framePicker.frame })
              }
            >
              <Feather name="book" size={16} color={colors.white} />
              <Text style={styles.sheetBtnText}>{t("library.chooseBook")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetRow, styles.sheetDivider]}
              onPress={() => pickFrameImage("camera")}
            >
              <Feather name="camera" size={16} color={colors.white} />
              <Text style={styles.sheetBtnText}>{t("library.takePhoto")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.sheetRow,
                framePicker.frame && styles.sheetDivider,
              ]}
              onPress={() => pickFrameImage("gallery")}
            >
              <Feather name="image" size={16} color={colors.white} />
              <Text style={styles.sheetBtnText}>{t("library.fromGallery")}</Text>
            </TouchableOpacity>
            {framePicker.frame ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => deleteFrame(framePicker.frame!)}
              >
                <Feather name="trash-2" size={16} color={colors.error} />
                <Text style={styles.sheetBtnDangerText}>{t("library.removeFrame")}</Text>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {framePicker?.step === "book" && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setFramePicker(null)}
          activeOpacity={1}
        >
          <TouchableOpacity style={styles.bottomSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{t("library.chooseBook")}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.framePickerBookRow}
            >
              {filteredBooks.map((book) => (
                <TouchableOpacity
                  key={book.book_id}
                  onPress={() => pickFrameBook(book)}
                >
                  {book.cover_url ? (
                    <Image
                      source={{ uri: book.cover_url }}
                      style={styles.framePickerBookCover}
                    />
                  ) : (
                    <View
                      style={[
                        styles.framePickerBookCover,
                        styles.framePickerBookCoverEmpty,
                      ]}
                    >
                      <Feather name="book" size={18} color={colors.purple} />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
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
                <Text style={styles.sheetBtnText}>{t(s.labelKey)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sheetRow} onPress={removeBook}>
              <Feather name="trash-2" size={16} color={colors.error} />
              <Text style={styles.sheetBtnDangerText}>{t("library.removeFromList")}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => {
  return StyleSheet.create({
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
    editToggle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
    },
    reorderBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.purpleGlow,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginHorizontal: 20,
      marginBottom: 10,
    },
    reorderBannerText: { fontSize: 12, color: colors.lavender, flex: 1 },
    reorderBannerCancel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.purple,
    },
    spacingBookActions: {
      position: "absolute",
      zIndex: 30,
      bottom: SPINE_HEIGHT + 8,
      left: SPINE_WIDTH / 2,
      transform: [{ translateX: -37 }],
      width: 74,
      flexDirection: "column",
      alignItems: "stretch",
      gap: 4,
      padding: 4,
      borderRadius: 12,
      backgroundColor: colors.card2,
      borderWidth: 1,
      borderColor: colors.purple,
      ...shadows.card,
    },
    spacingBookActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.purple,
    },
    spacingBookActionBtnActive: { backgroundColor: colors.lavender },
    spacingBookActionText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "700",
    },
    // Nested inside stackWrap and anchored off *its* top, exactly mirroring
    // spacingBookActions inside spineWrap — no scroll space reserved for it,
    // so it can render clipped past the top on the shelf's first row
    // (acceptable trade-off for keeping this simple, same as the spine).
    stackSpacingBookActions: {
      position: "absolute",
      zIndex: 30,
      bottom: STACK_BAR_HEIGHT + 88,
      left: STACK_WIDTH / 2,
      transform: [{ translateX: -37 }],
      width: 74,
      flexDirection: "column",
      alignItems: "stretch",
      gap: 4,
      padding: 4,
      borderRadius: 12,
      backgroundColor: colors.card2,
      borderWidth: 1,
      borderColor: colors.purple,
      ...shadows.card,
    },
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
    emptyShelf: {
      minHeight: SPINE_HEIGHT * 0.55,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card2,
    },
    emptyShelfText: {
      color: colors.muted,
      fontSize: 12,
      fontWeight: "600",
    },
    emptyShelfRemove: {
      position: "absolute",
      top: 6,
      right: 6,
    },
    // The "+" divider between two rows in reorder mode — inserts an empty
    // shelf there (addShelfBreak). Hidden right before an already-empty
    // shelf since there'd be nothing to add.
    addShelfDivider: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 6,
      marginBottom: 16,
      height: 20,
    },
    addShelfLine: {
      flex: 1,
      height: 1,
      backgroundColor: "rgba(255,255,255,0.12)",
    },
    addShelfBtn: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.purple,
      alignItems: "center",
      justifyContent: "center",
      marginHorizontal: 8,
    },

    // A photo frame dropped into the shelf — as wide as 3 standing spines
    // (see FRAME_WIDTH), styled to look like a hung picture rather than a
    // book.
    frameWrap: { width: FRAME_WIDTH, position: "relative" },
    // A soft dark shape sitting slightly behind/below the frame (offset,
    // tilted a touch more than the frame itself) — reads as a cast shadow
    // against the shelf, on top of the frame's own drop shadow, so it feels
    // like it's actually leaning off the wall rather than flat against it.
    frameShadow: {
      position: "absolute",
      top: 6,
      left: 4,
      width: FRAME_WIDTH,
      height: SPINE_HEIGHT,
      borderRadius: 6,
      backgroundColor: "rgba(0,0,0,0.35)",
    },
    frameBox: {
      width: FRAME_WIDTH,
      height: SPINE_HEIGHT,
      borderRadius: 6,
      borderWidth: 6,
      borderColor: "#8C6C48",
      backgroundColor: colors.card2,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000000",
      shadowOffset: { width: 3, height: 5 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 6,
    },
    frameImage: { width: "100%", height: "100%" },
    frameEmpty: { alignItems: "center", justifyContent: "center" },
    // The tap-to-place ghost — dashed border, translucent, so it clearly
    // reads as "not really there yet" while still showing exactly how much
    // room it'll take.
    frameBoxGhost: {
      borderStyle: "dashed",
      borderColor: colors.purple,
      backgroundColor: colors.purpleGlow,
      opacity: 0.85,
    },
    frameDeleteBtn: {
      position: "absolute",
      top: -8,
      right: -8,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 5,
    },
    frameMoveBtn: {
      position: "absolute",
      top: -8,
      left: -8,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.purple,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 5,
    },
    // A potted plant dropped into the shelf — narrower than a frame, no
    // border/background of its own (just the plant art standing on the
    // shelf baseline like a book would).
    plantWrap: { width: PLANT_WIDTH, position: "relative" },
    // overflow: hidden + the image pushed below the box's own bottom edge
    // (see plantImage) crops off the sliver of transparent padding most
    // background-removed PNGs leave under the pot — without it the plant
    // "floats" a few px above the shelf line instead of standing on it.
    plantBox: {
      width: PLANT_WIDTH,
      height: SPINE_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    // A fixed, modest size (not stretched/zoomed to fill the tall narrow
    // tile) pinned to the bottom — "cover" or a tall percentage both ended
    // up blowing the plant up way past book scale.
    plantImage: {
      position: "absolute",
      bottom: 0,
      alignSelf: "center",
      width: "96%",
      height: 108,
    },
    // A candle dropped into the shelf — exactly the same treatment as the
    // plant above (see plantWrap/plantBox/plantImage), just with the
    // assets/bougie art instead of assets/plants.
    candleWrap: { width: CANDLE_WIDTH, position: "relative" },
    candleBox: {
      width: CANDLE_WIDTH,
      height: SPINE_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    candleImage: {
      position: "absolute",
      bottom: 0,
      alignSelf: "center",
      width: "96%",
      height: 116,
    },
    // A small standing clock — round face on the shelf baseline, like a
    // desk/mantel clock rather than a wall-hung one (no tilt, same as the
    // plant).
    clockWrap: {
      width: CLOCK_WIDTH,
      height: SPINE_HEIGHT,
      position: "relative",
      alignItems: "center",
      justifyContent: "flex-end",
    },
    clockRing: {
      width: CLOCK_WIDTH - 8,
      height: CLOCK_WIDTH - 8,
      borderRadius: (CLOCK_WIDTH - 8) / 2,
      borderWidth: 5,
      borderColor: "#8C6C48",
      backgroundColor: colors.card2,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
      shadowColor: "#000000",
      shadowOffset: { width: 2, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 5,
    },
    clockDigits: {
      fontSize: 12,
      fontFamily: fonts.headingBold,
      color: colors.white,
      letterSpacing: 0.3,
    },
    framePickerBookRow: { gap: 10, paddingVertical: 4 },
    framePickerBookCover: {
      width: 64,
      height: 96,
      borderRadius: 6,
      backgroundColor: colors.card2,
    },
    framePickerBookCoverEmpty: {
      alignItems: "center",
      justifyContent: "center",
    },

    spineWrap: { width: SPINE_WIDTH },
    spine: {
      width: SPINE_WIDTH,
      height: SPINE_HEIGHT,
      borderRadius: 3,
      overflow: "hidden",
      // Border width stays fixed (only color/shadow change on selection, see
      // slotStackTarget) — changing width here would resize the tile and
      // re-trigger DraggableShelfBook's layout spring on every toggle,
      // making the highlight look sluggish to turn on/off.
      borderWidth: 3,
      borderColor: "rgba(0,0,0,0.15)",
      ...shadows.card,
    },
    tiltBtn: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1,
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
    // zIndex above the pile-drag grip's own wrapper (20) so the spacing
    // popup nested at the end of this stack — see stackSpacingBookActions —
    // isn't trapped under it by that wrapper's stacking context.
    stackWrap: { width: STACK_WIDTH, zIndex: 25 },
    // The whole-pile drag grip — deliberately *not* overlaid on top of the
    // pile anymore (it used to sit absolutely positioned over the front
    // cover, sharing screen space with that cover's own per-book drag
    // handler). React Native's touch hit-testing doesn't reliably follow a
    // reanimated-driven zIndex the way the visual paint order does, so the
    // book underneath kept winning the gesture arena and the grip was
    // effectively untouchable. A plain pill above the pile can't compete
    // with anything since nothing else occupies that space.
    pileGrip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 6,
      marginBottom: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: "rgba(0,0,0,0.55)",
    },
    pileGripText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
    // Reorder mode's whole-row drag grip — a plain block *below* the shelf
    // rather than a flex sibling squeezed in beside it, so it never eats
    // into the width buildRows already packed the row's books against (that
    // mismatch was what wrapped rows onto extra lines and crammed books
    // together).
    rowGrip: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: -24,
      marginBottom: 0,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: colors.purple,
    },
    rowGripText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
    unstackBtn: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center",
    },
    stackBar: {
      width: STACK_WIDTH,
      height: STACK_BAR_HEIGHT,
      borderRadius: 4,
      overflow: "hidden",
      // Fixed width — see spine's identical comment on slotStackTarget.
      borderWidth: 3,
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
    // The book currently picked for a reorder swap — a bright outline so
    // it's obvious which one will move when you tap a second book.
    slotSelected: { borderWidth: 2, borderColor: colors.purple },
    slotStackTarget: {
      borderColor: colors.purple,
      shadowColor: colors.purple,
      shadowOpacity: 0.7,
      shadowRadius: 8,
      elevation: 8,
    },

    // "Room" view (the un-zoomed side of viewMode "shelf") — assets/salon.jpg
    // rendered at its native aspect ratio (see SALON_IMAGE_ASPECT_RATIO)
    // with invisible tap zones over each piece of furniture in the
    // illustration (see SALON_SHELF_ZONES). Tapping one zooms into that
    // status's real shelf (see roomZoomed/backToRoomBtn).
    roomScroll: { flex: 1 },
    roomFloor: {
      paddingVertical: 24,
      paddingHorizontal: 20,
    },
    roomHint: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.lavender,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 16,
    },
    // Centered, width-capped so the illustration doesn't stretch edge to
    // edge on a wide/tablet screen — a soft card frame around it (rather
    // than the bare image floating on the screen background) is what makes
    // this read as a designed page instead of a dropped-in picture.
    salonCard: {
      alignSelf: "center",
      width: "100%",
      maxWidth: 480,
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 12,
      ...shadows.card,
    },
    salonImageWrap: {
      width: "100%",
      position: "relative",
      borderRadius: 16,
      overflow: "hidden",
    },
    salonImage: { width: "100%", height: "100%" },
    salonShelfZone: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "flex-start",
      paddingTop: 4,
    },
    salonShelfBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      opacity: 0.92,
    },
    salonShelfBadgeText: {
      fontSize: 10,
      fontWeight: "700",
      color: "#FFFFFF",
    },

    roomBackRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginHorizontal: 20,
      marginBottom: 10,
    },
    backToRoomBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.card2,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    addDecorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    decorCounter: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.gray,
      marginRight: 2,
    },
    addFrameBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.card2,
      alignItems: "center",
      justifyContent: "center",
    },
    backToRoomText: { fontSize: 12, fontWeight: "600", color: colors.white },

    scrollTopBtn: {
      position: "absolute",
      right: 20,
      bottom: 24,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.purple,
      alignItems: "center",
      justifyContent: "center",
      ...shadows.card,
      zIndex: 50,
    },

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
    pickupSeries: {
      fontSize: 12,
      fontWeight: "600",
      color: "#fff",
      textAlign: "center",
      marginTop: 4,
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
      // A touch lighter than the card2 slot behind it, so a coverless book
      // still reads as its own tile instead of blending into the background.
      backgroundColor: "rgba(255,255,255,0.06)",
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
    tutorialRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingVertical: 10,
    },
    tutorialText: {
      flex: 1,
      color: colors.white,
      fontSize: 13,
      lineHeight: 19,
    },
    tutorialCloseBtn: {
      backgroundColor: colors.purple,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: "center",
      marginTop: 12,
    },
    tutorialCloseBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
    sheetBtnDangerText: {
      color: colors.error,
      fontSize: 14,
      fontWeight: "500",
    },
  });
};
