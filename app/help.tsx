import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import Screen from '../components/Screen';

export default function HelpScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const FAQ = t('help.faq', { returnObjects: true }) as { q: string; a: string }[];
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <Screen back title={t('help.title')}>
      <View style={styles.hero}>
        <Feather name="help-circle" size={28} color={colors.purple} />
        <Text style={styles.heroTitle}>{t('help.heroTitle')}</Text>
        <Text style={styles.heroSub}>{t('help.heroSub')}</Text>
      </View>

      <Text style={styles.sectionTitle}>{t('help.sectionTitle')}</Text>
      {FAQ.map((item, i) => (
        <TouchableOpacity key={i} style={[styles.faqItem, i < FAQ.length - 1 && styles.divider]} activeOpacity={0.7} onPress={() => setOpenIndex(openIndex === i ? null : i)}>
          <View style={styles.faqHeader}>
            <Text style={styles.faqQ} numberOfLines={openIndex === i ? undefined : 2}>{item.q}</Text>
            <Feather name={openIndex === i ? 'chevron-up' : 'chevron-down'} size={16} color={colors.gray} />
          </View>
          {openIndex === i && <Text style={styles.faqA}>{item.a}</Text>}
        </TouchableOpacity>
      ))}

      <View style={styles.contactCard}>
        <Text style={styles.contactTitle}>{t('help.contactTitle')}</Text>
        <Text style={styles.contactSub}>{t('help.contactSub')}</Text>
        <TouchableOpacity style={styles.contactBtn} onPress={() => router.push('/contact')}>
          <Feather name="message-circle" size={16} color="#FFFFFF" />
          <Text style={styles.contactBtnText}>{t('help.contactBtn')}</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  heroTitle: { fontSize: 19, fontFamily: fonts.headingBold, color: colors.white },
  heroSub: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 24 },
  sectionTitle: { fontSize: 12, fontFamily: fonts.headingBold, color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  faqItem: { paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  faqHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.white },
  faqA: { fontSize: 13, color: colors.muted, marginTop: 10, lineHeight: 20 },
  contactCard: { alignItems: 'center', gap: 6, paddingVertical: 28, marginTop: 12, borderTopWidth: 1, borderTopColor: colors.divider },
  contactTitle: { fontSize: 15, fontFamily: fonts.headingBold, color: colors.white },
  contactSub: { fontSize: 13, color: colors.gray, textAlign: 'center' },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    backgroundColor: colors.purple, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12,
  },
  contactBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
