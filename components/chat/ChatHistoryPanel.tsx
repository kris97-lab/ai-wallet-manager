"use client";

import "@/styles/chatHistory.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { useChatHistoryStore, type ChatSession } from "@/store/chatHistory";

interface ChatHistoryPanelProps {
  className?: string;
  isWalletConnected?: boolean;
  walletAddress?: string | null;
  isVisible?: boolean;
}

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const trimText = (value: string, maxLength: number) => {
  if (!value) {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
};

const sortChats = (chats: ChatSession[]) =>
  [...chats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

export function ChatHistoryPanel({
  className,
  isWalletConnected = false,
  walletAddress = null,
  isVisible = true,
}: ChatHistoryPanelProps) {
  const chats = useChatHistoryStore(state => state.chats);
  const activeChatId = useChatHistoryStore(state => state.activeChatId);
  const setActiveSession = useChatHistoryStore(state => state.setActiveSession);
  const createSession = useChatHistoryStore(state => state.createSession);

  const sortedChats = useMemo(() => sortChats(chats), [chats]);
  const [hasAnimated, setHasAnimated] = useState(isWalletConnected);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setHasAnimated(isWalletConnected);
  }, [isWalletConnected]);

  useEffect(() => {
    if (!isWalletConnected || !activeChatId) {
      return;
    }

    const target = itemRefs.current[activeChatId];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeChatId, isWalletConnected, sortedChats.length]);

  const handleCreateSession = useCallback(() => {
    const id = createSession(walletAddress ?? undefined);
    setActiveSession(id);
  }, [createSession, setActiveSession, walletAddress]);

  return (
    <aside
      className={cn(
        "chat-history-panel-shell hidden h-full min-h-0 transition-opacity duration-200 md:flex md:w-[260px] md:flex-col md:items-stretch",
        hasAnimated && "wallet-connected",
        !isVisible && "pointer-events-none opacity-0",
        className
      )}
      aria-hidden={!isWalletConnected || !isVisible}
      data-wallet-connected={isWalletConnected}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[16px] border border-white/10 bg-gradient-to-b from-[#0b1b3a]/90 to-[#0f2f5d]/90 shadow-[0_0_28px_rgba(48,128,255,0.15)] backdrop-blur-2xl">
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-white/90">Chat History</h2>
          <button
            type="button"
            onClick={handleCreateSession}
            className="chat-history-new-session-btn"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3">
          {sortedChats.length === 0 ? (
            <div className="mt-8 px-4 text-center text-sm text-[#b7d8ff]/80">
              Conversations will appear here once you start chatting.
            </div>
          ) : (
            <ul className="space-y-2">
              {sortedChats.map(chat => {
                const isActive = chat.id === activeChatId;
                return (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => setActiveSession(chat.id)}
                      className={cn(
                        "chat-session-button group flex w-full flex-col rounded-2xl border border-transparent bg-white/[0.03] px-4 py-3 text-left transition-all",
                        isActive
                          ? "is-active border-[#6aa8ff]/40 bg-white/[0.09] shadow-[0_0_28px_rgba(106,168,255,0.28)]"
                          : "hover:border-white/15 hover:bg-white/[0.08]"
                      )}
                      data-active={isActive}
                      ref={node => {
                        if (node) {
                          itemRefs.current[chat.id] = node;
                        } else {
                          delete itemRefs.current[chat.id];
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-3 text-xs text-[#86bbff]/80">
                        <span
                          className="chat-session-title font-semibold uppercase tracking-[0.25em] text-[#d5e8ff]"
                          title={chat.title}
                        >
                          {chat.title}
                        </span>
                        <span>{formatTimestamp(chat.updatedAt)}</span>
                      </div>
                      <div className="mt-2 text-[13px] font-medium text-white/90">
                        {trimText(chat.walletAddress, 22)}
                      </div>
                      <p className="chat-session-preview mt-1 text-xs">
                        {trimText(chat.lastMessage || "No messages yet", 80)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
