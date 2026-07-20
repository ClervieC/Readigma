import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import { ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useTimer } from '../context/TimerContext';
import { formatDuration } from '../lib/timer';

const BUBBLE_SIZE = 52;
const MARGIN = 14;
const CORNER_STORAGE_KEY = 'readigma_timer_bubble_corner';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

// Floating "picture-in-picture" mini-player for the active reading-session
// timer — visible over every screen except the book's own detail page
// (which already shows the full timer card, see app/book/[id].tsx).
// Draggable to any of the four corners (persisted, see CORNER_STORAGE_KEY) —
// added after it kept landing on top of screen-specific bottom-right
// elements (library's scroll-to-top button, the last row of a list on
// search/profile) with no way to move it out of the way.
export default function TimerBubble() {
  const { session, bookCover, elapsedSeconds, stop } = useTimer();
  const { colors } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const styles = makeStyles(colors);
  const pulse = useSharedValue(1);
  const [corner, setCorner] = useState<Corner>('bottom-right');
  const [ready, setReady] = useState(false);

  const cornerPos = (c: Corner) => {
    const top = insets.top + 60;
    const bottom = height - insets.bottom - 92 - BUBBLE_SIZE;
    const left = MARGIN;
    const right = width - BUBBLE_SIZE - MARGIN;
    return {
      x: c.endsWith('left') ? left : right,
      y: c.startsWith('top') ? top : bottom,
    };
  };

  const posX = useSharedValue(0);
  const posY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  useEffect(() => {
    AsyncStorage.getItem(CORNER_STORAGE_KEY).then((saved) => {
      const initial = (CORNERS as string[]).includes(saved ?? '') ? (saved as Corner) : 'bottom-right';
      const p = cornerPos(initial);
      posX.value = p.x;
      posY.value = p.y;
      setCorner(initial);
      setReady(true);
    });
  }, []);

  // Re-anchors to the same corner on a dimension change (rotation, split
  // screen) instead of leaving the bubble at a now-stale pixel offset.
  useEffect(() => {
    if (!ready) return;
    const p = cornerPos(corner);
    posX.value = p.x;
    posY.value = p.y;
  }, [width, height, insets.top, insets.bottom, ready]);

  useEffect(() => {
    if (!session) return;
    pulse.value = withRepeat(withSequence(withTiming(0.4, { duration: 700 }), withTiming(1, { duration: 700 })), -1, true);
  }, [session?.id]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const applyCorner = (c: Corner) => {
    setCorner(c);
    AsyncStorage.setItem(CORNER_STORAGE_KEY, c).catch(() => {});
  };

  const goToBook = () => {
    if (session) router.push(`/book/${session.book_id}`);
  };

  const pan = Gesture.Pan()
    .minDistance(6)
    .onStart(() => {
      startX.value = posX.value;
      startY.value = posY.value;
    })
    .onUpdate((e) => {
      posX.value = startX.value + e.translationX;
      posY.value = startY.value + e.translationY;
    })
    .onEnd(() => {
      const isRight = posX.value + BUBBLE_SIZE / 2 > width / 2;
      const isBottom = posY.value + BUBBLE_SIZE / 2 > height / 2;
      const next: Corner = `${isBottom ? 'bottom' : 'top'}-${isRight ? 'right' : 'left'}` as Corner;
      const top = insets.top + 60;
      const bottom = height - insets.bottom - 92 - BUBBLE_SIZE;
      const left = MARGIN;
      const right = width - BUBBLE_SIZE - MARGIN;
      posX.value = withSpring(next.endsWith('left') ? left : right, { damping: 18 });
      posY.value = withSpring(next.startsWith('top') ? top : bottom, { damping: 18 });
      runOnJS(applyCorner)(next);
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(goToBook)();
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    left: posX.value,
    top: posY.value,
  }));

  if (!session || !ready) return null;
  const segs = segments as unknown as string[];
  if (segs[0] === 'book' && segs[1] === session.book_id) return null;

  return (
    <Animated.View style={[styles.bubbleWrap, animatedStyle]}>
      <GestureDetector gesture={gesture}>
        <View style={styles.bubble}>
          {bookCover ? <Image source={{ uri: bookCover }} style={styles.coverImg} /> : <Feather name="book" size={18} color="white" />}
          <View style={styles.timeBadge}>
            <Text style={styles.time} numberOfLines={1}>{formatDuration(elapsedSeconds)}</Text>
          </View>
          <Animated.View style={[styles.recDot, pulseStyle]} />
        </View>
      </GestureDetector>
      <TouchableOpacity style={styles.stopBtn} onPress={stop} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="square" size={10} color={colors.purple} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    bubbleWrap: { position: 'absolute', alignItems: 'center' },
    bubble: {
      width: BUBBLE_SIZE,
      height: BUBBLE_SIZE,
      borderRadius: BUBBLE_SIZE / 2,
      backgroundColor: colors.purple,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 6,
    },
    coverImg: { width: '100%', height: '100%', position: 'absolute' },
    timeBadge: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingVertical: 2,
    },
    time: { color: 'white', fontSize: 9, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
    recDot: {
      position: 'absolute',
      top: 3,
      right: 3,
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: '#E85D5D',
    },
    stopBtn: {
      position: 'absolute',
      top: -4,
      left: -4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'white',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.divider,
    },
  });
