import { useHeaderHeight } from 'expo-router/react-navigation';
import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '../../features/chat/screens/ChatScreen';

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const headerHeight = useHeaderHeight();
  return <ChatScreen conversationId={id} keyboardOffset={headerHeight} />;
}
