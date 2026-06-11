import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, Dimensions, ScrollView, Animated,
} from 'react-native';
import { radius, ColorPalette } from '../theme';
import { useTheme } from '../contexts/theme.context';

const { width } = Dimensions.get('window');

export default function OnboardingScreen({ onDone }: any) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const STEPS = [
    { icon: '✦', iconColor: colors.lavender, title: 'Bienvenue sur\nReadigma', desc: 'Ton compagnon de lecture. Suis ta progression, découvre de nouveaux livres et partage ton aventure littéraire.' },
    { icon: '🎲', iconColor: colors.cyan, title: 'Découvre\nton prochain livre', desc: 'Tu ne sais pas quoi lire ? Lance le dé ! Readigma pioche dans ta pile "À lire" et te fait une suggestion au hasard.' },
    { icon: '📚', iconColor: colors.lavender, title: 'Gère ta\nbibliothèque', desc: 'Organise tes livres par statut : À lire, En cours, Terminé ou Abandonné. Tout ton univers littéraire en un endroit.' },
    { icon: '💭', iconColor: colors.pink, title: 'Réactions\nen temps réel', desc: 'Note tes émotions au fil de ta lecture avec des emojis et des notes. Crée ton journal de bord de lecteur.' },
    { icon: '👥', iconColor: colors.success, title: 'Lis avec\ntes amis', desc: 'Connecte-toi avec tes amis lecteurs, vois ce qu\'ils lisent et partage tes coups de cœur dans le fil d\'actualité.' },
  ];

  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const dotAnim = useRef(STEPS.map(() => new Animated.Value(0))).current;

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
            <Text style={styles.skip}>Passer →</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView ref={scrollRef} horizontal pagingEnabled scrollEnabled={false}
        showsHorizontalScrollIndicator={false} style={styles.slides}>
        {STEPS.map((s, i) => (
          <View key={i} style={styles.slide}>
            <View style={[styles.iconCircle, { borderColor: s.iconColor + '40' }]}>
              <View style={[styles.iconInner, { backgroundColor: s.iconColor + '18' }]}>
                <Text style={[styles.icon, { color: s.iconColor }]}>{s.icon}</Text>
              </View>
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.desc}>{s.desc}</Text>
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
        <TouchableOpacity style={styles.btn} onPress={next} activeOpacity={0.85}>
          <Text style={styles.btnText}>{isLast ? 'C\'est parti ! 🚀' : 'Suivant'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  skipRow: { alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 8, height: 36 },
  skip: { fontSize: 13, color: colors.gray },
  slides: { flex: 1 },
  slide: { width, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  iconCircle: { width: 140, height: 140, borderRadius: 70, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  iconInner: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 44 },
  title: { fontSize: 30, fontWeight: '800', color: colors.white, textAlign: 'center', lineHeight: 38, marginBottom: 20, letterSpacing: -0.5 },
  desc: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 24 },
  footer: { paddingHorizontal: 24, paddingBottom: 36, gap: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  btn: { backgroundColor: colors.purple, borderRadius: radius.lg, padding: 18, alignItems: 'center' },
  btnText: { color: 'white', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
});
