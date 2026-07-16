import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import Screen from '../components/Screen';

const FAQ = [
  { q: 'Comment ajouter un livre à ma bibliothèque ?', a: 'Dans "Découvrir" ou "Chercher", appuie sur un livre pour voir ses détails, puis choisis son statut : À lire, En cours ou Lu.' },
  { q: 'Comment suivre ma progression de lecture ?', a: 'Ouvre un livre depuis ta bibliothèque, puis utilise le chrono ou le bouton "Mettre à jour" pour saisir ta page actuelle ou ton pourcentage.' },
  { q: 'Comment ajouter des amis ?', a: 'Va dans Profil → Amis lecteurs → onglet "Chercher". Tape le nom d\'un utilisateur et envoie-lui une demande.' },
  { q: 'Le fil d\'actualité est vide, pourquoi ?', a: 'Le feed affiche l\'activité de tes amis. Commence par en ajouter via la section "Amis lecteurs" dans ton profil.' },
  { q: 'Comment définir un objectif de lecture ?', a: 'Profil → Reading Goal. Tu peux choisir un nombre de livres à lire sur l\'année et suivre ta progression mois par mois.' },
  { q: 'Comment fonctionne "Choisir pour moi" ?', a: 'Dans l\'onglet Découvrir, ce bouton pioche au hasard un livre dans ta pile "À lire". Il faut avoir des livres dans cette liste.' },
  { q: 'Comment réagir à ma lecture ?', a: 'Sur la page de détail d\'un livre, tu peux ajouter des réactions (emoji + note) à n\'importe quelle page. Elles apparaissent dans le feed de tes amis.' },
  { q: 'Mes notifications ne fonctionnent pas.', a: 'Assure-toi d\'avoir autorisé les notifications pour Readigma dans les paramètres de ton téléphone. Les notifs push arrivent dès qu\'un ami t\'envoie une demande.' },
];

export default function HelpScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const styles = makeStyles(colors);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <Screen back title="Aide">
      <View style={styles.hero}>
        <Feather name="help-circle" size={28} color={colors.purple} />
        <Text style={styles.heroTitle}>Comment ça marche ?</Text>
        <Text style={styles.heroSub}>Tout ce qu'il faut savoir pour bien utiliser Readigma.</Text>
      </View>

      <Text style={styles.sectionTitle}>Questions fréquentes</Text>
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
        <Text style={styles.contactTitle}>Un problème non résolu ?</Text>
        <Text style={styles.contactSub}>Écris-nous, notre équipe répond généralement sous 48 h.</Text>
        <TouchableOpacity style={styles.contactBtn} onPress={() => router.push('/contact')}>
          <Feather name="message-circle" size={16} color="#FFFFFF" />
          <Text style={styles.contactBtnText}>Contacter l'équipe</Text>
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
