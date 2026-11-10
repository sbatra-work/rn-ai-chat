import { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, useTheme } from '../../../lib/theme';
import type { Message } from '../types';

function statusNote(message: Message): string | null {
  switch (message.status) {
    case 'cancelled':
      return 'Stopped';
    case 'refused':
      return 'Request declined';
    case 'error':
      return message.errorMessage ?? 'Something went wrong.';
    default:
      return null;
  }
}

function spokenLabel(message: Message, note: string | null): string {
  const speaker = message.role === 'user' ? 'You' : 'Assistant';
  if (message.status === 'streaming' && message.content === '') return 'Assistant is thinking';
  return [`${speaker}: ${message.content}`, note].filter(Boolean).join('. ');
}

/**
 * One message. Wrapped in `memo` so that while an answer streams in, only
 * the bubble that is changing re-renders.
 */
export const MessageBubble = memo(function MessageBubble({ message }: { message: Message }) {
  const { colors } = useTheme();
  const isUser = message.role === 'user';
  const isThinking = message.status === 'streaming' && message.content === '';
  const note = statusNote(message);
  const isError = message.status === 'error';

  return (
    <View
      testID={`message-${message.role}`}
      accessible
      accessibilityLabel={spokenLabel(message, note)}
      style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}
    >
      {(message.content !== '' || isThinking) && (
        <View
          style={[
            styles.bubble,
            { backgroundColor: isUser ? colors.userBubble : colors.assistantBubble },
          ]}
        >
          {isThinking ? (
            <ActivityIndicator color={colors.textMuted} />
          ) : (
            <Text
              selectable
              style={[
                styles.text,
                { color: isUser ? colors.onUserBubble : colors.onAssistantBubble },
              ]}
            >
              {message.content}
              {message.status === 'streaming' ? ' ▍' : ''}
            </Text>
          )}
        </View>
      )}
      {note !== null && (
        <Text style={[styles.note, { color: isError ? colors.danger : colors.textMuted }]}>
          {note}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, gap: spacing.xs },
  rowUser: { alignItems: 'flex-end' },
  rowAssistant: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '86%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  // No fixed heights anywhere in the bubble, so it grows with the user's text size.
  text: { fontSize: 16, lineHeight: 22 },
  note: { fontSize: 13, paddingHorizontal: spacing.xs },
});
