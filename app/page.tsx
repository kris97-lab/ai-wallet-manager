import { ChatInterface } from '@/components/chat/chat-interface';

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <ChatInterface className="h-screen" />
    </div>
  );
}
