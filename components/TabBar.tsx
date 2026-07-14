import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ColorPalette, fonts } from '../theme';
import { useTheme } from '../context/ThemeContext';

const TABS: { name: string; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { name: 'index', label: 'Découvrir', icon: 'compass' },
  { name: 'feed', label: 'Fil', icon: 'activity' },
  { name: 'library', label: 'Biblio', icon: 'book-open' },
  { name: 'search', label: 'Chercher', icon: 'search' },
  { name: 'profile', label: 'Profil', icon: 'user' },
];

// expo-router's Tabs vendors its own copy of react-navigation/bottom-tabs
// (not a separate installable package in SDK 57), so this types the
// `tabBar` render-prop shape locally rather than importing from expo-router's
// internal build paths, which aren't part of its public API.
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

export default function TabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.wrapper}>
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.name === route.name) ?? TABS[index];
        const focused = state.index === index;

        return (
          <TouchableOpacity
            key={route.key}
            style={styles.item}
            onPress={() => navigation.navigate(route.name)}
            activeOpacity={0.6}
          >
            <Feather name={tab.icon} size={20} color={focused ? colors.purple : colors.gray} />
            <Text style={[styles.label, focused && styles.labelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    wrapper: {
      flexDirection: 'row',
      backgroundColor: colors.bg,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      paddingTop: 10,
      paddingBottom: 28,
    },
    item: { flex: 1, alignItems: 'center', gap: 5 },
    label: { fontSize: 10, color: colors.gray, fontFamily: fonts.body, letterSpacing: 0.2 },
    labelActive: { color: colors.purple, fontWeight: '600' },
  });
