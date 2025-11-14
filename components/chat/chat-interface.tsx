'use client';

import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import { Send, Bot, User, AlertCircle, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { stream } from 'fetch-event-stream';
import { Streamdown } from 'streamdown';
import { ConnectButton, useActiveAccount, TransactionButton, useActiveWalletChain } from 'thirdweb/react';
import { client } from '@/components/providers/thirdweb-provider';
import { prepareTransaction } from 'thirdweb';
import { defineChain } from 'thirdweb/chains';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: ActionEvent[];
  images?: ImageEvent[];
  status?: 'sending' | 'sent' | 'error';
}

type TransactionPayload = {
  to: string;
  chain_id: number;
  value?: string;
  data?: string;
  function?: string;
};

type SignSwapIntent = {
  amount: string;
  origin_token_address: string;
  destination_token_address: string;
  destination_chain_id: string;
};

type SignSwapPayload = {
  intent: SignSwapIntent;
  transaction: TransactionPayload;
};

type MonitorTransactionPayload = {
  transaction_id: string;
};

type ActionEvent =
  | {
      type: 'sign_transaction';
      data: TransactionPayload;
      request_id: string;
      session_id: string;
    }
  | {
      type: 'sign_swap';
      data: SignSwapPayload;
      request_id: string;
      session_id: string;
    }
  | {
      type: 'monitor_transaction';
      data: MonitorTransactionPayload;
      request_id: string;
      session_id: string;
    };

interface ImageEvent {
  url: string;
  width: number;
  height: number;
}

interface ChatInterfaceProps {
  className?: string;
}

export function ChatInterface({ className }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [, setCurrentRequestId] = useState<string | null>(null);
  const [thinkingMessage, setThinkingMessage] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeAccount = useActiveAccount();
  const activeChain = useActiveWalletChain();

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

  const submitMessage = async () => {
    if (!input.trim() || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
      status: 'sent',
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'sending',
      actions: [],
      images: [],
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      const events = await stream('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: userMessage.content,
            },
          ],
          context: {
            session_id: sessionId,
            from: activeAccount?.address,
            chain_ids: activeChain?.id ? [activeChain.id] : undefined,
          },
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
                setSessionId(parsedEventData.session_id);
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
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + parsedEventData.v }
                      : msg
                  )
                );
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

              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, actions: [...(msg.actions || []), actionData] }
                    : msg
                )
              );
              break;
            }

            case 'image': {
              const imageData: ImageEvent = {
                url: String(parsedEventData.url),
                width: typeof parsedEventData.width === 'number' ? parsedEventData.width : Number(parsedEventData.width ?? 512),
                height: typeof parsedEventData.height === 'number' ? parsedEventData.height : Number(parsedEventData.height ?? 512),
              };

              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, images: [...(msg.images || []), imageData] }
                    : msg
                )
              );
              break;
            }

            case 'context': {
              break;
            }

            case 'error': {
              setIsThinking(false);
              setThinkingMessage(null);

              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        content:
                          msg.content + '\\n\\n❌ Error: ' + (typeof parsedEventData.data === 'string' ? parsedEventData.data : 'An error occurred'),
                        status: 'error',
                      }
                    : msg
                )
              );
              break;
            }

            case 'done': {
              setIsThinking(false);
              setThinkingMessage(null);

              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, status: 'sent' }
                    : msg
                )
              );
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

      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: 'Sorry, I encountered an error while processing your request. Please try again.',
                status: 'error',
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

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
        'mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] text-[#d5e8ff] shadow-[0_50px_140px_-70px_rgba(45,121,255,0.7)] backdrop-blur-3xl transition-colors',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-6 border-b border-white/10 bg-white/[0.02] px-8 py-6">
        <div className="flex flex-1 min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1b3f7c]/80 via-[#254d93]/70 to-[#6aa8ff]/50 shadow-[0_0_30px_rgba(106,168,255,0.35)]">
            <Bot className="h-6 w-6 text-[#8ec5ff]" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-white">
              AI Wallet Intelligence Hub
            </h1>
            <p className="text-sm font-medium text-[#b7d8ff]/80">
              Strategize, sign, and monitor your Web3 transactions with intelligent guidance.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-4 text-right sm:flex-row sm:items-center sm:gap-6">
          <div className="sm:order-2">
            <div className="rounded-full border border-white/10 bg-white/[0.06] p-1 shadow-[0_0_25px_rgba(106,168,255,0.3)] backdrop-blur">
              <ConnectButton client={client} />
            </div>
          </div>
          <div className="sm:order-1">
            <span className="block text-sm font-semibold uppercase tracking-[0.55em] text-[#d5e8ff] drop-shadow-[0_0_18px_rgba(106,168,255,0.7)]">
              BeaverXBT
            </span>
            <span className="mt-1 block text-xs font-medium text-[#86bbff]">
              Quantum Trading Network
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
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
                  {message.actions.map((action, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-[0_18px_45px_-32px_rgba(45,121,255,0.6)]"
                    >
                      <div className="mb-3 flex items-center gap-2 text-[#8ec5ff]">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-xs font-semibold uppercase tracking-[0.3em]">
                          {action.type === 'sign_transaction' && 'Transaction Ready'}
                          {action.type === 'sign_swap' && 'Swap Confirmation'}
                          {action.type === 'monitor_transaction' && 'Transaction Monitor'}
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
                          onTransactionConfirmed={handleTransactionSuccess}
                          onError={handleTransactionError}
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
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-[#7fa3d4]">
                <span>{message.timestamp.toLocaleTimeString()}</span>
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

      <div className="border-t border-white/10 bg-white/[0.02] px-6 py-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Craft your Web3 request or trading strategy..."
              className="w-full resize-none rounded-2xl border border-white/15 bg-white/[0.05] px-5 py-3 pr-12 text-sm text-white placeholder:text-[#7fa3d4] focus:border-[#6aa8ff] focus:outline-none focus:ring-2 focus:ring-[#6aa8ff]/50"
              rows={1}
              style={{ minHeight: '52px', maxHeight: '160px' }}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-[#1b3f7c]/60 p-2 text-[#7fa3d4] transition-colors hover:bg-[#254d93]/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs font-medium text-[#7fa3d4] sm:text-right">
            Press Enter to send · Shift + Enter for a new line
          </p>
        </form>
      </div>
    </div>
  );
}
