import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banner } from '../../../components/Banner';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { spacing, useTheme } from '../../../lib/theme';
import { useIsOnline } from '../../../lib/useIsOnline';
import { Composer } from '../components/Composer';
import { MessageList } from '../components/MessageList';
import { useChat } from '../hooks/useChat';

interface Props {
  conversationId: string;
  /** Height of the navigation header, so the keyboard does not cover the composer. */
  keyboardOffset?: number;
}

const SUGGESTIONS = ['How does streaming work?', 'What happens when I am offline?'];

export function ChatScreen({ conversationId, keyboardOffset = 0 }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useIsOnline();
  const chat = useChat(conversationId);

  if (!chat.loaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator accessibilityLabel="Loading conversation" color={colors.textMuted} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardOffset}
    >
      {!online && (
        <Banner
          testID="offline-banner"
          message="You are offline. Your chats are saved. Sending is paused."
        />
      )}
      <MessageList
        messages={chat.messages}
        canRetry={chat.canRetry && online}
        onRetry={chat.retry}
        emptyState={
          <EmptyState
            title="Ask anything"
            body="Answers appear word by word as they are written. You can stop one at any time."
          >
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  label={suggestion}
                  variant="secondary"
                  disabled={!online}
                  onPress={() => chat.send(suggestion)}
                />
              ))}
            </View>
          </EmptyState>
        }
      />
      <View style={{ paddingBottom: Math.max(insets.bottom, spacing.sm) }}>
        <Composer
          streaming={chat.streaming}
          disabledReason={online ? undefined : 'You are offline'}
          onSend={chat.send}
          onCancel={chat.cancel}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  suggestions: { gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.sm },
});
