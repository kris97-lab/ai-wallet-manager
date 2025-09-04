'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { stream } from 'fetch-event-stream';
import { Streamdown } from 'streamdown';
import { ConnectButton, useActiveAccount, TransactionButton, useActiveWalletChain } from 'thirdweb/react';
import { client } from '@/components/providers/thirdweb-provider';
import { prepareTransaction } from 'thirdweb';
import { defineChain } from 'thirdweb/chains';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: ActionEvent[];
  images?: ImageEvent[];
  status?: 'sending' | 'sent' | 'error';
}

interface ActionEvent {
  type: 'sign_transaction' | 'sign_swap' | 'monitor_transaction';
  data: any;
  request_id: string;
  session_id: string;
}

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
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  const [thinkingMessage, setThinkingMessage] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Get the connected wallet address
  const activeAccount = useActiveAccount();
  
  // Get the connected wallet's chain
  const activeChain = useActiveWalletChain();

  // Transaction preparation function
  const prepareTransactionFromAction = (actionData: any) => {
    return prepareTransaction({
      client,
      chain: defineChain(actionData.chain_id),
      to: actionData.to,
      value: BigInt(actionData.value || '0'),
      data: actionData.data,
    });
  };

  // Transaction success handler
  const handleTransactionSuccess = (receipt: any) => {
    console.log('Transaction confirmed:', receipt);
    // You can add additional success handling here, like updating UI or showing notifications
  };

  // Transaction error handler
  const handleTransactionError = (error: any) => {
    console.error('Transaction failed:', error);
    // You can add additional error handling here, like showing error notifications
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Clear thinking indicator when messages update with content
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content && isThinking) {
      console.log('Clearing thinking indicator due to message content');
      setIsThinking(false);
      setThinkingMessage(null);
    }
  }, [messages, isThinking]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

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

    // Create assistant message for streaming
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
      // Use the fetch-event-stream library to handle the event stream
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

      // Process the event stream
      for await (const event of events) {
        if (!event.data) {
          continue;
        }

        try {
          const parsedEventData = JSON.parse(event.data);
          
          // Hide thinking indicator immediately for any response content
          if (event.event === 'delta' || event.event === 'action' || event.event === 'image') {
            setIsThinking(false);
            setThinkingMessage(null);
          }
          
          switch (event.event) {
            case 'init': {
              console.log('Init event', parsedEventData);
              // Handle init event (session id and request id)
              if (parsedEventData.session_id) {
                setSessionId(parsedEventData.session_id);
              }
              if (parsedEventData.request_id) {
                setCurrentRequestId(parsedEventData.request_id);
              }
              break;
            }
            
            case 'presence': {
              console.log('Presence event', parsedEventData);
              // Handle intermediate thinking steps - show as thinking indicator
              if (parsedEventData.data && typeof parsedEventData.data === 'string') {
                console.log('Setting thinking message:', parsedEventData.data);
                setThinkingMessage(parsedEventData.data);
                setIsThinking(true);
              }
              break;
            }
            
            case 'delta': {
              console.log('Delta event', parsedEventData, 'isThinking:', isThinking);
              
              // Hide thinking indicator immediately when ANY delta event arrives
              if (isThinking) {
                console.log('Hiding thinking indicator on delta event');
                setIsThinking(false);
                setThinkingMessage(null);
              }
              
              // Handle delta event (streamed output text response)
              if (parsedEventData.v) {
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
              console.log('Action event', parsedEventData);
              
              // Hide thinking indicator when actions arrive (part of final response)
              if (isThinking) {
                setIsThinking(false);
                setThinkingMessage(null);
              }
              
              // Handle transaction signing, swaps, monitoring
              const actionData: ActionEvent = {
                type: parsedEventData.type,
                data: parsedEventData.data,
                request_id: parsedEventData.request_id,
                session_id: parsedEventData.session_id,
              };
              
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
              console.log('Image event', parsedEventData);
              
              // Hide thinking indicator when images arrive (part of final response)
              if (isThinking) {
                setIsThinking(false);
                setThinkingMessage(null);
              }
              
              // Handle image rendering
              const imageData: ImageEvent = {
                url: parsedEventData.url,
                width: parsedEventData.width,
                height: parsedEventData.height,
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
              console.log('Context event', parsedEventData);
              // Handle context changes (chain ids, wallet address, etc)
              break;
            }
            
            case 'error': {
              console.log('Error event', parsedEventData);
              // Hide thinking indicator on error
              setIsThinking(false);
              setThinkingMessage(null);
              
              // Handle error event
              setMessages(prev => 
                prev.map(msg => 
                  msg.id === assistantMessageId 
                    ? { 
                        ...msg, 
                        content: msg.content + '\n\n❌ Error: ' + (parsedEventData.data || 'An error occurred'),
                        status: 'error'
                      }
                    : msg
                )
              );
              break;
            }
            
            case 'done': {
              // Hide thinking indicator and mark message as complete
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
      // Clear thinking state on error
      setIsThinking(false);
      setThinkingMessage(null);
      
      setMessages(prev => 
        prev.map(msg => 
          msg.id === assistantMessageId 
            ? { 
                ...msg, 
                content: 'Sorry, I encountered an error while processing your request. Please try again.',
                status: 'error'
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className={`flex flex-col h-full max-w-4xl mx-auto ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full">
            <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Thirdweb AI Assistant
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Ask me anything about blockchain, tokens, or smart contracts
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">
          <ConnectButton client={client} />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              Welcome to Thirdweb AI
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Start a conversation by asking about blockchain development, token operations, 
              smart contracts, or any Web3-related questions.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {message.role === 'assistant' && (
              <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex-shrink-0">
                <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
            )}
            
            <div
              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.status === 'error'
                  ? 'bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100 border border-red-200 dark:border-red-800'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              }`}
            >
              {message.content && (
                  <Streamdown>{message.content}</Streamdown>
              )}
              
              {/* Render Images */}
              {message.images && message.images.length > 0 && (
                <div className="mt-2 space-y-2">
                  {message.images.map((image, index) => (
                    <div key={index} className="relative">
                      <img
                        src={image.url}
                        alt="AI generated content"
                        className="rounded-lg max-w-full h-auto"
                        style={{ maxWidth: Math.min(image.width, 400), maxHeight: Math.min(image.height, 300) }}
                      />
                    </div>
                  ))}
                </div>
              )}
              
              {/* Render Actions */}
              {message.actions && message.actions.length > 0 && (
                <div className="mt-3 space-y-2">
                  {message.actions.map((action, index) => (
                    <div key={index} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          {action.type === 'sign_transaction' && 'Transaction Ready to Sign'}
                          {action.type === 'sign_swap' && 'Swap Ready to Sign'}
                          {action.type === 'monitor_transaction' && 'Transaction Monitoring'}
                        </span>
                      </div>
                      
                      {action.type === 'sign_transaction' && (
                        <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                          <div><strong>To:</strong> {action.data.to}</div>
                          <div><strong>Value:</strong> {action.data.value ? `${Number(action.data.value) / 1e18} ETH` : '0 ETH'}</div>
                          <div><strong>Chain ID:</strong> {action.data.chain_id}</div>
                          {action.data.function && (
                            <div><strong>Function:</strong> {action.data.function}</div>
                          )}
                        </div>
                      )}
                      
                      {action.type === 'sign_swap' && (
                        <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                          <div><strong>Amount:</strong> {action.data.intent.amount}</div>
                          <div><strong>From:</strong>{action.data.intent.origin_token_address}</div>
                          <div><strong>To:</strong>{action.data.intent.destination_token_address}</div>
                          <div><strong>Chain:</strong> {action.data.intent.destination_chain_id}</div>
                        </div>
                      )}
                      
                      {action.type === 'monitor_transaction' && (
                        <div className="text-xs text-blue-800 dark:text-blue-200">
                          <div><strong>Transaction ID:</strong> {action.data.transaction_id}</div>
                        </div>
                      )}
                      
                      {action.type === 'sign_transaction' ? (
                        <TransactionButton
                          transaction={() => prepareTransactionFromAction(action.data)}
                          onTransactionConfirmed={handleTransactionSuccess}
                          onError={handleTransactionError}
                          className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                        >
                          Confirm Transaction
                        </TransactionButton>
                      ) : action.type === 'sign_swap' ? (
                        <TransactionButton
                          transaction={() => prepareTransactionFromAction(action.data.transaction)}
                          onTransactionConfirmed={handleTransactionSuccess}
                          onError={handleTransactionError}
                          className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                        >
                          Confirm Swap
                        </TransactionButton>
                      ) : (
                        <button className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">
                          View Transaction
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex items-center gap-2 text-xs opacity-70 mt-1">
                <span>{message.timestamp.toLocaleTimeString()}</span>
                {message.status === 'sending' && (
                  <span className="text-blue-500">Sending...</span>
                )}
                {message.status === 'error' && (
                  <span className="text-red-500">Error</span>
                )}
              </div>
            </div>

            {message.role === 'user' && (
              <div className="flex items-center justify-center w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex-shrink-0">
                <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </div>
            )}
          </div>
        ))}

        {/* Thinking indicator */}
        {isThinking === true && thinkingMessage && (
          <div className="flex gap-3 justify-start">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex-shrink-0">
              <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 max-w-[70%]">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <span className="text-sm text-blue-700 dark:text-blue-300 italic">
                  {thinkingMessage}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator (only when not thinking) */}
        {isLoading && !isThinking && (
          <div className="flex gap-3 justify-start">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex-shrink-0">
              <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about Web3, blockchain, or smart contracts..."
              className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
              rows={1}
              style={{ minHeight: '48px', maxHeight: '120px' }}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-gray-400 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
