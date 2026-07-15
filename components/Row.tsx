import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ColorPalette } from '../theme';
import { useTheme } from '../context/ThemeContext';

type RowProps = {
  onPress?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
  chevron?: boolean;
  last?: boolean;
};

// One hairline-divided row — the building block for every list in the app
// (settings, friends, library, notifications) instead of each item being
// its own bordered card.
export default function Row({ onPress, icon, children, right, chevron, last }: RowProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const Wrapper: any = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      style={[styles.row, !last && styles.divider]}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : undefined}
    >
      {icon}
      <View style={styles.body}>{children}</View>
      {right}
      {chevron && <Feather name="chevron-right" size={18} color={colors.gray} />}
    </Wrapper>
  );
}

const makeStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    body: { flex: 1, minWidth: 0 },
  });
