import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { MIN_TOUCH_SIZE, radius, spacing, useTheme } from '../lib/theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  /** Extra context for screen readers, read after the label. */
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: Props) {
  const { colors } = useTheme();
  const background =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.surface;
  const foreground =
    variant === 'primary'
      ? colors.onPrimary
      : variant === 'danger'
        ? colors.background
        : colors.text;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: colors.border },
        variant === 'secondary' && styles.outlined,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_SIZE,
    minWidth: MIN_TOUCH_SIZE,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlined: { borderWidth: StyleSheet.hairlineWidth },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  label: { fontSize: 16, fontWeight: '600' },
});
