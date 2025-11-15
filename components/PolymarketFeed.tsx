"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import useSWR from "swr";

import { cn } from "@/lib/utils";

interface PolymarketTrade {
  id: string;
  ts: string;
  amountUSD: number;
  outcome: string;
  price: number;
  market: string;
  url?: string;
}

interface PolymarketFeedResponse {
  trades?: PolymarketTrade[];
  ok?: boolean;
  lastSync?: string | null;
}

const fetcher = async (url: string): Promise<PolymarketTrade[]> => {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Failed to load Polymarket feed.");
  }

  const payload: PolymarketFeedResponse = await response.json();

  if (!Array.isArray(payload.trades)) {
    return [];
  }

  return payload.trades;
};

function useFadeTracker(trades: PolymarketTrade[]) {
  const seenIds = useRef(new Set<string>());
  const animatingIds = useRef(new Set<string>());
  const timeouts = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      Object.values(timeouts.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timeouts.current = {};
    };
  }, []);

  useEffect(() => {
    if (trades.length === 0) {
      seenIds.current.clear();
      animatingIds.current.clear();
      Object.values(timeouts.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timeouts.current = {};
      return;
    }

    for (const trade of trades) {
      if (!seenIds.current.has(trade.id)) {
        seenIds.current.add(trade.id);
        animatingIds.current.add(trade.id);
        if (timeouts.current[trade.id]) {
          window.clearTimeout(timeouts.current[trade.id]!);
        }
        timeouts.current[trade.id] = window.setTimeout(() => {
          animatingIds.current.delete(trade.id);
          delete timeouts.current[trade.id];
        }, 700);
      }
    }
  }, [trades]);

  return (id: string) => animatingIds.current.has(id);
}

function usePolymarketFeed() {
  const { data, error } = useSWR<PolymarketTrade[]>(
    "/api/polymarket/feed",
    fetcher,
    {
      refreshInterval: 10_000,
      revalidateOnFocus: false,
      dedupingInterval: 5_000,
    }
  );

  return {
    data,
    error,
    trades: data ?? [],
  };
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: value >= 10_000 ? 0 : 2,
  });
}

function formatPrice(value: number) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: value >= 1 ? 2 : 4,
  });
}

function formatTimestamp(ts: string) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return ts;
  }

  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const diffMinutes = Math.floor(diff / 60_000);

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function PolymarketFeed({ className }: { className?: string }) {
  const { data, error, trades } = usePolymarketFeed();
  const isAnimating = useFadeTracker(trades);

  let content: ReactNode;

  if (!data) {
    content = (
      <div className="flex items-center justify-center py-12 text-sm text-sky-200/80">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-200/60 border-t-transparent" />
          <span>Loading Polymarket feed…</span>
        </div>
      </div>
    );
  } else if (error) {
    content = (
      <div className="py-12 text-center text-sm text-sky-200/70">
        Unable to load Polymarket feed right now.
      </div>
    );
  } else if (trades.length === 0) {
    content = (
      <div className="py-12 text-center text-sm text-sky-200/70">
        No large trades detected in the last 6 hours.
      </div>
    );
  } else {
    content = (
      <ul className="space-y-4">
        {trades.map((trade) => {
          const amount = formatCurrency(trade.amountUSD);
          const price = formatPrice(trade.price);
          const timestamp = formatTimestamp(trade.ts);

          return (
            <li
              key={trade.id}
              className={cn(
                "rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_8px_30px_rgba(10,30,70,0.28)] transition-transform duration-300 hover:-translate-y-1 hover:border-sky-200/40 hover:bg-white/10",
                isAnimating(trade.id) ? "feed-fade-in" : "opacity-90"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="line-clamp-2 text-sm font-semibold text-white/95">
                    {trade.market}
                  </div>
                  <div className="text-xs uppercase tracking-[0.3em] text-sky-200/70">
                    {trade.outcome || "Unknown"} @ {price}
                  </div>
                </div>
                <div className="shrink-0 text-right text-base font-semibold text-sky-100">
                  {amount}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-sky-200/70">
                <div>{timestamp}</div>
                {trade.url ? (
                  <a
                    href={trade.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-sky-200 hover:text-sky-100"
                  >
                    Open
                  </a>
                ) : (
                  <span className="font-medium text-sky-200/50">No link</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section
      className={cn(
        "rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1b3a]/70 via-[#0f2f5d]/65 to-[#1b3f7c]/55 p-6 text-white shadow-[0_0_30px_rgba(20,60,120,0.25)] backdrop-blur-xl",
        className
      )}
    >
      <header className="mb-6 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200/70">
          Polymarket activity
        </p>
        <h3 className="text-lg font-semibold text-white">Moonshot Order Stream</h3>
        <p className="text-sm text-sky-200/80">
          High-value matched orders streaming directly from the Polymarket live feed.
        </p>
      </header>
      {content}
    </section>
  );
}
