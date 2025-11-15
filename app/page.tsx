import { ChatInterface } from '@/components/chat/chat-interface';
import { FeedSidebar } from '@/components/polymarket/FeedSidebar';

export default function Home() {
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-1 flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex-1 lg:pr-8">
          <ChatInterface className="w-full flex-1" />
        </div>
        <FeedSidebar className="mt-8 lg:mt-0 lg:flex-none" />
      </div>
    </div>
  );
}
