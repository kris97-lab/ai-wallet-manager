"use client";

import { ChatInterface } from '@/components/chat/chat-interface';
import { ChatHistoryPanel } from '@/components/chat/ChatHistoryPanel';
import { FeedSidebar } from '@/components/polymarket/FeedSidebar';
import { useActiveAccount } from 'thirdweb/react';

export default function Home() {
  const activeAccount = useActiveAccount();
  const isWalletConnected = Boolean(activeAccount);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-1 flex-col gap-8 lg:grid lg:grid-cols-[280px_1fr_auto] lg:items-start lg:gap-8">
        <ChatHistoryPanel
          isWalletConnected={isWalletConnected}
          walletAddress={activeAccount?.address ?? null}
        />
        <div className="min-w-0 flex flex-1">
          <ChatInterface className="w-full flex-1" />
        </div>
        <FeedSidebar className="mt-8 lg:mt-0 lg:flex-none" isWalletConnected={isWalletConnected} />
      </div>
    </div>
  );
}
