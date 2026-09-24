import { forwardRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { fonts, radius, ColorPalette } from '../theme';
import { formatDuration } from '../lib/timer';
import { API_BASE } from '../lib/apiUrl';

const STAR_PATH = 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

function Stars({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fraction = Math.max(0, Math.min(1, rating - (star - 1)));
        return (
          <View key={star} style={{ width: 20, height: 20 }}>
            <Svg width={20} height={20} viewBox="0 0 24 24" style={{ position: 'absolute' }}>
              <Path d={STAR_PATH} fill="rgba(255,255,255,0.28)" />
            </Svg>
            <View style={{ position: 'absolute', width: `${fraction * 100}%` as any, height: 20, overflow: 'hidden' }}>
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path d={STAR_PATH} fill="#FFFFFF" />
              </Svg>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const FORMAT_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  physical: 'book',
  ereader: 'tablet',
  audiobook: 'headphones',
};
// Reuses the exact labels already shown on the format toggle Pills
// (book.format section) rather than inventing separate share-card copy.
const FORMAT_LABEL_KEY: Record<string, string> = {
  physical: 'book.formatPhysical',
  ereader: 'book.formatEreader',
  audiobook: 'book.formatAudiobook',
};

export type ShareJourneyEntry = { emoji: string; percent: number | null };

export type ShareBookCardData = {
  title: string;
  author: string | null;
  coverUrl: string | null;
  rating: number;
  comment: string | null;
  formats: ('physical' | 'ereader' | 'audiobook')[];
  readingSeconds: number;
  journey: ShareJourneyEntry[];
};

// Instagram Story-shaped (9:16 minimum, not fixed) — a long review or a full
// reaction trail should make the card taller rather than get clipped, so
// only minHeight enforces the story-like proportions; actual height is
// whatever the content needs.
const CARD_WIDTH = 320;
const CARD_MIN_HEIGHT = Math.round((CARD_WIDTH * 16) / 9);

const ShareBookCard = forwardRef<View, { colors: ColorPalette; data: ShareBookCardData }>(
  ({ colors, data }, ref) => {
    const { t } = useTranslation();
    const styles = makeStyles(colors);
    // Falls back to the book glyph if the cover URL 404s or the host
    // doesn't send permissive-enough CORS headers for html2canvas to read
    // it back out on web (react-native-view-shot's web capture path) —
    // silently blank is worse than a clear placeholder on a shared image.
    const [coverFailed, setCoverFailed] = useState(false);
    const showCover = data.coverUrl && !coverFailed;
    // Only web needs the CORS proxy — native capture reads real view
    // layers, not a canvas snapshot of DOM images, so it never hits this.
    const coverSrc =
      Platform.OS === 'web' && data.coverUrl && !data.coverUrl.startsWith('data:')
        ? `${API_BASE}/api/image-proxy?url=${encodeURIComponent(data.coverUrl)}`
        : data.coverUrl;

    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        <LinearGradient
          colors={[colors.purple, colors.bg]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content}>
          <Text style={styles.kicker}>{t('book.share.kicker')}</Text>

          <View style={styles.coverWrap}>
            {showCover ? (
              <Image
                source={{ uri: coverSrc! }}
                style={styles.cover}
                onError={() => setCoverFailed(true)}
              />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]}>
                <Feather name="book" size={40} color="#FFFFFF" />
              </View>
            )}
          </View>

          <Text style={styles.title}>{data.title}</Text>
          {data.author ? <Text style={styles.author} numberOfLines={1}>{data.author}</Text> : null}

          {data.rating > 0 && (
            <View style={{ marginTop: 10 }}>
              <Stars rating={data.rating} />
            </View>
          )}

          {data.comment ? (
            <Text style={styles.comment}>&ldquo;{data.comment}&rdquo;</Text>
          ) : null}

          {data.journey.length > 0 && (
            <View style={styles.journeyRow}>
              {data.journey.map((entry, i) => (
                <View key={i} style={styles.journeyEntry}>
                  <Text style={styles.journeyEmoji}>{entry.emoji}</Text>
                  {entry.percent != null && (
                    <Text style={styles.journeyPercent}>{Math.round(entry.percent)}%</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          <View style={styles.statsRow}>
            {data.formats.slice(0, 3).map((f) => (
              <View key={f} style={styles.statChip}>
                <Feather name={FORMAT_ICON[f]} size={12} color="#FFFFFF" />
                <Text style={styles.statChipText}>{t(FORMAT_LABEL_KEY[f])}</Text>
              </View>
            ))}
            {data.readingSeconds > 0 && (
              <View style={styles.statChip}>
                <Feather name="clock" size={12} color="#FFFFFF" />
                <Text style={styles.statChipText}>{formatDuration(data.readingSeconds)}</Text>
              </View>
            )}
          </View>

          <View style={styles.brandRow}>
            <Feather name="book-open" size={14} color="rgba(255,255,255,0.85)" />
            <Text style={styles.brand}>Readigma</Text>
          </View>
        </View>
      </View>
    );
  },
);
ShareBookCard.displayName = 'ShareBookCard';
export default ShareBookCard;

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    card: {
      width: CARD_WIDTH,
      minHeight: CARD_MIN_HEIGHT,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.bg,
    },
    content: { padding: 22, alignItems: 'center', paddingBottom: 26 },
    kicker: {
      fontSize: 11,
      fontFamily: fonts.bodySemiBold,
      color: 'rgba(255,255,255,0.7)',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginTop: 6,
    },
    coverWrap: {
      marginTop: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 8,
    },
    cover: { width: 128, height: 188, borderRadius: 10 },
    coverPlaceholder: { backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    title: {
      fontSize: 19,
      fontFamily: fonts.headingBold,
      color: '#FFFFFF',
      textAlign: 'center',
      marginTop: 20,
      paddingHorizontal: 8,
    },
    author: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
    comment: {
      fontSize: 13,
      fontStyle: 'italic',
      color: 'rgba(255,255,255,0.92)',
      textAlign: 'center',
      marginTop: 14,
      lineHeight: 19,
      paddingHorizontal: 6,
    },
    journeyRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 10,
      marginTop: 16,
      paddingHorizontal: 6,
    },
    journeyEntry: { alignItems: 'center', gap: 2 },
    journeyEmoji: { fontSize: 22 },
    journeyPercent: { fontSize: 10, fontFamily: fonts.bodySemiBold, color: 'rgba(255,255,255,0.7)' },
    statsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 18 },
    statChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    statChipText: { fontSize: 11, fontFamily: fonts.bodySemiBold, color: '#FFFFFF' },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 22,
    },
    brand: {
      fontSize: 13,
      fontFamily: fonts.headingBold,
      color: 'rgba(255,255,255,0.85)',
      letterSpacing: 0.5,
    },
  });
