import { useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Animated, {
  SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { fonts, radius, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useTimer } from '../context/TimerContext';
import { formatDuration } from '../lib/timer';

// Floating "picture-in-picture" mini-player for the active reading-session
// timer — visible over every screen except the book's own detail page
// (which already shows the full timer card, see app/book/[id].tsx).
export default function TimerBubble() {
  const { session, bookTitle, bookCover, elapsedSeconds, stop } = useTimer();
  const { colors } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const styles = makeStyles(colors);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!session) return;
    pulse.value = withRepeat(withSequence(withTiming(0.4, { duration: 700 }), withTiming(1, { duration: 700 })), -1, true);
  }, [session?.id]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (!session) return null;
  const segs = segments as unknown as string[];
  if (segs[0] === 'book' && segs[1] === session.book_id) return null;

  return (
    <Animated.View style={styles.bubbleWrap} entering={SlideInDown.duration(280).springify().damping(16)} exiting={SlideOutDown.duration(200)}>
      <TouchableOpacity
        style={styles.bubble}
        activeOpacity={0.9}
        onPress={() => router.push(`/book/${session.book_id}`)}
      >
        <View style={styles.cover}>
          {bookCover ? <Image source={{ uri: bookCover }} style={styles.coverImg} /> : <Feather name="book" size={16} color="white" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{bookTitle || 'Lecture en cours'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Animated.View style={[styles.recDot, pulseStyle]} />
            <Text style={styles.time}>{formatDuration(elapsedSeconds)}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.stopBtn} onPress={stop} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="square" size={12} color={colors.purple} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    bubbleWrap: { position: 'absolute', left: 16, right: 16, bottom: 92 },
    bubble: {
      backgroundColor: colors.purple,
      borderRadius: radius.lg,
      paddingVertical: 8,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 6,
    },
    cover: { width: 30, height: 42, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    coverImg: { width: 30, height: 42 },
    title: { color: 'white', fontSize: 12, fontFamily: fonts.headingBold },
    recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E85D5D' },
    time: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 1, fontVariant: ['tabular-nums'] },
    stopBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  });
