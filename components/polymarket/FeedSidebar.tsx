'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronUp } from 'lucide-react';
import useSWR from 'swr';

import { cn } from '@/lib/utils';

import { TradeOrb, type PolymarketTrade } from './TradeOrb';

interface PolymarketFeedResponse {
  trades?: PolymarketTrade[];
  error?: string;
}

interface FeedSidebarProps {
  className?: string;
}

const REFRESH_INTERVAL_MS = 10_000;
const ESTIMATED_ORB_ROW_HEIGHT = 184;

const fetchPolymarketTrades = async (url: string): Promise<PolymarketTrade[]> => {
  const response = await fetch(url, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error('Failed to fetch Polymarket feed.');
  }

  const payload: PolymarketFeedResponse = await response.json();

  if (!Array.isArray(payload?.trades)) {
    return [];
  }

  return payload.trades;
};

function usePolymarketFeed() {
  const swrResponse = useSWR<PolymarketTrade[], Error>(
    '/api/polymarket/feed',
    fetchPolymarketTrades,
    {
      refreshInterval: REFRESH_INTERVAL_MS,
      revalidateOnFocus: false,
      dedupingInterval: 5_000,
    }
  );

  const trades = swrResponse.data ?? [];

  return {
    ...swrResponse,
    trades,
  };
}

function SidebarPanel() {
  const { trades, error, isLoading } = usePolymarketFeed();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const fadeTimeoutsRef = useRef<Record<string, number>>({});
  const [recentlyAnimated, setRecentlyAnimated] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const timeouts = fadeTimeoutsRef.current;
    return () => {
      Object.values(timeouts).forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
    };
  }, []);

  useEffect(() => {
    if (trades.length === 0) {
      seenIdsRef.current.clear();
      Object.values(fadeTimeoutsRef.current).forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      fadeTimeoutsRef.current = {};
      setRecentlyAnimated({});
      return;
    }

    const newIds: string[] = [];

    for (const trade of trades) {
      if (!seenIdsRef.current.has(trade.id)) {
        seenIdsRef.current.add(trade.id);
        newIds.push(trade.id);
      }
    }

    if (newIds.length === 0) {
      return;
    }

    setRecentlyAnimated(prev => {
      const next = { ...prev };
      newIds.forEach(id => {
        next[id] = true;
      });
      return next;
    });

    newIds.forEach(id => {
      if (fadeTimeoutsRef.current[id]) {
        window.clearTimeout(fadeTimeoutsRef.current[id]);
      }

      fadeTimeoutsRef.current[id] = window.setTimeout(() => {
        setRecentlyAnimated(prev => {
          if (!prev[id]) {
            return prev;
          }

          const next = { ...prev };
          delete next[id];
          return next;
        });
        delete fadeTimeoutsRef.current[id];
      }, 800);
    });

    return () => {
      newIds.forEach(id => {
        const timeoutId = fadeTimeoutsRef.current[id];
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          delete fadeTimeoutsRef.current[id];
        }
      });
    };
  }, [trades]);

  const virtualizer = useVirtualizer({
    count: trades.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => ESTIMATED_ORB_ROW_HEIGHT,
    overscan: 12,
  });

  const emptyState = useMemo(() => trades.length === 0 && !isLoading, [trades.length, isLoading]);

  return (
    <div className="flex max-h-[calc(100vh-6rem)] flex-col gap-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200/70">Polymarket feed</p>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">High-impact BeaverXBT flows</h2>
          <p className="text-sm text-sky-200/80">
            {'Live trades above 800 USDC. Auto-refreshes every 10 seconds.'}
          </p>
        </div>
        <div className="flex items-center justify-between text-xs text-sky-200/70">
          <span>{trades.length > 0 ? `${Math.min(trades.length, 50)} signals streaming` : 'Awaiting signals'}</span>
          <span>Last sync • realtime</span>
        </div>
      </header>

      <div className="relative rounded-2xl border border-white/5 bg-white/5">
        <div
          ref={scrollParentRef}
          className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-2"
          style={{ scrollbarWidth: 'thin' }}
        >
          {emptyState ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-sky-200/70">
              {error ? 'Unable to load Polymarket trades right now.' : 'No large trades detected yet.'}
            </div>
          ) : (
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map(virtualRow => {
                const trade = trades[virtualRow.index];

                if (!trade) {
                  return null;
                }

                const isRecent = Boolean(recentlyAnimated[trade.id]);

                return (
                  <div
                    key={virtualRow.key}
                    ref={virtualRow.measureElement}
                    className="absolute left-0 right-0"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div
                      className={cn(
                        'flex justify-center py-4 transition-opacity duration-500 hover:opacity-100',
                        isRecent ? 'orb-fade-in' : 'opacity-90'
                      )}
                    >
                      <TradeOrb trade={trade} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FeedSidebar({ className }: FeedSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <aside className={cn('w-full lg:w-[360px] lg:flex-none lg:self-stretch', className)}>
      <div className="hidden lg:block">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1b3a]/90 to-[#0f2f5d]/90 p-6 text-white shadow-[0_0_40px_rgba(48,128,255,0.12)] backdrop-blur-xl lg:sticky lg:top-10">
          <SidebarPanel />
        </div>
      </div>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-[#0b1b3a]/95 to-[#0f2f5d]/95 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(48,128,255,0.18)] backdrop-blur-xl"
          aria-expanded={isOpen}
          aria-controls={panelId}
        >
          <span>Market intel</span>
          {isOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
        {isOpen ? (
          <div
            id={panelId}
            className="mt-4 rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1b3a]/95 to-[#0f2f5d]/95 p-5 text-white shadow-[0_0_28px_rgba(48,128,255,0.12)] backdrop-blur-xl"
          >
            <SidebarPanel />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
