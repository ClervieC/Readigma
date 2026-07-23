import { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { fonts, radius, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';

const { width } = Dimensions.get('window');

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { completeOnboarding } = useAuth();
  const router = useRouter();
  const styles = makeStyles(colors);
  const { t } = useTranslation();

  const STEPS: { icon: keyof typeof Feather.glyphMap; iconColor: string; titleKey: string; descKey: string }[] = [
    { icon: 'feather', iconColor: colors.lavender, titleKey: 'onboarding.steps.welcome.title', descKey: 'onboarding.steps.welcome.desc' },
    { icon: 'shuffle', iconColor: colors.teal, titleKey: 'onboarding.steps.discover.title', descKey: 'onboarding.steps.discover.desc' },
    { icon: 'book-open', iconColor: colors.lavender, titleKey: 'onboarding.steps.library.title', descKey: 'onboarding.steps.library.desc' },
    { icon: 'award', iconColor: colors.warning, titleKey: 'onboarding.steps.decorations.title', descKey: 'onboarding.steps.decorations.desc' },
    { icon: 'message-circle', iconColor: colors.pink, titleKey: 'onboarding.steps.reactions.title', descKey: 'onboarding.steps.reactions.desc' },
    { icon: 'users', iconColor: colors.success, titleKey: 'onboarding.steps.friends.title', descKey: 'onboarding.steps.friends.desc' },
  ];

  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const dotAnim = useRef(STEPS.map(() => new Animated.Value(0))).current;

  const onDone = () => {
    completeOnboarding();
    router.replace('/(tabs)');
  };

  const goTo = (index: number) => {
    setStep(index);
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    STEPS.forEach((_, i) => {
      Animated.spring(dotAnim[i], { toValue: i === index ? 1 : 0, useNativeDriver: false }).start();
    });
  };

  const next = () => step < STEPS.length - 1 ? goTo(step + 1) : onDone();
  const isLast = step === STEPS.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.skipRow}>
        {!isLast && (
          <TouchableOpacity onPress={onDone}>
            <Text style={styles.skip}>{t('onboarding.skip')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView ref={scrollRef} horizontal pagingEnabled scrollEnabled={false}
        showsHorizontalScrollIndicator={false} style={styles.slides}>
        {STEPS.map((s, i) => (
          <View key={i} style={styles.slide}>
            <View style={[styles.iconCircle, { borderColor: s.iconColor + '40' }]}>
              <View style={[styles.iconInner, { backgroundColor: s.iconColor + '18' }]}>
                <Feather name={s.icon} size={38} color={s.iconColor} />
              </View>
            </View>
            <Text style={styles.title}>{t(s.titleKey)}</Text>
            <Text style={styles.desc}>{t(s.descKey)}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {STEPS.map((_, i) => {
            const w = dotAnim[i].interpolate({ inputRange: [0, 1], outputRange: [6, 22] });
            const bg = dotAnim[i].interpolate({ inputRange: [0, 1], outputRange: [colors.gray, colors.lavender] });
            return (
              <TouchableOpacity key={i} onPress={() => goTo(i)}>
                <Animated.View style={[styles.dot, { width: w, backgroundColor: bg }]} />
              </TouchableOpacity>
            );
          })}
        </View>
        <Button label={isLast ? t('onboarding.done') : t('onboarding.next')} onPress={next} />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  skipRow: { alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 16, height: 44 },
  skip: { fontSize: 13, color: colors.gray },
  slides: { flex: 1 },
  slide: { width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  iconCircle: { width: 132, height: 132, borderRadius: 66, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  iconInner: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontFamily: fonts.headingBold, color: colors.white, textAlign: 'center', lineHeight: 34, marginBottom: 18 },
  desc: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  footer: { paddingHorizontal: 24, paddingBottom: 36, gap: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
});
