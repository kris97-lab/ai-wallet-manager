"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { cn } from "@/lib/utils";
import type { PolymarketTrade } from "@/lib/polymarket";
import "@/styles/feed-animation.css";

interface PolymarketFeedResponse {
  trades?: PolymarketTrade[];
  ok?: boolean;
  lastSync?: string;
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
  const timeouts = useRef<Record<string, number>>({});
  const [activeIds, setActiveIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const seen = seenIds.current;
    const timers = timeouts.current;

    return () => {
      Object.values(timers).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      Object.keys(timers).forEach((key) => {
        delete timers[key];
      });
      seen.clear();
      setActiveIds({});
    };
  }, []);

  useEffect(() => {
    if (trades.length === 0) {
      const timers = timeouts.current;
      seenIds.current.clear();
      Object.values(timers).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      Object.keys(timers).forEach((key) => {
        delete timers[key];
      });
      setActiveIds({});
      return;
    }

    const timers = timeouts.current;
    const newIds: string[] = [];

    for (const trade of trades) {
      if (!seenIds.current.has(trade.id)) {
        seenIds.current.add(trade.id);
        newIds.push(trade.id);
      }
    }

    if (newIds.length === 0) {
      return;
    }

    setActiveIds((prev) => {
      const next = { ...prev };
      for (const id of newIds) {
        next[id] = true;
      }
      return next;
    });

    for (const id of newIds) {
      const existingTimeout = timers[id];
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
      }
      timers[id] = window.setTimeout(() => {
        setActiveIds((prev) => {
          if (!prev[id]) {
            return prev;
          }
          const next = { ...prev };
          delete next[id];
          return next;
        });
        delete timers[id];
      }, 600);
    }

    return () => {
      for (const id of newIds) {
        const timeoutId = timers[id];
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          delete timers[id];
        }
      }
    };
  }, [trades]);

  return (id: string) => Boolean(activeIds[id]);
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 10_000 ? 0 : 2,
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

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) {
    return "just now";
  }

  const diffMinutes = Math.floor(diffMs / 60_000);
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

interface PolymarketFeedProps {
  className?: string;
  isWalletConnected: boolean;
  onTrade?: (message: string) => void;
}

export function PolymarketFeed({
  className,
  isWalletConnected,
  onTrade,
}: PolymarketFeedProps) {
  const { data, error } = useSWR<PolymarketTrade[]>(
    isWalletConnected ? "/api/polymarket/feed" : null,
    fetcher,
    {
      refreshInterval: 10_000,
      revalidateOnFocus: false,
      dedupingInterval: 5_000,
    }
  );

  const trades = data ?? [];
  const isAnimating = useFadeTracker(trades);

  if (!isWalletConnected) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-center text-sm text-sky-200/80",
          className
        )}
      >
        Connect wallet to unlock the BeaverXBT live Polymarket feed.
      </div>
    );
  }

  if (!data && !error) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-sky-200/80",
          className
        )}
      >
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky-200/60 border-t-transparent" />
          <span>Loading Polymarket feed…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center rounded-2xl border border-red-400/30 bg-red-500/10 text-sm text-red-200",
          className
        )}
      >
        Unable to load Polymarket trades right now.
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-[160px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-center text-sm text-sky-200/80",
          className
        )}
      >
        No large trades detected in the last 6 hours.
      </div>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-4", className)}>
      {trades.map((trade) => (
        <li
          key={trade.id}
          className={cn(
            "rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-sm text-sky-100 shadow-[0_0_24px_rgba(48,128,255,0.12)] backdrop-blur-xl transition hover:border-white/20 hover:bg-white/10",
            isAnimating(trade.id) ? "fade-in" : undefined
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <span className="text-base font-semibold text-white">{trade.market}</span>
            <span className="whitespace-nowrap text-sm font-semibold text-emerald-300">
              {formatCurrency(trade.amountUSD)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-sky-200/80">
            <span className="rounded-full bg-white/10 px-2 py-1 font-medium uppercase tracking-wide text-white/80">
              {trade.side || "—"}
            </span>
            <span>{trade.outcome ? `${trade.outcome} @ ${formatPrice(trade.price)}` : formatPrice(trade.price)}</span>
            <div className="ml-auto flex items-center gap-2">
              {trade.url ? (
                <a
                  href={trade.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/30"
                >
                  Open
                </a>
              ) : null}
              <span className="text-[11px] uppercase tracking-wider text-sky-300/70">
                {formatTimestamp(trade.ts)}
              </span>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                const message = `Place Polymarket order: ${trade.side || ""} ${trade.outcome || ""} on '${trade.market}' for $${trade.amountUSD}. Market order.`.replace(/\s+/g, " ").trim();
                if (onTrade) {
                  onTrade(message);
                  return;
                }
                console.log(message);
              }}
              className="rounded-xl bg-gradient-to-r from-[#1b3f7c] via-[#254d93] to-[#6aa8ff] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_10px_30px_-20px_rgba(106,168,255,0.7)] transition hover:brightness-110"
            >
              Trade via AI
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
