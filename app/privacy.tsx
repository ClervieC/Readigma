import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import Screen from '../components/Screen';

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { t } = useTranslation();
  const SECTIONS = t('privacy.sections', { returnObjects: true }) as { title: string; body: string }[];

  return (
    <Screen back title={t('privacy.title')}>
      <Text style={styles.updated}>{t('privacy.updated')}</Text>
      {SECTIONS.map((s, i) => (
        <View key={i} style={styles.section}>
          <Text style={styles.sectionTitle}>{s.title}</Text>
          <Text style={styles.sectionBody}>{s.body}</Text>
        </View>
      ))}
    </Screen>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  updated: { fontSize: 11, color: colors.gray, marginBottom: 20 },
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 14, fontFamily: fonts.headingBold, color: colors.white, marginBottom: 6 },
  sectionBody: { fontSize: 13, color: colors.muted, lineHeight: 20 },
});
