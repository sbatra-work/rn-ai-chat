import { useCallback, useRef, type ReactElement } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Button } from '../../../components/Button';
import { spacing } from '../../../lib/theme';
import type { Message } from '../types';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: Message[];
  canRetry: boolean;
  onRetry: () => void;
  emptyState: ReactElement;
}

/** How close to the bottom still counts as "at the bottom", in points. */
const PINNED_THRESHOLD = 80;

const keyExtractor = (message: Message): string => message.id;
const renderItem = ({ item }: { item: Message }) => <MessageBubble message={item} />;

export function MessageList({ messages, canRetry, onRetry, emptyState }: Props) {
  const listRef = useRef<FlatList<Message>>(null);
  // Follow new text only while the user is at the bottom. If they scroll up
  // to read, the list stays put.
  const pinnedRef = useRef(true);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    pinnedRef.current = distanceFromBottom < PINNED_THRESHOLD;
  }, []);

  const followBottom = useCallback(() => {
    if (pinnedRef.current) listRef.current?.scrollToEnd({ animated: false });
  }, []);

  return (
    <FlatList
      ref={listRef}
      testID="message-list"
      data={messages}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onScroll={onScroll}
      scrollEventThrottle={32}
      onContentSizeChange={followBottom}
      onLayout={followBottom}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      ListEmptyComponent={emptyState}
      ListFooterComponent={
        canRetry ? (
          <View style={styles.footer}>
            <Button
              testID="retry-button"
              label="Retry"
              variant="secondary"
              onPress={onRetry}
              accessibilityHint="Asks for the answer again"
            />
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingVertical: spacing.md },
  footer: { alignItems: 'flex-start', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
