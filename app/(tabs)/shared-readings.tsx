import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, radius, shadows, ColorPalette } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import * as sharedReadings from '../../lib/sharedReadings';
import Screen from '../../components/Screen';
import Pill from '../../components/Pill';

function ReadingCard({ reading, colors, styles }: { reading: sharedReadings.SharedReading; colors: ColorPalette; styles: any }) {
  const router = useRouter();
  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/shared-readings/${reading.id}`)}>
      <View style={styles.cover}>
        {reading.book?.cover_url ? (
          <Image source={{ uri: reading.book.cover_url }} style={styles.coverImg} />
        ) : (
          <Feather name="book" size={20} color={colors.purple} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{reading.book?.title}</Text>
        <Text style={styles.cardAuthor} numberOfLines={1}>{reading.book?.author}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={colors.gray} />
    </TouchableOpacity>
  );
}

export default function SharedReadingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const styles = makeStyles(colors);
  const [tab, setTab] = useState<'mine' | 'browse'>('mine');
  const [mine, setMine] = useState<sharedReadings.SharedReading[]>([]);
  const [browse, setBrowse] = useState<sharedReadings.SharedReading[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      Promise.all([
        sharedReadings.getMySharedReadings().catch(() => []),
        sharedReadings.listPublicSharedReadings().catch(() => []),
      ]).then(([m, b]) => {
        setMine(m);
        setBrowse(b);
        setLoading(false);
      });
    }, []),
  );

  const list = tab === 'mine' ? mine : browse;

  return (
    <Screen title={t('sharedReadings.title')} atmosphere="purple" right={
      <TouchableOpacity onPress={() => router.push('/shared-readings/create')} hitSlop={8}>
        <Feather name="plus" size={20} color={colors.purple} />
      </TouchableOpacity>
    }>
      <View style={styles.tabs}>
        <Pill label={t('sharedReadings.tabMine')} accessibilityLabel={t('sharedReadings.tabMine')} active={tab === 'mine'} onPress={() => setTab('mine')} />
        <Pill label={t('sharedReadings.tabBrowse')} accessibilityLabel={t('sharedReadings.tabBrowse')} active={tab === 'browse'} onPress={() => setTab('browse')} />
      </View>

      {loading ? (
        <Text style={styles.emptyText}>{t('feed.loading')}</Text>
      ) : list.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="users" size={36} color={colors.gray} />
          <Text style={styles.emptyText}>
            {tab === 'mine' ? t('sharedReadings.noneMine') : t('sharedReadings.noneBrowse')}
          </Text>
        </View>
      ) : (
        list.map((r) => <ReadingCard key={r.id} reading={r} colors={colors} styles={styles} />)
      )}
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 10,
      ...shadows.card,
    },
    cover: { width: 44, height: 64, borderRadius: 6, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    coverImg: { width: '100%', height: '100%' },
    cardTitle: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.white },
    cardAuthor: { fontSize: 12, color: colors.gray, marginTop: 2 },
    emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyText: { fontSize: 13, color: colors.gray, textAlign: 'center' },
  });
