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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
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

type Slot =
  | { type: "spine"; book: any; gapBefore: boolean; gapAfter: boolean }
  | { type: "stack"; books: any[]; gapBefore: boolean; gapAfter: boolean };
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

// Groups books into shelf rows, occasionally piling a few flat on their side
// instead of standing every single one upright — a real shelf never lines
// every book the same way. Once a user manually piles anything in a status
// (see stackBooks/unstackBook), those explicit pile_id groupings are used
// exclusively — books with no pile_id in that case just stand as spines, no
// auto-piling mixed in, so the shelf matches what was actually arranged.
// Until then, piling is automatic and randomized (seeded by book id, see
// hashRatio) instead of on a fixed rhythm, purely for visual variety.
function buildRows(books: any[], maxRowWidth: number): Row[] {
  const rows: Row[] = [];
  let row: Slot[] = [];
  let rowWidth = 0;

  const flushRow = () => {
    if (row.length > 0) rows.push({ type: "books", slots: row });
    row = [];
    rowWidth = 0;
  };

  const push = (slot: Slot, width: number, anchorBook: any) => {
    if (row.length === 0 && anchorBook?.shelf_break_before && rows.length > 0) {
      rows.push({ type: "empty", anchorId: anchorBook.book_id });
    }
    if (row.length > 0 && rowWidth + SLOT_GAP + width > maxRowWidth) {
      flushRow();
      if (anchorBook?.shelf_break_before) {
        rows.push({ type: "empty", anchorId: anchorBook.book_id });
      }
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
      } else {
        used.add(book.book_id);
        pushSpine(book);
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
  }
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
  onTap,
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
  onTap: () => void;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const scale = useSharedValue(1);
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
      runOnJS(onDragUpdateY)(e.absoluteY);
    })
    .onEnd(() => {
      runOnJS(onDrop)();
      translateX.value = withSpring(0, { damping: 18 });
      translateY.value = withSpring(0, { damping: 18 });
      scale.value = withSpring(1, { damping: 18 });
      dragging.value = false;
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
  onTap,
  style,
  children,
}: {
  bookId: string;
  disabled: boolean;
  registerRef: (id: string, ref: View | null) => void;
  onDragStart: () => void;
  onDragUpdateY: (absoluteY: number) => void;
  onDragUpdate: (bookId: string, x: number, y: number) => void;
  onDrop: (bookId: string, x: number, y: number) => void;
  onTap?: () => void;
  style?: any;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const scale = useSharedValue(1);

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
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      runOnJS(onDragUpdateY)(e.absoluteY);
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
  children,
}: {
  groupIds: string[];
  onDragStart: () => void;
  onDragUpdateY: (absoluteY: number) => void;
  onDragUpdate: (groupIds: string[], x: number, y: number) => void;
  onDrop: (groupIds: string[], x: number, y: number) => void;
  children: React.ReactNode;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(false);

  const pan = Gesture.Pan()
    // Same activation offset as DraggableShelfBook — without it this grip
    // (a small icon sitting on top of the pile's other per-book drag
    // handlers) claims every touch immediately, which made it too easy to
    // accidentally "grab" the pile-move handle instead of a book underneath,
    // or vice versa, since both gesture arenas were racing from pixel zero.
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .onStart(() => {
      dragging.value = true;
      runOnJS(onDragStart)();
    })
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
      runOnJS(onDragUpdateY)(e.absoluteY);
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

const ROOM_SHELVES: {
  status: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { status: "to_read", label: "À lire", icon: "bookmark" },
  { status: "reading", label: "En cours", icon: "book-open" },
  { status: "done", label: "Lus", icon: "check-circle" },
  { status: "dnf", label: "Pas fini", icon: "x-circle" },
];

// Splits a pile of "bars" (one per book, capped) into two shelf
// compartments so each cabinet reads as an actual piece of furniture with
// two levels rather than one flat row of ticks.
function splitBars(count: number): [number, number] {
  const total = Math.min(Math.max(count, count > 0 ? 2 : 0), 16);
  const top = Math.ceil(total / 2);
  return [top, total - top];
}

function ShelfRow({
  n,
  colors,
  styles,
}: {
  n: number;
  colors: ColorPalette;
  styles: any;
}) {
  if (n === 0) return <View style={styles.roomCompartment} />;
  return (
    <View style={styles.roomCompartment}>
      {Array.from({ length: n }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.roomBar,
            {
              height: 22 + ((i * 29) % 16),
              backgroundColor: [
                colors.purple,
                colors.teal,
                colors.pink,
                colors.cyan,
              ][i % 4],
            },
          ]}
        />
      ))}
    </View>
  );
}

function RoomPlant({ styles, tall }: { styles: any; tall?: boolean }) {
  return (
    <View
      style={[styles.roomPlant, tall && styles.roomPlantTall]}
      pointerEvents="none"
    >
      {tall ? (
        <>
          <View
            style={[
              styles.roomLeafSpike,
              { transform: [{ rotate: "-18deg" }], marginBottom: -18 },
            ]}
          />
          <View
            style={[
              styles.roomLeafSpike,
              {
                transform: [{ rotate: "10deg" }],
                marginBottom: -20,
                marginLeft: 8,
              },
            ]}
          />
          <View
            style={[
              styles.roomLeafSpike,
              {
                transform: [{ rotate: "-4deg" }],
                marginBottom: -18,
                marginLeft: -6,
              },
            ]}
          />
        </>
      ) : (
        <>
          <View style={styles.roomPlantLeafBack} />
          <View style={styles.roomPlantLeafFront} />
        </>
      )}
      <View style={[styles.roomPlantPot, tall && styles.roomPlantPotTall]} />
    </View>
  );
}

// Frame with a tiny abstract shape inside, echoing a simple gallery-wall
// piece rather than a plain bordered rectangle.
function RoomFrame({
  style,
  borderColor,
  children,
}: {
  style: any;
  borderColor: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={[style, { borderColor }]} pointerEvents="none">
      {children}
    </View>
  );
}

function RoomWindow({ styles }: { styles: any }) {
  return (
    <View style={styles.roomWindow} pointerEvents="none">
      <View style={styles.roomWindowGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={styles.roomWindowPane} />
        ))}
      </View>
      <View style={styles.roomWindowSill} />
    </View>
  );
}

// A wide "room" made of plain Views (no real illustration asset available)
// with one bookshelf unit per status — a real drawing would need an art
// asset this codebase doesn't have, so this fakes the room honestly with
// flat wall/floor colors and a row of generic little spine bars per shelf,
// sized/colored from the actual book count rather than a fixed decoration.
// Tapping a shelf hands off to the exact same per-status shelf browsing UI
// already used by viewMode "shelf" (see roomZoomed in LibraryScreen).
function RoomView({
  colors,
  styles,
  counts,
  onOpenShelf,
}: {
  colors: ColorPalette;
  styles: any;
  counts: Record<string, number>;
  onOpenShelf: (status: string) => void;
}) {
  return (
    <ScrollView
      style={styles.roomScroll}
      contentContainerStyle={styles.roomFloor}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.roomHint}>Touche une étagère pour l'ouvrir</Text>

      <View style={styles.roomWall}>
        <View style={styles.roomUnitsRow}>
          {ROOM_SHELVES.map((shelf) => {
            const count = counts[shelf.status] ?? 0;
            const [topBars, bottomBars] = splitBars(count);
            return (
              <TouchableOpacity
                key={shelf.status}
                style={styles.roomUnit}
                activeOpacity={0.85}
                onPress={() => onOpenShelf(shelf.status)}
              >
                <View style={styles.roomUnitHeader}>
                  <Feather
                    name={shelf.icon}
                    size={12}
                    color={colors.lavender}
                  />
                  <Text style={styles.roomUnitLabel} numberOfLines={1}>
                    {shelf.label}
                  </Text>
                  <Text style={styles.roomUnitCount}>{count}</Text>
                </View>
                <View style={styles.roomCabinet}>
                  <ShelfRow n={topBars} colors={colors} styles={styles} />
                  <View style={styles.roomShelfBoard} />
                  {count > 0 ? (
                    <ShelfRow n={bottomBars} colors={colors} styles={styles} />
                  ) : (
                    <View style={styles.roomCompartment}>
                      <Text style={styles.roomUnitEmpty}>Vide</Text>
                    </View>
                  )}
                </View>
                <View style={styles.roomCabinetLegs}>
                  <View style={styles.roomLeg} />
                  <View style={styles.roomLeg} />
                </View>
              </TouchableOpacity>
            );
          })}
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
  const { width, height } = useWindowDimensions();
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
  // viewMode "shelf" now starts on a wide "room" view of several bookshelf
  // cabinets (one per status) — tapping one zooms into that shelf's actual
  // books, reusing the exact same shelf browsing UI (see RoomView above).
  // Local/unpersisted: reopening the tab always starts back at the room,
  // not mid-zoom.
  const [roomZoomed, setRoomZoomed] = useState(false);
  const [sortOrder, setSortOrder] = useState<"manual" | "asc" | "desc">(
    "manual",
  );
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
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
  const autoScrollDirRef = useRef<0 | 1 | -1>(0);
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const EDGE_ZONE = 90;
  const stopAutoScroll = () => {
    autoScrollDirRef.current = 0;
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
      // every scroll tick keeps them live for the rest of the drag.
      remeasureShelfFrames();
    }, 16);
  };
  const handleDragAutoScroll = (absoluteY: number) => {
    if (absoluteY < EDGE_ZONE) startAutoScroll(-1);
    else if (absoluteY > height - EDGE_ZONE) startAutoScroll(1);
    else stopAutoScroll();
  };
  useEffect(() => stopAutoScroll, []);

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
    const y = scrollOffsetRef.current;
    if (reorderMode) {
      // The ScrollView renders every row up front, so its real content
      // height is already correct the moment it mounts — one jump is enough.
      requestAnimationFrame(() => {
        reorderScrollRef.current?.scrollTo({ y, animated: false });
      });
    } else if (y > 0) {
      // The FlatList is virtualized and has no getItemLayout (shelf rows
      // aren't a fixed height), so right after mount it only knows an
      // *estimate* of where offset y actually is — jumping once lands
      // roughly right, then visibly corrects itself as real rows measure
      // in. Doing that correction while hidden (see restoringScroll on the
      // FlatList's style) is what turns "flashes at the top, then jumps"
      // into a clean reveal already in the right place.
      setRestoringScroll(true);
      const attempts = [0, 50, 150, 300];
      const timers = attempts.map((delay) =>
        setTimeout(() => {
          listRef.current?.scrollToOffset({ offset: y, animated: false });
          if (delay === attempts[attempts.length - 1])
            setRestoringScroll(false);
        }, delay),
      );
      return () => timers.forEach(clearTimeout);
    }
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
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      const diff =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
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
    userBooks
      .saveShelfOrder(ids)
      .catch(() => Alert.alert("Erreur", "Impossible d'enregistrer l'ordre"));
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
          "Pile pleine",
          `Une pile ne peut pas dépasser ${STACK_SIZE} livres.`,
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
    userBooks
      .stackBooks(moveBook.book_id, targetBook.book_id, existingPileId)
      .then(() => {
        const pileId = existingPileId ?? targetBook.book_id;
        setAllBooks((cur) =>
          cur.map((x) => {
            if (x.book_id === moveBook.book_id)
              return { ...x, pile_id: pileId };
            if (!existingPileId && x.book_id === targetBook.book_id)
              return { ...x, pile_id: pileId };
            return x;
          }),
        );
      })
      .catch(() => Alert.alert("Erreur", "Impossible d'empiler ces livres"));
  };

  const doUnstack = (book: any) => {
    setAllBooks((cur) =>
      cur.map((x) =>
        x.book_id === book.book_id ? { ...x, pile_id: null } : x,
      ),
    );
    userBooks
      .unstackBook(book.book_id)
      .catch(() => Alert.alert("Erreur", "Impossible de désempiler ce livre"));
  };

  // Clears a manually-added empty shelf (see the "x" on it in reorder mode).
  // There's no more UI to create one (removed per user request), but this
  // still lets anyone who already has one clean it up.
  const removeShelfBreak = (anchorId: string) => {
    setAllBooks((cur) =>
      cur.map((b) =>
        b.book_id === anchorId ? { ...b, shelf_break_before: false } : b,
      ),
    );
    userBooks
      .setShelfBreak(anchorId, false)
      .catch(() => Alert.alert("Erreur", "Impossible de retirer l'étagère"));
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
      .catch(() =>
        Alert.alert("Erreur", "Impossible de modifier cet espace"),
      );
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
        Alert.alert("Erreur", "Impossible de changer l'inclinaison"),
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
    let nearestId: string | null = null;
    let nearestFrame: Frame | null = null;
    let nearestDist = Infinity;
    for (const t of targets) {
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
      if (resolved.targetId !== stackTargetId) setStackTargetId(resolved.targetId);
      return;
    }
    if (stackTargetId) setStackTargetId(null);
    const targetId =
      resolved.type === "fill-empty" ? resolved.anchorId : resolved.targetId;
    if (targetId === lastShelfTargetRef.current) return;
    lastShelfTargetRef.current = targetId;
    const ids = filteredBooks.map((b) => b.book_id);
    const currentIndex = ids.indexOf(bookId);
    if (currentIndex === -1) return;
    ids.splice(currentIndex, 1);
    let targetIndex = ids.indexOf(targetId);
    if (resolved.type === "reorder" && resolved.after) targetIndex += 1;
    ids.splice(targetIndex, 0, bookId);
    setAllBooks((cur) =>
      cur.map((b) =>
        b.status === activeTab
          ? { ...b, shelf_position: ids.indexOf(b.book_id) }
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
    lastShelfTargetRef.current = null;
    setStackTargetId(null);
    const dragged = filteredBooks.find((b) => b.book_id === bookId);
    if (!dragged) return;
    const resolved = resolveShelfDrop(new Set([bookId]), x, y);
    if (resolved?.type === "stack") {
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
        .catch(() => Alert.alert("Erreur", "Impossible de déplacer l'étagère"));
      userBooks
        .setShelfBreak(bookId, true)
        .catch(() => Alert.alert("Erreur", "Impossible de déplacer l'étagère"));
    }
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
    let targetIndex = remaining.indexOf(targetId);
    if (resolved.type === "reorder" && resolved.after) targetIndex += 1;
    remaining.splice(targetIndex, 0, ...groupIds);
    setAllBooks((cur) =>
      cur.map((b) =>
        b.status === activeTab
          ? { ...b, shelf_position: remaining.indexOf(b.book_id) }
          : b,
      ),
    );
  };

  const handleGroupDrop = (groupIds: string[], _x: number, _y: number) => {
    stopAutoScroll();
    lastShelfTargetRef.current = null;
    const ids = filteredBooks.map((b) => b.book_id);
    persistOrder(ids);
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
    setAllBooks((cur) =>
      cur.map((b) =>
        b.status === activeTab
          ? { ...b, shelf_position: ids.indexOf(b.book_id) }
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
      .catch(() => Alert.alert("Erreur", "Impossible d'enregistrer l'ordre"));
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
  const renderSpineVisual = (book: any, gapBefore = false, gapAfter = false) => {
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
              <Feather name="chevron-left" size={14} color={colors.white} />
              <Text style={styles.spacingBookActionText}>Gauche</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.spacingBookActionBtn}
              onPress={() => toggleShelfGap("after")}
            >
              <Text style={styles.spacingBookActionText}>Droite</Text>
              <Feather name="chevron-right" size={14} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : null}
        <View
          style={[
            styles.spine,
            { backgroundColor: colors.card2 },
            reorderMode && stackTargetId === book.book_id && styles.slotStackTarget,
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
          <TouchableOpacity onPress={() => setShowSortSheet(true)} hitSlop={6}>
            <Feather
              name="sliders"
              size={17}
              color={sortOrder === "manual" ? colors.gray : colors.purple}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const nextReorderMode = !reorderMode;
              setReorderMode(nextReorderMode);
              // Manual positioning needs the actual saved order. A date sort
              // would immediately re-sort the books after every drop and make
              // a successful drag look like it had been ignored.
              if (nextReorderMode) {
                setSortOrder("manual");
                if (viewMode === "shelf" && !roomZoomed) {
                  setRoomZoomed(true);
                }
              }
              setReorderSelectedId(null);
              setSpacingSelectedId(null);
              setPoppedBook(null);
            }}
            hitSlop={6}
          >
            <Feather
              name="edit-2"
              size={17}
              color={reorderMode ? colors.purple : colors.gray}
            />
          </TouchableOpacity>
          <NotificationBell />
        </View>
      </View>

      {reorderMode && (
        <View style={styles.reorderBanner}>
          <Feather name="edit-2" size={13} color={colors.purple} />
          <Text style={styles.reorderBannerText}>
            {viewMode === "grid"
              ? "Glisse un livre pour le déplacer, ou touche-en deux pour les échanger"
              : "Glisse pour déplacer ou empiler · touche un livre pour ajouter un espace à gauche ou à droite"}
          </Text>
        </View>
      )}

      {viewMode === "shelf" && !roomZoomed ? (
        <RoomView
          colors={colors}
          styles={styles}
          counts={counts}
          onOpenShelf={(status) => {
            setActiveTab(status);
            setRoomZoomed(true);
          }}
        />
      ) : (
        <>
          {viewMode === "shelf" && roomZoomed && (
            <TouchableOpacity
              style={styles.backToRoomBtn}
              onPress={() => setRoomZoomed(false)}
            >
              <Feather name="arrow-left" size={14} color={colors.white} />
              <Text style={styles.backToRoomText}>Retour au salon</Text>
            </TouchableOpacity>
          )}

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
                    onTap={() => swapBooks(book)}
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
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
                setShowScrollTop(e.nativeEvent.contentOffset.y > 400);
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
                      <Text style={styles.emptyShelfText}>Étagère vide</Text>
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
                              }}
                              onDragUpdateY={handleDragAutoScroll}
                              onDragUpdate={handleShelfDragUpdate}
                              onDrop={handleShelfDrop}
                              onTap={() => setSpacingSelectedId(slot.book.book_id)}
                              style={[
                                slot.gapBefore && { marginLeft: SHELF_GAP_SIZE },
                                slot.gapAfter && { marginRight: SHELF_GAP_SIZE },
                              ]}
                            >
                              {renderSpineVisual(slot.book)}
                            </DraggableShelfBook>
                          ) : (
                            <View
                              key={slot.books.map((b) => b.book_id).join("-")}
                              style={[
                                slot.gapBefore && { marginLeft: SHELF_GAP_SIZE },
                                slot.gapAfter && { marginRight: SHELF_GAP_SIZE },
                              ]}
                            >
                              <DraggableHandle
                                groupIds={slot.books.map((b) => b.book_id)}
                                onDragStart={() => {
                                  lastShelfTargetRef.current = null;
                                  remeasureShelfFrames();
                                }}
                                onDragUpdateY={handleDragAutoScroll}
                                onDragUpdate={handleGroupDragUpdate}
                                onDrop={handleGroupDrop}
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
                                    }}
                                    onDragUpdateY={handleDragAutoScroll}
                                    onDragUpdate={handleShelfDragUpdate}
                                    onDrop={handleShelfDrop}
                                    onTap={() => setSpacingSelectedId(slot.books[0].book_id)}
                                  >
                                    {i === 0 &&
                                    spacingSelectedId === slot.books[0].book_id ? (
                                      <View style={styles.stackSpacingBookActions}>
                                        <TouchableOpacity
                                          style={styles.spacingBookActionBtn}
                                          onPress={() => toggleShelfGap("before")}
                                        >
                                          <Feather name="chevron-left" size={14} color={colors.white} />
                                          <Text style={styles.spacingBookActionText}>Gauche</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          style={styles.spacingBookActionBtn}
                                          onPress={() => toggleShelfGap("after")}
                                        >
                                          <Text style={styles.spacingBookActionText}>Droite</Text>
                                          <Feather name="chevron-right" size={14} color={colors.white} />
                                        </TouchableOpacity>
                                      </View>
                                    ) : null}
                                    <View
                                      style={[
                                        styles.stackBar,
                                        {
                                          backgroundColor: colors.card2,
                                          zIndex: slot.books.length - i,
                                        },
                                        stackTargetId === slot.books[0].book_id &&
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
                    <Text style={styles.emptyShelfText}>Étagère vide</Text>
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
                        : renderStack(slot.books, slot.gapBefore, slot.gapAfter),
                    )}
                  </Animated.View>
                )
              }
            />
          )}
        </>
      )}

      {showScrollTop && (
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

      {showSortSheet && (
        <TouchableOpacity
          style={styles.overlay}
          onPress={() => setShowSortSheet(false)}
          activeOpacity={1}
        >
          <TouchableOpacity style={styles.bottomSheet} activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Trier</Text>
            <TouchableOpacity
              style={[styles.sheetRow, styles.sheetDivider]}
              onPress={() => {
                setSortOrder("manual");
                setShowSortSheet(false);
              }}
            >
              <Feather name="sliders" size={16} color={colors.white} />
              <Text style={styles.sheetBtnText}>Mon organisation</Text>
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
                Plus ancien ajouté d'abord
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
              style={styles.sheetRow}
              onPress={() => {
                setSortOrder("desc");
                setShowSortSheet(false);
              }}
            >
              <Feather name="arrow-down" size={16} color={colors.white} />
              <Text style={styles.sheetBtnText}>
                Plus récent ajouté d'abord
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
    spacingBookActions: {
      position: "absolute",
      zIndex: 30,
      bottom: SPINE_HEIGHT + 8,
      left: -18,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      padding: 4,
      borderRadius: 999,
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
    spacingBookActionText: { color: colors.white, fontSize: 10, fontWeight: "700" },
    stackSpacingBookActions: {
      position: "absolute",
      zIndex: 30,
      bottom: STACK_BAR_HEIGHT + 8,
      left: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      padding: 4,
      borderRadius: 999,
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
    stackWrap: { width: STACK_WIDTH },
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
    // The book currently picked for a reorder swap — a bright outline so
    // it's obvious which one will move when you tap a second book.
    slotSelected: { borderWidth: 2, borderColor: colors.purple },
    slotStackTarget: {
      borderWidth: 3,
      borderColor: colors.purple,
      shadowColor: colors.purple,
      shadowOpacity: 0.7,
      shadowRadius: 8,
      elevation: 8,
    },

    // "Room" view (the un-zoomed side of viewMode "shelf") — a furnished-
    // feeling wall of wooden bookshelf cabinets, one per status, built
    // entirely from flat Views since there's no room illustration asset in
    // this app: a wallpapered wall with a couple of picture-frame accents,
    // a wood-floor band, and each cabinet drawn with two shelf compartments,
    // a center shelf board, and little legs so it reads as furniture rather
    // than a plain card. Tapping a cabinet zooms into that status's real
    // shelf (see roomZoomed/backToRoomBtn).
    roomScroll: { flex: 1 },
    roomFloor: { paddingBottom: 20 },
    roomHint: {
      fontSize: 12,
      color: colors.gray,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 14,
    },
    // Warm cream wallpaper, tall enough to hold a small gallery wall (frames,
    // mirror, window) above the bookshelf cabinets, echoing a real living
    // room's wall-then-furniture layout instead of just a colored strip.
    roomWall: {
      marginHorizontal: 16,
      backgroundColor: "#f3e6d5",
      borderTopLeftRadius: 14,
      borderTopRightRadius: 14,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 16,
      overflow: "hidden",
    },
    // A real flex row — every piece of wall décor sits side by side on the
    // same baseline instead of being nudged into place with absolute
    // top/left guesses, so nothing can ever drift into overlapping anything
    // else regardless of screen width.
    roomDecorRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    roomDecorCluster: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
    roomFrame1: {
      width: 30,
      height: 40,
      borderWidth: 3,
      borderRadius: 3,
      backgroundColor: "#faf3e8",
      alignItems: "center",
      justifyContent: "center",
      transform: [{ rotate: "-3deg" }],
    },
    roomFrameArch: {
      position: "absolute",
      bottom: 7,
      width: 14,
      height: 9,
      backgroundColor: "#d69a4f",
      borderTopLeftRadius: 7,
      borderTopRightRadius: 7,
    },
    roomFrameCircle: {
      position: "absolute",
      top: 7,
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: "#c9613f",
    },
    roomFrame2: {
      width: 20,
      height: 24,
      borderWidth: 3,
      borderRadius: 2,
      backgroundColor: "#faf3e8",
      alignItems: "center",
      justifyContent: "center",
    },
    roomFrameLeaf: {
      width: 3,
      height: 12,
      backgroundColor: "#4a7a4e",
      borderRadius: 2,
    },
    roomMirror: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 3,
      borderColor: "#c9613f",
      backgroundColor: "#e4d8ea",
      overflow: "hidden",
    },
    roomMirrorShine: {
      position: "absolute",
      top: 3,
      left: 6,
      width: 7,
      height: 18,
      borderRadius: 4,
      backgroundColor: "rgba(255,255,255,0.5)",
      transform: [{ rotate: "20deg" }],
    },
    // A small paned window, on the other end of the same décor row.
    roomWindow: { alignItems: "center" },
    roomWindowGrid: {
      width: 40,
      height: 40,
      flexDirection: "row",
      flexWrap: "wrap",
      backgroundColor: "#e9dcc4",
      borderWidth: 3,
      borderColor: "#c9a876",
      borderRadius: 2,
    },
    roomWindowPane: {
      width: "48%",
      height: "48%",
      margin: "1%",
      backgroundColor: "#cfe3e0",
    },
    roomWindowSill: {
      width: 46,
      height: 4,
      marginTop: 2,
      backgroundColor: "#c9a876",
      borderRadius: 1,
    },
    roomUnitsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: 16,
    },
    roomUnit: {
      width: "48%",
      backgroundColor: "#f0e4d3",
      borderRadius: 8,
      padding: 10,
      ...shadows.card,
    },
    roomUnitHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    roomUnitLabel: {
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
      color: "#3a2e22",
    },
    roomUnitCount: { fontSize: 11, color: colors.purple, fontWeight: "700" },
    // The cabinet itself: two shelf compartments separated by a solid board,
    // framed by the outer wood tone so it reads as one piece of furniture.
    roomCabinet: {
      backgroundColor: "#c9a876",
      borderRadius: 4,
      borderWidth: 2,
      borderColor: "#5c4632",
      overflow: "hidden",
    },
    roomCompartment: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 3,
      minHeight: 40,
      paddingHorizontal: 5,
      paddingTop: 4,
      paddingBottom: 3,
    },
    roomShelfBoard: { height: 5, backgroundColor: "#5c4632" },
    roomBar: { width: 7, borderRadius: 2, opacity: 0.92 },
    roomUnitEmpty: {
      fontSize: 10,
      color: "#5c4632",
      fontStyle: "italic",
      paddingBottom: 6,
    },
    roomCabinetLegs: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 6,
    },
    roomLeg: {
      width: 5,
      height: 6,
      backgroundColor: "#5c4632",
      borderRadius: 1,
    },
    // The tall potted plant standing on the floor row (see roomFloorRow) —
    // a plain flex item now, so its "feet" always land exactly at floor
    // level no matter how tall the wall/shelves above happen to be, instead
    // of an absolute-positioned guess that could float mid-air over them.
    roomFloorRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      marginHorizontal: 16,
      gap: 6,
    },
    roomPlant: { alignItems: "center", paddingBottom: 2 },
    roomPlantLeafBack: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: "#4a7a4e",
      opacity: 0.85,
      marginBottom: -10,
    },
    roomPlantLeafFront: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: "#5f9463",
      marginBottom: -6,
      marginLeft: -8,
    },
    roomLeafSpike: {
      width: 9,
      height: 34,
      borderRadius: 6,
      backgroundColor: "#3f6b52",
    },
    roomPlantPot: {
      width: 18,
      height: 14,
      backgroundColor: "#a05a3f",
      borderBottomLeftRadius: 3,
      borderBottomRightRadius: 3,
    },
    roomPlantPotTall: {
      width: 22,
      height: 18,
      borderBottomLeftRadius: 4,
      borderBottomRightRadius: 4,
    },
    roomFloorBand: {
      flex: 1,
      flexDirection: "row",
      alignItems: "flex-end",
      height: 14,
      borderBottomLeftRadius: 14,
      borderBottomRightRadius: 14,
      overflow: "hidden",
      backgroundColor: "#a9784f",
    },
    roomFloorPlank: {
      flex: 1,
      alignSelf: "stretch",
      borderRightWidth: 1,
      borderRightColor: "rgba(0,0,0,0.15)",
    },
    // A thin rug hint tucked into the floor band itself rather than a
    // separately floating shape below it.
    roomRugStripe: {
      position: "absolute",
      left: "20%",
      right: "20%",
      bottom: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: "#c9613f",
      opacity: 0.5,
    },

    backToRoomBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      alignSelf: "flex-start",
      backgroundColor: colors.card2,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginHorizontal: 20,
      marginBottom: 10,
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
