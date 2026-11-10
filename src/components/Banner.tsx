import { StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme } from '../lib/theme';

interface Props {
  message: string;
  testID?: string;
}

/** A full-width notice. Screen readers announce it when it appears. */
export function Banner({ message, testID }: Props) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: colors.warningSurface }]}
    >
      <Text style={[styles.text, { color: colors.onWarningSurface }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  text: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
});
