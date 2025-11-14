import { ChatInterface } from '@/components/chat/chat-interface';

export default function Home() {
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <ChatInterface className="w-full flex-1" />
    </div>
  );
}
