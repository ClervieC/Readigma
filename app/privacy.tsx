import { View, Text, StyleSheet } from 'react-native';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import Screen from '../components/Screen';

const SECTIONS = [
  {
    title: 'Données collectées',
    body: "Readigma stocke ton adresse e-mail, ton nom d'utilisateur, ta photo de profil, ta bibliothèque (livres, statuts, notes, commentaires), tes réactions de lecture, ton temps de lecture, tes objectifs annuels et tes relations d'amitié avec d'autres utilisateurs.",
  },
  {
    title: 'Utilisation des données',
    body: "Ces données servent uniquement à faire fonctionner l'application : afficher ta bibliothèque, ton fil d'actualité, tes statistiques de lecture et les profils de tes amis lecteurs. Readigma ne vend ni ne partage tes données avec des tiers à des fins publicitaires.",
  },
  {
    title: 'Visibilité de tes informations',
    body: "Ton nom d'utilisateur et ton avatar sont visibles par tout utilisateur inscrit (recherche d'amis). Ton activité de lecture (livres terminés, réactions, mises à jour de progression) n'est visible que par les amis que tu as ajoutés et acceptés.",
  },
  {
    title: 'Services externes',
    body: "Les couvertures et informations de livres proviennent d'Open Library, de la Bibliothèque nationale de France (BnF) et de Google Books. Readigma utilise Supabase pour l'hébergement des données et l'authentification, et Expo pour les notifications push.",
  },
  {
    title: 'Conservation et suppression',
    body: "Tes données sont conservées tant que ton compte existe. Pour supprimer ton compte et l'ensemble de tes données, écris-nous depuis la page Aide & Contact.",
  },
  {
    title: 'Tes droits',
    body: "Tu peux à tout moment demander l'accès, la correction ou la suppression de tes données personnelles en nous contactant via Profil → Aide & Contact.",
  },
];

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Screen back title="Confidentialité">
      <Text style={styles.updated}>Dernière mise à jour : juillet 2026</Text>
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
