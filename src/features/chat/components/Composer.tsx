import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { LIMITS } from '../../../../shared/protocol';
import { Button } from '../../../components/Button';
import { MIN_TOUCH_SIZE, radius, spacing, useTheme } from '../../../lib/theme';

interface Props {
  streaming: boolean;
  /** When set, sending is off and this is read out as the reason. */
  disabledReason?: string;
  onSend: (text: string) => void;
  onCancel: () => void;
}

/** Show the counter once the message is this close to the cap. */
const COUNTER_FROM = LIMITS.maxMessageChars * 0.8;

export function Composer({ streaming, disabledReason, onSend, onCancel }: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState('');

  const tooLong = text.length > LIMITS.maxMessageChars;
  const canSend = text.trim() !== '' && !tooLong && disabledReason === undefined;

  function submit(): void {
    if (!canSend) return;
    onSend(text);
    setText('');
  }

  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      {text.length >= COUNTER_FROM && (
        <Text
          testID="char-counter"
          accessibilityLiveRegion="polite"
          style={[styles.counter, { color: tooLong ? colors.danger : colors.textMuted }]}
        >
          {tooLong
            ? `Too long: ${text.length} of ${LIMITS.maxMessageChars} characters`
            : `${text.length} of ${LIMITS.maxMessageChars} characters`}
        </Text>
      )}
      <View style={styles.row}>
        <TextInput
          testID="composer-input"
          value={text}
          onChangeText={setText}
          placeholder="Ask a question"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Message"
          accessibilityHint="Type your question"
          multiline
          style={[
            styles.input,
            { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        />
        {streaming ? (
          <Button
            testID="stop-button"
            label="Stop"
            variant="secondary"
            onPress={onCancel}
            accessibilityHint="Stops the answer"
          />
        ) : (
          <Button
            testID="send-button"
            label="Send"
            onPress={submit}
            disabled={!canSend}
            accessibilityHint={disabledReason}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH_SIZE,
    maxHeight: 160,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    lineHeight: 22,
  },
  counter: { fontSize: 13, textAlign: 'right', paddingHorizontal: spacing.xs },
});
