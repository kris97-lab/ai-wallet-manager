'use client';

import {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  Send,
  Bot,
  User,
  AlertCircle,
  Image as ImageIcon,
  Sparkles,
  Loader2,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import Image from 'next/image';
import { stream } from 'fetch-event-stream';
import { Streamdown } from 'streamdown';
import {
  ConnectButton,
  useActiveAccount,
  TransactionButton,
  useActiveWalletChain,
  useSwitchActiveWalletChain,
} from 'thirdweb/react';
import { client } from '@/components/providers/thirdweb-provider';
import { getContract, prepareTransaction } from 'thirdweb';
import { defineChain, polygon } from 'thirdweb/chains';
import { getBalance } from 'thirdweb/extensions/erc20';
import { cn } from '@/lib/utils';
import {
  useChatHistoryStore,
  selectActiveChat,
  type ChatMessage,
} from '@/store/chatHistory';
import { usePolymarketBalance } from '@/hooks/usePolymarketBalance';
import type {
  ActionEvent,
  ImageEvent,
  TransactionPayload,
  PolymarketOrderStatus,
  TradePromptPayload,
} from '@/types/chat';

interface ChatInterfaceProps {
  className?: string;
}

export interface ChatInterfaceHandle {
  handleExternalTrade: (payload: TradePromptPayload) => void;
}

const EMPTY_MESSAGES: ChatMessage[] = [];
const POLYGON_USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

export const ChatInterface = forwardRef<ChatInterfaceHandle, ChatInterfaceProps>(
  function ChatInterface({ className }, ref) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [, setCurrentRequestId] = useState<string | null>(null);
  const [thinkingMessage, setThinkingMessage] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const processedPolymarketOrdersRef = useRef<Set<string>>(new Set());
  const pendingPolymarketOrdersRef = useRef(
    new Map<
      string,
      {
        chatId: string;
        assistantId: string;
        requestId: string;
        sessionId: string;
        payload: {
          marketId: string;
          marketLabel: string;
          outcome: 'YES' | 'NO';
          outcomeId?: string;
          side: 'buy' | 'sell';
          price?: number | null;
          sizeUSDC: number;
          sizeBaseUnits: bigint;
        };
      }
    >()
  );
  const latestPolymarketPromptRef = useRef<TradePromptPayload | null>(null);
  const usdcContract = useMemo(
    () =>
      getContract({
        client,
        chain: polygon,
        address: POLYGON_USDC_ADDRESS,
      }),
    []
  );

  const activeAccount = useActiveAccount();
  const activeChain = useActiveWalletChain();
  const requestSwitchChain = useSwitchActiveWalletChain();
  const isWalletConnected = Boolean(activeAccount);
  const { balance: polymarketBalance, loading: balanceLoading } =
    usePolymarketBalance(isWalletConnected);

  const fetchUsdcBalance = useCallback(async (): Promise<bigint | null> => {
    const address = activeAccount?.address;
    if (!address) {
      return null;
    }

    try {
      const balance = await getBalance({
        contract: usdcContract,
        address,
      });
      return balance.value;
    } catch (error) {
      console.error('Failed to fetch USDC balance', error);
      return null;
    }
  }, [activeAccount?.address, usdcContract]);

  useEffect(() => {
    if (!activeAccount) {
      return;
    }

    if (activeChain?.id === polygon.id) {
      return;
    }

    if (requestSwitchChain) {
      void requestSwitchChain(polygon);
    }
  }, [activeAccount, activeChain?.id, requestSwitchChain]);
  const activeChat = useChatHistoryStore(selectActiveChat);
  const activeChatId = useChatHistoryStore(state => state.activeChatId);
  const createSession = useChatHistoryStore(state => state.createSession);
  const setActiveSession = useChatHistoryStore(state => state.setActiveSession);
  const addMessageToStore = useChatHistoryStore(state => state.addMessage);
  const updateMessageInStore = useChatHistoryStore(state => state.updateMessage);
  const setSessionIdForChat = useChatHistoryStore(state => state.setSessionId);
  const findSessionByWallet = useChatHistoryStore(state => state.findSessionByWallet);
  const messages = activeChat?.messages ?? EMPTY_MESSAGES;
  const sessionId = activeChat?.sessionId ?? null;

  useEffect(() => {
    if (activeAccount?.address) {
      const existingSession = findSessionByWallet(activeAccount.address);
      if (existingSession) {
        if (existingSession.id !== activeChatId) {
          setActiveSession(existingSession.id);
        }
        return;
      }

      const address = activeAccount.address;
      const shortAddress =
        address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
      const newSessionId = createSession(address, `Session for ${shortAddress}`);
      setActiveSession(newSessionId);
      return;
    }

    if (!activeChatId) {
      createSession(null);
    }
  }, [activeAccount?.address, activeChatId, createSession, findSessionByWallet, setActiveSession]);

  const generateMessageId = useCallback(
    () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    []
  );

  const prepareTransactionFromAction = (actionData: TransactionPayload) => {
    return prepareTransaction({
      client,
      chain: defineChain(actionData.chain_id),
      to: actionData.to,
      value: BigInt(actionData.value || '0'),
      data: actionData.data,
    });
  };

  const handleTransactionSuccess = (receipt: unknown) => {
    console.log('Transaction confirmed:', receipt);
  };

  const handleTransactionError = (error: unknown) => {
    console.error('Transaction failed:', error);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content && isThinking) {
      setIsThinking(false);
      setThinkingMessage(null);
    }
  }, [messages, isThinking]);

  const updatePolymarketActionStatus = useCallback(
    (chatId: string, assistantId: string, requestId: string, status: PolymarketOrderStatus) => {
      updateMessageInStore(chatId, assistantId, message => {
        if (!message.actions) {
          return message;
        }

        return {
          ...message,
          actions: message.actions.map(action => {
            if (action.type === 'polymarket_order' && action.request_id === requestId) {
              return {
                ...action,
                data: {
                  ...action.data,
                  status,
                },
              };
            }
            return action;
          }),
        };
      });
    },
    [updateMessageInStore]
  );

  const submitPolymarketOrder = useCallback(
    async (orderKey: string) => {
      const pending = pendingPolymarketOrdersRef.current.get(orderKey);
      if (!pending) {
        return;
      }

      const { chatId, assistantId, requestId, payload } = pending;

      updatePolymarketActionStatus(chatId, assistantId, requestId, 'submitting_order');

      const size = Number(payload.sizeBaseUnits);
      const normalizedSide = payload.side.toLowerCase() === 'sell' ? 'sell' : 'buy';
      const normalizedOutcome =
        payload.outcomeId ?? (payload.outcome === 'YES' ? 1 : 0);

      try {
        const response = await fetch('/api/polymarket/order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            marketId: payload.marketId,
            outcome: normalizedOutcome,
            side: normalizedSide,
            size,
            price: payload.price ?? null,
          }),
        });

        const result = (await response.json()) as {
          ok?: boolean;
          order?: { id?: string; orderId?: string; order_id?: string };
          error?: string;
        };

        if (response.ok && result?.ok && result.order) {
          const orderId =
            result.order.id ??
            (typeof result.order.orderId === 'string' ? result.order.orderId : undefined) ??
            (typeof result.order.order_id === 'string' ? result.order.order_id : undefined) ??
            'unknown';

          updatePolymarketActionStatus(chatId, assistantId, requestId, 'completed');

          const confirmationMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'assistant',
            content: `Your Polymarket market order has been submitted successfully!\nOrder ID: ${orderId}`,
            timestamp: new Date().toISOString(),
            status: 'sent',
          };

          addMessageToStore(chatId, confirmationMessage);
        } else {
          const errorMessage = typeof result?.error === 'string' ? result.error : 'Unknown error';

          updatePolymarketActionStatus(chatId, assistantId, requestId, 'error');

          const rejectionMessage: ChatMessage = {
            id: generateMessageId(),
            role: 'assistant',
            content: `Order rejected: ${errorMessage}`,
            timestamp: new Date().toISOString(),
            status: 'error',
          };

          addMessageToStore(chatId, rejectionMessage);
        }
      } catch (error) {
        const fallbackMessage = error instanceof Error ? error.message : String(error);

        updatePolymarketActionStatus(chatId, assistantId, requestId, 'error');

        const rejectionMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content: `Order rejected: ${fallbackMessage}`,
          timestamp: new Date().toISOString(),
          status: 'error',
        };

        addMessageToStore(chatId, rejectionMessage);
      } finally {
        pendingPolymarketOrdersRef.current.delete(orderKey);
        processedPolymarketOrdersRef.current.delete(orderKey);
      }
    },
    [addMessageToStore, generateMessageId, updatePolymarketActionStatus]
  );

  const handlePolymarketOrderAction = useCallback(
    async (action: ActionEvent, chatId: string, assistantId: string) => {
      if (action.type !== 'polymarket_order') {
        return;
      }

      const { marketId, outcome, outcomeId, side, sizeUSDC, price, marketLabel } = action.data;
      if (
        !marketId ||
        !outcome ||
        !side ||
        typeof sizeUSDC !== 'number' ||
        Number.isNaN(sizeUSDC) ||
        sizeUSDC <= 0
      ) {
        return;
      }

      const computedMarketLabel =
        typeof marketLabel === 'string' && marketLabel.length > 0
          ? marketLabel
          : latestPolymarketPromptRef.current?.market && latestPolymarketPromptRef.current.market.length > 0
          ? latestPolymarketPromptRef.current.market
          : `Polymarket market ${marketId}`;

      updateMessageInStore(chatId, assistantId, message => {
        if (!message.actions) {
          return message;
        }

        return {
          ...message,
          actions: message.actions.map(existing => {
            if (
              existing.request_id === action.request_id &&
              existing.session_id === action.session_id &&
              existing.type === 'polymarket_order'
            ) {
              return {
                ...existing,
                data: {
                  ...existing.data,
                  marketLabel: computedMarketLabel,
                },
              };
            }

            return existing;
          }),
        };
      });

      const orderKey = `${action.session_id}:${action.request_id}`;
      if (processedPolymarketOrdersRef.current.has(orderKey)) {
        return;
      }

      const sizeBaseUnits = BigInt(Math.round(sizeUSDC * 1_000_000));

      pendingPolymarketOrdersRef.current.set(orderKey, {
        chatId,
        assistantId,
        requestId: action.request_id,
        sessionId: action.session_id,
        payload: {
          marketId,
          marketLabel: computedMarketLabel,
          outcome,
          outcomeId,
          side,
          price: price ?? null,
          sizeUSDC,
          sizeBaseUnits,
        },
      });

      processedPolymarketOrdersRef.current.add(orderKey);

      const balance = await fetchUsdcBalance();
      if (balance === null) {
        updatePolymarketActionStatus(chatId, assistantId, action.request_id, 'error');

        const message: ChatMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content: 'Order rejected: Unable to verify USDC balance for this wallet.',
          timestamp: new Date().toISOString(),
          status: 'error',
        };

        addMessageToStore(chatId, message);
        pendingPolymarketOrdersRef.current.delete(orderKey);
        processedPolymarketOrdersRef.current.delete(orderKey);
        return;
      }

      if (balance >= sizeBaseUnits) {
        await submitPolymarketOrder(orderKey);
        return;
      }

      updatePolymarketActionStatus(chatId, assistantId, action.request_id, 'awaiting_swap');
    },
    [
      addMessageToStore,
      fetchUsdcBalance,
      generateMessageId,
      pendingPolymarketOrdersRef,
      processedPolymarketOrdersRef,
      submitPolymarketOrder,
      updatePolymarketActionStatus,
      updateMessageInStore,
    ]
  );

  const handleSwapConfirmed = useCallback(
    async (action: ActionEvent) => {
      if (action.type !== 'sign_swap') {
        return;
      }

      const orderKey = `${action.session_id}:${action.request_id}`;
      if (!pendingPolymarketOrdersRef.current.has(orderKey)) {
        return;
      }

      await submitPolymarketOrder(orderKey);
    },
    [submitPolymarketOrder]
  );

  const handleSwapError = useCallback(
    (action: ActionEvent, reason: unknown) => {
      if (action.type !== 'sign_swap') {
        return;
      }

      const orderKey = `${action.session_id}:${action.request_id}`;
      const pending = pendingPolymarketOrdersRef.current.get(orderKey);
      if (!pending) {
        return;
      }

      pendingPolymarketOrdersRef.current.delete(orderKey);
      processedPolymarketOrdersRef.current.delete(orderKey);

      updatePolymarketActionStatus(pending.chatId, pending.assistantId, pending.requestId, 'error');

      const errorMessage = reason instanceof Error ? reason.message : String(reason);

      const rejectionMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: `Order rejected: ${errorMessage}`,
        timestamp: new Date().toISOString(),
        status: 'error',
      };

      addMessageToStore(pending.chatId, rejectionMessage);
    },
    [addMessageToStore, generateMessageId, updatePolymarketActionStatus]
  );

  const submitMessage = useCallback(
    async (contentOverride?: string, metadata?: Record<string, unknown>) => {
      const messageContent = (contentOverride ?? input).trim();
      if (!messageContent || isLoading) {
        return;
      }

      let chatId = activeChatId;
      if (!chatId) {
        chatId = createSession(activeAccount?.address ?? null);
      }

      if (!chatId) {
        return;
      }

      const now = new Date();
      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: messageContent,
        timestamp: now.toISOString(),
        status: 'sent',
      };

      addMessageToStore(chatId, userMessage);
      setInput('');
      setIsLoading(true);

      const assistantMessageId = generateMessageId();
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(now.getTime() + 1).toISOString(),
        status: 'sending',
        actions: [],
        images: [],
      };

      addMessageToStore(chatId, assistantMessage);

      try {
        const contextPayload: Record<string, unknown> = {
          session_id: sessionId,
          from: activeAccount?.address,
          chain_ids: activeChain?.id ? [activeChain.id] : undefined,
        };

        if (metadata && Object.keys(metadata).length > 0) {
          contextPayload.polymarket_metadata = metadata;
        }

        const events = await stream('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'user',
                content: messageContent,
              },
            ],
            context: contextPayload,
          }),
        });

        for await (const event of events) {
          if (!event.data) {
            continue;
          }

          try {
            const parsedEventData = JSON.parse(event.data) as Record<string, unknown>;

            if (event.event === 'delta' || event.event === 'action' || event.event === 'image') {
              setIsThinking(false);
              setThinkingMessage(null);
            }

            switch (event.event) {
              case 'init': {
                if (typeof parsedEventData.session_id === 'string') {
                  setSessionIdForChat(chatId, parsedEventData.session_id);
                }
                if (typeof parsedEventData.request_id === 'string') {
                  setCurrentRequestId(parsedEventData.request_id);
                }
                break;
              }

              case 'presence': {
                if (typeof parsedEventData.data === 'string') {
                  setThinkingMessage(parsedEventData.data);
                  setIsThinking(true);
                }
                break;
              }

              case 'delta': {
                if (typeof parsedEventData.v === 'string') {
                  updateMessageInStore(chatId, assistantMessageId, message => ({
                    ...message,
                    content: message.content + parsedEventData.v,
                  }));
                }
                break;
              }

              case 'action': {
                const actionData = {
                  type: parsedEventData.type as ActionEvent['type'],
                  data: parsedEventData.data as ActionEvent['data'],
                  request_id: typeof parsedEventData.request_id === 'string' ? parsedEventData.request_id : '',
                  session_id: typeof parsedEventData.session_id === 'string' ? parsedEventData.session_id : '',
                } as ActionEvent;

                updateMessageInStore(chatId, assistantMessageId, message => ({
                  ...message,
                  actions: [...(message.actions ?? []), actionData],
                }));

                if (actionData.type === 'polymarket_order') {
                  void handlePolymarketOrderAction(actionData, chatId, assistantMessageId);
                }
                break;
              }

              case 'image': {
                const imageData: ImageEvent = {
                  url: String(parsedEventData.url),
                  width: typeof parsedEventData.width === 'number' ? parsedEventData.width : Number(parsedEventData.width ?? 512),
                  height: typeof parsedEventData.height === 'number' ? parsedEventData.height : Number(parsedEventData.height ?? 512),
                };

                updateMessageInStore(chatId, assistantMessageId, message => ({
                  ...message,
                  images: [...(message.images ?? []), imageData],
                }));
                break;
              }

              case 'context': {
                break;
              }

              case 'error': {
                setIsThinking(false);
                setThinkingMessage(null);

                updateMessageInStore(chatId, assistantMessageId, message => ({
                  ...message,
                  content:
                    message.content +
                    '\n\n❌ Error: ' +
                    (typeof parsedEventData.data === 'string' ? parsedEventData.data : 'An error occurred'),
                  status: 'error',
                }));
                break;
              }

              case 'done': {
                setIsThinking(false);
                setThinkingMessage(null);

                updateMessageInStore(chatId, assistantMessageId, message => ({
                  ...message,
                  status: 'sent',
                }));
                break;
              }
            }
          } catch (parseError) {
            console.warn('Failed to parse event data:', event.data, parseError);
          }
        }
      } catch (error) {
        console.error('Error sending message:', error);
        setIsThinking(false);
        setThinkingMessage(null);

        updateMessageInStore(chatId, assistantMessageId, message => ({
          ...message,
          content:
            message.content ||
            'Sorry, I encountered an error while processing your request. Please try again.',
          status: 'error',
        }));
      } finally {
        setIsLoading(false);
      }
    },
    [
      input,
      isLoading,
      activeChatId,
      createSession,
      activeAccount?.address,
      generateMessageId,
      addMessageToStore,
      setIsLoading,
      sessionId,
      activeChain?.id,
      setSessionIdForChat,
      setCurrentRequestId,
      updateMessageInStore,
      setIsThinking,
      setThinkingMessage,
      handlePolymarketOrderAction,
    ]
  );

  const handleExternalTrade = useCallback(
    (payload: TradePromptPayload) => {
      const trimmed = payload.message.trim();
      if (!trimmed) {
        return;
      }

      latestPolymarketPromptRef.current = payload;
      setInput('');
      void submitMessage(trimmed, {
        marketId: payload.marketId,
        outcomeId: payload.outcomeId,
        outcome: payload.outcome,
        side: payload.side,
        price: payload.price,
        amountUSDC: payload.amountUSDC,
        market: payload.market,
        slug: payload.slug,
        url: payload.url,
      });
    },
    [submitMessage]
  );

  useImperativeHandle(
    ref,
    () => ({
      handleExternalTrade,
    }),
    [handleExternalTrade]
  );
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-[16px] border border-white/12 bg-white/[0.04] text-[#d5e8ff] shadow-[0_50px_140px_-70px_rgba(45,121,255,0.6)] backdrop-blur-3xl transition-colors',
        className,
      )}
    >
      <header className="flex h-[60px] items-center justify-between border-b border-white/10 bg-white/[0.03] px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.55em] text-white">
            BeaverXBT
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isWalletConnected && (
            <div
              className={cn(
                'rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide shadow-[0_0_18px_rgba(106,168,255,0.25)] backdrop-blur',
                balanceLoading
                  ? 'border-white/30 text-white/70'
                  : (polymarketBalance?.cash ?? 0) > 0
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100'
                  : 'border-rose-400/50 bg-rose-500/10 text-rose-100'
              )}
            >
              {balanceLoading
                ? 'Syncing balance…'
                : (polymarketBalance?.cash ?? 0) > 0
                ? `Cash: $${(polymarketBalance?.cash ?? 0).toFixed(2)}`
                : '$0.00 — deposit required'}
            </div>
          )}
          <div className="neon-text rounded-xl border border-white/20 bg-white/5 px-5 py-1.5 transition-all hover:border-white/40">
            <ConnectButton
              client={client}
              connectButton={{
                className:
                  'neon-text !bg-transparent !border-none !shadow-none !text-white !font-semibold !px-6 !py-2 !rounded-[18px] !transition-all',
              }}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <div
          className="flex h-full flex-col overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 120px)' }}
        >
          <div className="flex-1 space-y-5 px-6 py-5">
            {messages.length === 0 && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-10 py-12 text-center shadow-[0_30px_100px_-60px_rgba(45,121,255,0.6)]">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.08]">
                  <Bot className="h-7 w-7 text-[#8ec5ff]" />
                </div>
                <h3 className="text-lg font-semibold text-white">Welcome to BeaverXBT</h3>
                <p className="mt-3 text-sm text-[#b7d8ff]/80">
                  Initiate a conversation about blockchain development, token operations, on-chain analytics, or any Web3 transaction workflow.
                </p>
              </div>
            )}

            {messages.map(message => (
              <div
                key={message.id}
                className={cn('flex gap-4', message.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {message.role === 'assistant' && (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] shadow-[0_0_18px_rgba(106,168,255,0.45)]">
                    <Bot className="h-5 w-5 text-[#8ec5ff]" />
                  </div>
                )}

                <div
                  className={cn(
                    'max-w-[70%] rounded-3xl px-5 py-4 text-sm leading-relaxed shadow-lg transition-colors duration-300',
                    message.role === 'user'
                      ? 'bg-gradient-to-r from-[#1b3f7c]/85 via-[#254d93]/85 to-[#6aa8ff]/80 text-white shadow-[0_25px_60px_-35px_rgba(106,168,255,0.8)]'
                      : message.status === 'error'
                      ? 'border border-red-400/30 bg-[#32172d]/80 text-red-100'
                      : 'border border-white/10 bg-white/[0.08] text-[#d5e8ff] shadow-[0_30px_80px_-50px_rgba(45,121,255,0.6)]',
                  )}
                >
                  {message.content && (
                    <div className="space-y-3 text-sm leading-relaxed text-inherit">
                      <Streamdown>{message.content}</Streamdown>
                    </div>
                  )}

                  {message.images && message.images.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-[#86bbff]">
                        <ImageIcon className="h-3.5 w-3.5" />
                        Visual context
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {message.images.map((image, index) => (
                          <div key={index} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]">
                            <Image
                              src={image.url}
                              alt="AI generated content"
                              width={Math.max(image.width, 1)}
                              height={Math.max(image.height, 1)}
                              className="h-auto w-full object-cover"
                              style={{ maxHeight: Math.min(image.height, 320) }}
                              unoptimized
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {message.actions && message.actions.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {message.actions.map((action, index) => {
                        if (action.type === 'polymarket_order') {
                          const { marketLabel, side, outcome, sizeUSDC, status } = action.data;

                          const stage = status ?? 'awaiting_swap';
                          const swapState =
                            stage === 'completed'
                              ? 'complete'
                              : stage === 'submitting_order'
                              ? 'complete'
                              : stage === 'error'
                              ? 'error'
                              : 'in_progress';
                          const orderState =
                            stage === 'completed'
                              ? 'complete'
                              : stage === 'submitting_order'
                              ? 'in_progress'
                              : stage === 'error'
                              ? 'error'
                              : 'pending';

                          const formattedAmount =
                            typeof sizeUSDC === 'number' && Number.isFinite(sizeUSDC)
                              ? `$${sizeUSDC.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                              : '—';
                          const outcomeLabel = outcome ? outcome.toUpperCase() : '—';

                          const renderStatusIcon = (state: 'pending' | 'in_progress' | 'complete' | 'error') => {
                            if (state === 'complete') {
                              return <CheckCircle2 className="h-3.5 w-3.5 text-[#8ec5ff]" />;
                            }
                            if (state === 'in_progress') {
                              return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9abffd]" />;
                            }
                            if (state === 'error') {
                              return <AlertCircle className="h-3.5 w-3.5 text-red-300" />;
                            }
                            return <Circle className="h-3.5 w-3.5 text-[#7fa3d4]" />;
                          };

                          const swapLabel =
                            swapState === 'complete'
                              ? 'Swap completed'
                              : swapState === 'error'
                              ? 'Swap failed'
                              : 'Swapping tokens…';
                          const orderLabel =
                            orderState === 'complete'
                              ? 'Order submitted'
                              : orderState === 'in_progress'
                              ? 'Submitting order…'
                              : orderState === 'error'
                              ? 'Order failed'
                              : 'Awaiting order submission';

                          return (
                            <div
                              key={index}
                              className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_18px_45px_-32px_rgba(45,121,255,0.6)]"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-2 text-[#8ec5ff]">
                                  <Sparkles className="h-4 w-4" />
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8ec5ff]">
                                      Polymarket Order
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-white">{marketLabel || 'Unspecified market'}</p>
                                  </div>
                                </div>
                                <span className="rounded-full border border-white/20 bg-white/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-white/90">
                                  {side ? side.toUpperCase() : '—'}
                                </span>
                              </div>
                              <div className="mt-3 grid gap-2 text-xs text-[#b7d8ff] sm:text-sm">
                                <div>
                                  <strong className="text-white/90">Outcome:</strong> {outcomeLabel}
                                </div>
                                <div>
                                  <strong className="text-white/90">Amount:</strong> {formattedAmount}
                                </div>
                              </div>
                              <div className="mt-4 space-y-2 text-xs">
                                <div
                                  className={cn(
                                    'flex items-center gap-2 transition-colors',
                                    swapState === 'complete'
                                      ? 'text-[#8ec5ff]'
                                      : swapState === 'in_progress'
                                      ? 'text-[#9abffd]'
                                      : swapState === 'error'
                                      ? 'text-red-300'
                                      : 'text-[#7fa3d4]'
                                  )}
                                >
                                  {renderStatusIcon(
                                    swapState === 'complete'
                                      ? 'complete'
                                      : swapState === 'error'
                                      ? 'error'
                                      : 'in_progress'
                                  )}
                                  <span>{swapLabel}</span>
                                </div>
                                <div
                                  className={cn(
                                    'flex items-center gap-2 transition-colors',
                                    orderState === 'complete'
                                      ? 'text-[#8ec5ff]'
                                      : orderState === 'in_progress'
                                      ? 'text-[#9abffd]'
                                      : orderState === 'error'
                                      ? 'text-red-300'
                                      : 'text-[#7fa3d4]'
                                  )}
                                >
                                  {renderStatusIcon(orderState)}
                                  <span>{orderLabel}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={index}
                            className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_18px_45px_-32px_rgba(45,121,255,0.6)]"
                          >
                            <div className="mb-3 flex items-center gap-2 text-[#8ec5ff]">
                              <AlertCircle className="h-4 w-4" />
                              <span className="text-xs font-semibold uppercase tracking-[0.3em]">
                                {action.type.replace('_', ' ')}
                              </span>
                            </div>

                            {action.type === 'sign_transaction' && (
                              <div className="space-y-1 text-xs text-[#b7d8ff]">
                                <div><strong className="text-white/90">To:</strong> {action.data.to}</div>
                                <div>
                                  <strong className="text-white/90">Value:</strong> {action.data.value ? `${Number(action.data.value) / 1e18} ETH` : '0 ETH'}
                                </div>
                                <div><strong className="text-white/90">Chain ID:</strong> {action.data.chain_id}</div>
                                {action.data.function && (
                                  <div><strong className="text-white/90">Function:</strong> {action.data.function}</div>
                                )}
                              </div>
                            )}

                            {action.type === 'sign_swap' && (
                              <div className="space-y-1 text-xs text-[#b7d8ff]">
                                <div><strong className="text-white/90">Amount:</strong> {action.data.intent.amount}</div>
                                <div><strong className="text-white/90">From:</strong> {action.data.intent.origin_token_address}</div>
                                <div><strong className="text-white/90">To:</strong> {action.data.intent.destination_token_address}</div>
                                <div><strong className="text-white/90">Chain:</strong> {action.data.intent.destination_chain_id}</div>
                              </div>
                            )}

                            {action.type === 'monitor_transaction' && (
                              <div className="text-xs text-[#b7d8ff]">
                                <div><strong className="text-white/90">Transaction ID:</strong> {action.data.transaction_id}</div>
                              </div>
                            )}

                            {action.type === 'sign_transaction' ? (
                              <TransactionButton
                                transaction={() => prepareTransactionFromAction(action.data)}
                                onTransactionConfirmed={handleTransactionSuccess}
                                onError={handleTransactionError}
                                className="mt-4 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#1b3f7c] to-[#6aa8ff] px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_30px_-20px_rgba(106,168,255,0.8)] transition-transform hover:scale-[1.02]"
                              >
                                Confirm Transaction
                              </TransactionButton>
                            ) : action.type === 'sign_swap' ? (
                              <TransactionButton
                                transaction={() => prepareTransactionFromAction(action.data.transaction)}
                                onTransactionConfirmed={async receipt => {
                                  await handleSwapConfirmed(action);
                                  handleTransactionSuccess(receipt);
                                }}
                                onError={error => {
                                  handleSwapError(action, error);
                                  handleTransactionError(error);
                                }}
                                className="mt-4 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#1b3f7c] to-[#6aa8ff] px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_30px_-20px_rgba(106,168,255,0.8)] transition-transform hover:scale-[1.02]"
                              >
                                Confirm Swap
                              </TransactionButton>
                            ) : (
                              <button className="mt-4 inline-flex items-center justify-center rounded-full border border-white/20 bg-transparent px-4 py-2 text-xs font-semibold text-[#d5e8ff] transition-colors hover:border-white/40">
                                View Transaction
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-[#7fa3d4]">
                    <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                    {message.status === 'sending' && <span className="text-[#8ec5ff]">Streaming…</span>}
                    {message.status === 'error' && <span className="text-red-300">Error</span>}
                  </div>
                </div>

                {message.role === 'user' && (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0f2f5d] to-[#1b3f7c] text-white shadow-[0_0_18px_rgba(106,168,255,0.35)]">
                    <User className="h-5 w-5" />
                  </div>
                )}
              </div>
            ))}

            {isThinking === true && thinkingMessage && (
              <div className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] shadow-[0_0_18px_rgba(106,168,255,0.45)]">
                  <Bot className="h-5 w-5 text-[#8ec5ff]" />
                </div>
                <div className="max-w-[60%] rounded-3xl border border-white/10 bg-white/[0.07] px-5 py-4 text-sm text-[#b7d8ff] shadow-[0_25px_60px_-40px_rgba(45,121,255,0.65)]">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#6aa8ff]" style={{ animationDelay: '0s' }} />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#6aa8ff]/80" style={{ animationDelay: '0.2s' }} />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#6aa8ff]/60" style={{ animationDelay: '0.4s' }} />
                    </div>
                    <span className="italic">{thinkingMessage}</span>
                  </div>
                </div>
              </div>
            )}

            {isLoading && !isThinking && (
              <div className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-white/[0.08] shadow-[0_0_18px_rgba(106,168,255,0.45)]">
                  <Bot className="h-5 w-5 text-[#8ec5ff]" />
                </div>
                <div className="flex items-center gap-1 rounded-3xl border border-white/10 bg-white/[0.07] px-5 py-3 text-[#b7d8ff] shadow-[0_25px_60px_-40px_rgba(45,121,255,0.65)]">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#6aa8ff]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#6aa8ff]" style={{ animationDelay: '0.12s' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-[#6aa8ff]" style={{ animationDelay: '0.24s' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="sticky bottom-0 border-t border-white/10 bg-[#081a3a]/80 px-6 py-4 backdrop-blur-2xl">
            <form onSubmit={handleSubmit} className="flex w-full items-center gap-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Craft your Web3 request or trading strategy..."
                className="flex-1 resize-none rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm text-white placeholder:text-[#7fa3d4] focus:border-[#6aa8ff] focus:outline-none focus:ring-2 focus:ring-[#6aa8ff]/40"
                rows={1}
                style={{ minHeight: '52px', maxHeight: '160px' }}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="rounded-full bg-[#1b3f7c]/70 p-3 text-[#9abffd] transition-colors hover:bg-[#254d93] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
});
