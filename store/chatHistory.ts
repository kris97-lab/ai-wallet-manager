'use client';

import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

import type { ChatMessage } from '@/types/chat';

export interface ChatSession {
  id: string;
  walletAddress: string;
  title: string;
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  messages: ChatMessage[];
}

interface ChatHistoryState {
  chats: ChatSession[];
  activeChatId: string | null;
  createSession: (walletAddress?: string | null) => string;
  setActiveSession: (chatId: string) => void;
  addMessage: (chatId: string, message: ChatMessage) => void;
  updateMessage: (
    chatId: string,
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage
  ) => void;
  setSessionId: (chatId: string, sessionId: string) => void;
  replaceMessages: (chatId: string, messages: ChatMessage[]) => void;
}

const fallbackStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const truncateWallet = (wallet?: string | null) => {
  if (!wallet) {
    return 'Guest';
  }
  if (wallet.length <= 10) {
    return wallet;
  }
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
};

const ensureUniqueTitle = (title: string, chats: ChatSession[]) => {
  const existingTitles = new Set(chats.map(chat => chat.title));
  if (!existingTitles.has(title)) {
    return title;
  }
  let index = 2;
  let nextTitle = `${title} (${index})`;
  while (existingTitles.has(nextTitle)) {
    index += 1;
    nextTitle = `${title} (${index})`;
  }
  return nextTitle;
};

export const useChatHistoryStore = create<ChatHistoryState>()(
  persist(
    (set, get) => ({
      chats: [],
      activeChatId: null,
      createSession: (walletAddress?: string | null) => {
        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);
        const now = new Date().toISOString();
        const state = get();
        const baseTitle = walletAddress ? truncateWallet(walletAddress) : 'Guest Session';
        const title = ensureUniqueTitle(baseTitle, state.chats);
        const session: ChatSession = {
          id,
          walletAddress: walletAddress ?? 'Guest',
          title,
          lastMessage: '',
          createdAt: now,
          updatedAt: now,
          messages: [],
        };

        set({ chats: [session, ...state.chats], activeChatId: id });
        return id;
      },
      setActiveSession: (chatId: string) => {
        const state = get();
        const exists = state.chats.some(chat => chat.id === chatId);
        if (!exists) {
          return;
        }
        set({ activeChatId: chatId });
      },
      addMessage: (chatId: string, message: ChatMessage) => {
        const state = get();
        const chats = state.chats.map(chat => {
          if (chat.id !== chatId) {
            return chat;
          }
          const existingIndex = chat.messages.findIndex(item => item.id === message.id);
          const messages =
            existingIndex === -1
              ? [...chat.messages, message]
              : chat.messages.map(item => (item.id === message.id ? message : item));

          const lastMessageContent = message.content || chat.lastMessage;

          return {
            ...chat,
            messages,
            lastMessage: lastMessageContent,
            updatedAt: message.timestamp,
          };
        });

        set({ chats });
      },
      updateMessage: (chatId, messageId, updater) => {
        const state = get();
        const chats = state.chats.map(chat => {
          if (chat.id !== chatId) {
            return chat;
          }

          const messages = chat.messages.map(message =>
            message.id === messageId ? updater(message) : message
          );
          const last = messages[messages.length - 1];

          return {
            ...chat,
            messages,
            lastMessage: last ? last.content : chat.lastMessage,
            updatedAt: last ? last.timestamp : chat.updatedAt,
          };
        });

        set({ chats });
      },
      setSessionId: (chatId, sessionId) => {
        const state = get();
        const chats = state.chats.map(chat =>
          chat.id === chatId
            ? {
                ...chat,
                sessionId,
              }
            : chat
        );

        set({ chats });
      },
      replaceMessages: (chatId, messages) => {
        const state = get();
        const chats = state.chats.map(chat => {
          if (chat.id !== chatId) {
            return chat;
          }
          const last = messages[messages.length - 1];
          return {
            ...chat,
            messages,
            lastMessage: last ? last.content : '',
            updatedAt: last ? last.timestamp : chat.updatedAt,
          };
        });

        set({ chats });
      },
    }),
    {
      name: 'beaverxbt-chat-history',
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? fallbackStorage : window.localStorage
      ),
      partialize: state => ({
        chats: state.chats,
        activeChatId: state.activeChatId,
      }),
    }
  )
);

export const selectActiveChat = (state: ChatHistoryState) =>
  state.chats.find(chat => chat.id === state.activeChatId) ?? null;

export type { ChatMessage } from '@/types/chat';
