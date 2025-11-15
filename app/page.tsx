"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChatInterface, type ChatInterfaceHandle } from "@/components/chat/chat-interface";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import { ChatHistoryToggle } from "@/components/chat/ChatHistoryToggle";
import { FeedSidebar } from "@/components/polymarket/FeedSidebar";
import { useActiveAccount } from "thirdweb/react";
import type { TradePromptPayload } from "@/types/chat";

export default function Home() {
  const activeAccount = useActiveAccount();
  const isWalletConnected = Boolean(activeAccount);
  const [showChatHistory, setShowChatHistory] = useState(true);
  const [hasManualToggle, setHasManualToggle] = useState(false);
  const chatInterfaceRef = useRef<ChatInterfaceHandle>(null);

  const handleTradeViaAI = useCallback((payload: TradePromptPayload) => {
    chatInterfaceRef.current?.handleExternalTrade(payload);
  }, []);

  useEffect(() => {
    if (!isWalletConnected) {
      setShowChatHistory(false);
      setHasManualToggle(false);
    } else if (!hasManualToggle) {
      setShowChatHistory(true);
    }
  }, [hasManualToggle, isWalletConnected]);

  const leftColumnWidth = isWalletConnected && showChatHistory ? 260 : 0;
  const rightColumnWidth = isWalletConnected ? 380 : 0;
  const gridTemplateColumns = `${leftColumnWidth}px 1fr ${rightColumnWidth}px`;

  const handleToggleHistory = () => {
    if (!isWalletConnected) {
      return;
    }
    setHasManualToggle(true);
    setShowChatHistory(prev => !prev);
  };

  return (
    <div className="relative mx-auto flex h-screen w-full max-w-[2000px] overflow-hidden px-4 py-4 sm:px-6">
      <ChatHistoryToggle
        isOpen={showChatHistory && isWalletConnected}
        onToggle={handleToggleHistory}
        disabled={!isWalletConnected}
      />
      <div
        className="grid h-full w-full items-start gap-4 transition-all duration-300 ease-in-out"
        style={{ gridTemplateColumns }}
      >
        <ChatHistoryPanel
          isWalletConnected={isWalletConnected}
          walletAddress={activeAccount?.address ?? null}
          isVisible={isWalletConnected && showChatHistory}
          className="h-full"
        />
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <ChatInterface ref={chatInterfaceRef} className="h-full w-full" />
        </div>
        <FeedSidebar
          className="h-full"
          isWalletConnected={isWalletConnected}
          onTrade={handleTradeViaAI}
        />
      </div>
    </div>
  );
}
