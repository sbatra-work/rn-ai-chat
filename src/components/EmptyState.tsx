import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../lib/theme';

interface Props {
  title: string;
  body: string;
  children?: ReactNode;
}

export function EmptyState({ title, body, children }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {title}
      </Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
});
