"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import useSWR from "swr";

import { cn } from "@/lib/utils";
import type { PolymarketTrade } from "@/lib/polymarket";
import { useChatHistoryStore } from "@/store/chatHistory";
import type { ChatMessage } from "@/types/chat";
import { useToast } from "@/components/Toast";
import { MarketCard } from "./PolymarketFeed/MarketCard";
import {
  PolymarketOrderModal,
  type OrderModalTrade,
  type OrderModalResult,
} from "./modals/PolymarketOrderModal";
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
      Object.values(timers).forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      Object.keys(timers).forEach(key => {
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
      Object.values(timers).forEach(timeoutId => {
        window.clearTimeout(timeoutId);
      });
      Object.keys(timers).forEach(key => {
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

    setActiveIds(prev => {
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
        setActiveIds(prev => {
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

interface PolymarketFeedProps {
  className?: string;
  isWalletConnected: boolean;
}

const normalizeOutcomeIndex = (trade: PolymarketTrade) => {
  const numeric = Number(trade.outcomeId);
  if (Number.isFinite(numeric)) {
    return numeric === 0 ? 0 : 1;
  }
  return trade.outcome === "NO" ? 0 : 1;
};

const normalizeSide = (side: string) => (side?.trim().toUpperCase() === "SELL" ? "SELL" : "BUY");

const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatPrice = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Market";
  }
  return value.toFixed(value >= 1 ? 2 : 4);
};

const createMessageId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function PolymarketFeed({ className, isWalletConnected }: PolymarketFeedProps) {
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
  const addOrderReceipt = useChatHistoryStore(state => state.addOrderReceipt);
  const addChatMessage = useChatHistoryStore(state => state.addMessage);
  const activeChatId = useChatHistoryStore(state => state.activeChatId);
  const { error: showError } = useToast();
  const [selectedTrade, setSelectedTrade] = useState<OrderModalTrade | null>(null);

  const handleTradeClick = useCallback(
    (trade: PolymarketTrade) => {
      if (!trade.marketId) {
        showError("Unable to trade this market because it is missing an ID.");
        return;
      }

      const outcomeIndex = normalizeOutcomeIndex(trade);
      const normalizedSide = normalizeSide(trade.side);

      setSelectedTrade({
        marketId: trade.marketId,
        market: trade.market,
        outcome: outcomeIndex === 0 ? "NO" : "YES",
        outcomeIndex,
        side: normalizedSide,
        referencePrice: Number.isFinite(trade.price) ? trade.price : null,
        defaultAmount:
          Number.isFinite(trade.amountUSD) && trade.amountUSD > 0
            ? Math.round(trade.amountUSD)
            : undefined,
        slug: trade.slug,
      });
    },
    [showError]
  );

  const handleOrderComplete = useCallback(
    (result: OrderModalResult) => {
      addOrderReceipt(result.receipt);

      if (!activeChatId) {
        return;
      }

      const outcomeLabel =
        result.receipt.outcome ??
        (result.receipt.outcomeIndex === 0 ? "NO" : "YES");
      const messageLines = [
        "Order executed on Polymarket",
        `• Market: ${result.receipt.market ?? "Polymarket market"}`,
        `• Outcome: ${outcomeLabel} (${result.receipt.side})`,
        `• Price: ${formatPrice(result.price ?? result.receipt.price)}`,
        `• Size: ${formatCurrency(result.receipt.size)}`,
        `• Timestamp: ${new Date(result.executedAt).toLocaleString()}`,
      ];
      if (result.orderId) {
        messageLines.push(`• Order ID: ${result.orderId}`);
      }

      const message: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: messageLines.join("\n"),
        timestamp: new Date(result.executedAt).toISOString(),
        status: "sent",
      };

      addChatMessage(activeChatId, message);
    },
    [activeChatId, addChatMessage, addOrderReceipt]
  );

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
    <>
      <ul className={cn("flex flex-col gap-4", className)}>
        {trades.map(trade => (
          <MarketCard
            key={trade.id}
            trade={trade}
            highlighted={isAnimating(trade.id)}
            onTrade={() => handleTradeClick(trade)}
          />
        ))}
      </ul>
      <PolymarketOrderModal
        isOpen={Boolean(selectedTrade)}
        trade={selectedTrade}
        onClose={() => setSelectedTrade(null)}
        onSuccess={result => {
          handleOrderComplete(result);
          setSelectedTrade(null);
        }}
      />
    </>
  );
}
