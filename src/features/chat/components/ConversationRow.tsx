import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDay } from '../../../lib/formatDay';
import { MIN_TOUCH_SIZE, spacing, useTheme } from '../../../lib/theme';
import type { ConversationSummary } from '../types';

interface Props {
  conversation: ConversationSummary;
  onOpen: (id: string) => void;
  onDelete: (conversation: ConversationSummary) => void;
}

export const ConversationRow = memo(function ConversationRow({
  conversation,
  onOpen,
  onDelete,
}: Props) {
  const { colors } = useTheme();
  const day = formatDay(conversation.updatedAt);

  return (
    <Pressable
      testID="conversation-row"
      onPress={() => onOpen(conversation.id)}
      onLongPress={() => onDelete(conversation)}
      accessibilityRole="button"
      accessibilityLabel={`${conversation.title}, ${day}`}
      accessibilityHint="Opens the conversation. Long press to delete."
      // Lets VoiceOver and TalkBack users delete without a long press.
      accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'delete') onDelete(conversation);
      }}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.surface },
      ]}
    >
      <View style={styles.titleLine}>
        <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
          {conversation.title}
        </Text>
        <Text style={[styles.day, { color: colors.textMuted }]}>{day}</Text>
      </View>
      {conversation.preview !== '' && (
        <Text numberOfLines={2} style={[styles.preview, { color: colors.textMuted }]}>
          {conversation.preview}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH_SIZE,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  title: { flex: 1, fontSize: 17, fontWeight: '600' },
  day: { fontSize: 13 },
  preview: { fontSize: 15, lineHeight: 20 },
});
