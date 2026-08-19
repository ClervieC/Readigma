import { TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';

// Replaces the old "Chercher" tab — search is reached from this single icon,
// always to the left of NotificationBell, on every screen that had the tab
// bar's search tab before.
export default function SearchButton() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      onPress={() => router.push('/search')}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={t('search.title')}
    >
      <Feather name="search" size={20} color={colors.white} />
    </TouchableOpacity>
  );
}
