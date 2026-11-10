import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ConversationListScreen } from '../features/chat/screens/ConversationListScreen';
import { useServices } from '../lib/services';

export default function ConversationListRoute() {
  const router = useRouter();
  const { newId } = useServices();
  const [focusCount, setFocusCount] = useState(0);

  // Reload when coming back from a chat, so new messages show in the list.
  useFocusEffect(useCallback(() => setFocusCount((count) => count + 1), []));

  const open = useCallback(
    (id: string) => router.push({ pathname: '/chat/[id]', params: { id } }),
    [router],
  );

  return (
    <ConversationListScreen
      refreshKey={focusCount}
      onOpen={open}
      // A new chat is only an ID until its first message is saved.
      onNew={() => open(newId())}
    />
  );
}
