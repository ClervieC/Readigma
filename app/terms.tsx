import { View, Text, StyleSheet } from 'react-native';
import { fonts, ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';
import Screen from '../components/Screen';

const SECTIONS = [
  {
    title: '1. Acceptation des conditions',
    body: "En créant un compte Readigma, tu acceptes les présentes conditions d'utilisation. Si tu n'es pas d'accord, merci de ne pas utiliser l'application.",
  },
  {
    title: '2. Ton compte',
    body: "Tu es responsable de la confidentialité de tes identifiants et de l'exactitude des informations fournies (nom d'utilisateur, e-mail). Un seul compte par personne.",
  },
  {
    title: '3. Contenu que tu publies',
    body: "Tes commentaires, notes, réactions et messages restent ta propriété, mais tu autorises Readigma à les afficher aux autres utilisateurs conformément à tes réglages de confidentialité (ex : visibilité aux amis). Tu t'engages à ne publier aucun contenu illégal, injurieux ou portant atteinte aux droits d'autrui.",
  },
  {
    title: '4. Catalogue de livres',
    body: "Les informations sur les livres (titres, couvertures, descriptions) proviennent de sources tierces (Open Library, BnF, Google Books) et sont fournies à titre indicatif. Readigma ne garantit pas leur exactitude.",
  },
  {
    title: '5. Comportement attendu',
    body: "Le harcèlement, le spam et l'usurpation d'identité sont interdits. Un compte enfreignant ces règles peut être suspendu ou supprimé sans préavis.",
  },
  {
    title: '6. Disponibilité du service',
    body: "Readigma est fourni \"tel quel\", sans garantie de disponibilité continue. Des interruptions ou évolutions du service peuvent survenir à tout moment.",
  },
  {
    title: '7. Modifications',
    body: "Ces conditions peuvent être mises à jour. Les changements importants seront communiqués via l'application.",
  },
  {
    title: '8. Contact',
    body: "Pour toute question, écris-nous depuis Profil → Aide & Contact.",
  },
];

export default function TermsScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <Screen back title="Conditions d'utilisation">
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
