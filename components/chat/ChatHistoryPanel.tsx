"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { useChatHistoryStore, type ChatSession } from "@/store/chatHistory";

interface ChatHistoryPanelProps {
  className?: string;
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

export function ChatHistoryPanel({ className }: ChatHistoryPanelProps) {
  const chats = useChatHistoryStore(state => state.chats);
  const activeChatId = useChatHistoryStore(state => state.activeChatId);
  const setActiveSession = useChatHistoryStore(state => state.setActiveSession);

  const sortedChats = useMemo(() => sortChats(chats), [chats]);

  return (
    <aside
      className={cn(
        "hidden md:flex md:w-[280px] md:flex-col md:self-stretch lg:sticky lg:top-10",
        className
      )}
    >
      <div className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#0b1b3a]/90 to-[#0f2f5d]/90 shadow-[0_0_32px_rgba(48,128,255,0.14)] backdrop-blur-2xl">
        <div className="border-b border-white/10 px-6 py-5">
          <h2 className="text-base font-semibold text-white">Chat History</h2>
          <p className="mt-1 text-xs text-[#b7d8ff]/80">
            Resume previous BeaverXBT sessions and pick up right where you left off.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4">
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
                        "group flex w-full flex-col rounded-2xl border border-transparent bg-white/[0.03] px-4 py-3 text-left transition-all",
                        isActive
                          ? "border-[#6aa8ff]/40 bg-white/[0.09] shadow-[0_0_28px_rgba(106,168,255,0.28)]"
                          : "hover:border-white/15 hover:bg-white/[0.08]"
                      )}
                    >
                      <div className="flex items-center justify-between text-xs text-[#86bbff]/80">
                        <span className="font-semibold uppercase tracking-[0.25em] text-[#d5e8ff]">
                          {chat.title}
                        </span>
                        <span>{formatTimestamp(chat.updatedAt)}</span>
                      </div>
                      <div className="mt-2 text-[13px] font-medium text-white/90">
                        {trimText(chat.walletAddress, 22)}
                      </div>
                      <p className="mt-1 text-xs text-[#b7d8ff]/80">
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
