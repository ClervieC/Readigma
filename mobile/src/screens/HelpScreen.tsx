import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Linking, Alert } from 'react-native';
import { radius, ColorPalette } from '../theme';
import { useTheme } from '../contexts/theme.context';

const FAQ = [
  { q: 'Comment ajouter un livre à ma bibliothèque ?', a: 'Dans "Découvrir" ou "Chercher", appuie sur un livre pour voir ses détails, puis choisis son statut : À lire, En cours ou Lu.' },
  { q: 'Comment suivre ma progression de lecture ?', a: 'Ouvre un livre "En cours" depuis ta bibliothèque, puis utilise le bouton "Mettre à jour" pour saisir ta page actuelle ou ton pourcentage.' },
  { q: 'Comment ajouter des amis ?', a: 'Va dans Profil → Amis lecteurs → onglet "Chercher". Tape le nom d\'un utilisateur et envoie-lui une demande.' },
  { q: 'Le fil d\'actualité est vide, pourquoi ?', a: 'Le feed affiche l\'activité de tes amis. Commence par en ajouter via la section "Amis lecteurs" dans ton profil.' },
  { q: 'Comment définir un objectif de lecture ?', a: 'Profil → Reading Goal. Tu peux choisir un nombre de livres à lire sur l\'année et suivre ta progression mois par mois.' },
  { q: 'Comment fonctionne "Choisir pour moi" ?', a: 'Dans l\'onglet Découvrir, ce bouton pioche au hasard un livre dans ta pile "À lire". Il faut avoir des livres dans cette liste.' },
  { q: 'Comment réagir à ma lecture ?', a: 'Sur la page de détail d\'un livre en cours, tu peux ajouter des réactions (emoji + note) à n\'importe quelle page. Elles apparaissent dans le feed de tes amis.' },
  { q: 'Mes notifications ne fonctionnent pas.', a: 'Assure-toi d\'avoir autorisé les notifications pour Readigma dans les paramètres de ton téléphone. Les notifs push arrivent dès qu\'un ami t\'envoie une demande.' },
];

export default function HelpScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const contactAdmin = () => {
    const email = 'support@readigma.app';
    const subject = encodeURIComponent('Problème avec Readigma');
    Linking.openURL(`mailto:${email}?subject=${subject}`).catch(() =>
      Alert.alert('Email non disponible', `Écris-nous à : ${email}`)
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backBtn}>← Retour</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Aide</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>📖</Text>
          <Text style={styles.heroTitle}>Comment ça marche ?</Text>
          <Text style={styles.heroSub}>Tout ce qu'il faut savoir pour bien utiliser Readigma.</Text>
        </View>
        <Text style={styles.sectionTitle}>Questions fréquentes</Text>
        {FAQ.map((item, i) => (
          <TouchableOpacity key={i} style={styles.faqItem} activeOpacity={0.8} onPress={() => setOpenIndex(openIndex === i ? null : i)}>
            <View style={styles.faqHeader}>
              <Text style={styles.faqQ} numberOfLines={openIndex === i ? undefined : 2}>{item.q}</Text>
              <Text style={styles.faqChevron}>{openIndex === i ? '▲' : '▼'}</Text>
            </View>
            {openIndex === i && <Text style={styles.faqA}>{item.a}</Text>}
          </TouchableOpacity>
        ))}
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>Un problème non résolu ?</Text>
          <Text style={styles.contactSub}>Notre équipe répond généralement sous 48 h.</Text>
          <TouchableOpacity style={styles.contactBtn} onPress={contactAdmin} activeOpacity={0.85}>
            <Text style={styles.contactBtnText}>✉️  Contacter l'équipe</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorPalette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backBtn: { fontSize: 14, color: colors.lavender, fontWeight: '500' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  scroll: { flex: 1, paddingHorizontal: 16 },
  hero: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  heroEmoji: { fontSize: 48 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.white },
  heroSub: { fontSize: 13, color: colors.gray, textAlign: 'center', paddingHorizontal: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.white, marginBottom: 12 },
  faqItem: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.divider },
  faqHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.white },
  faqChevron: { fontSize: 10, color: colors.gray, marginTop: 3 },
  faqA: { fontSize: 13, color: colors.muted, marginTop: 10, lineHeight: 20 },
  contactCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 20, marginTop: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 8 },
  contactTitle: { fontSize: 16, fontWeight: '700', color: colors.white },
  contactSub: { fontSize: 13, color: colors.gray, textAlign: 'center' },
  contactBtn: { backgroundColor: colors.purple, borderRadius: radius.md, paddingHorizontal: 28, paddingVertical: 12, marginTop: 8 },
  contactBtnText: { color: 'white', fontSize: 14, fontWeight: '700' },
});
