import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { useServices } from '../../../lib/services';
import { spacing, useTheme } from '../../../lib/theme';
import { ConversationRow } from '../components/ConversationRow';
import type { ConversationSummary } from '../types';

interface Props {
  onOpen: (conversationId: string) => void;
  onNew: () => void;
  /** Change this value to make the list reload, for example on screen focus. */
  refreshKey?: number;
}

export function ConversationListScreen({ onOpen, onNew, refreshKey = 0 }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { repository } = useServices();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);

  // Bumped after a delete, so the effect below reads the list again.
  const [deleteCount, setDeleteCount] = useState(0);

  useEffect(() => {
    let active = true;
    repository
      .listConversations()
      .catch(() => [])
      .then((list) => active && setConversations(list));
    return () => {
      active = false;
    };
  }, [repository, refreshKey, deleteCount]);

  const confirmDelete = useCallback(
    (conversation: ConversationSummary) => {
      Alert.alert(
        'Delete this chat?',
        `"${conversation.title}" will be removed from this device.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () =>
              void repository
                .deleteConversation(conversation.id)
                .catch(() => {})
                .then(() => setDeleteCount((count) => count + 1)),
          },
        ],
      );
    },
    [repository],
  );

  if (conversations === null) {
    return <View style={[styles.screen, { backgroundColor: colors.background }]} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        testID="conversation-list"
        data={conversations}
        keyExtractor={(conversation) => conversation.id}
        renderItem={({ item }) => (
          <ConversationRow conversation={item} onOpen={onOpen} onDelete={confirmDelete} />
        )}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <EmptyState
            title="No chats yet"
            body="Start a chat and it will be saved on this device, so you can read it again without a connection."
          />
        }
      />
      <View
        style={[
          styles.footer,
          { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) },
        ]}
      >
        <Button testID="new-chat-button" label="New chat" onPress={onNew} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
