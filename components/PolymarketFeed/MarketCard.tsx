"use client";

import type { PolymarketTrade } from "@/lib/polymarket";
import { cn } from "@/lib/utils";

interface MarketCardProps {
  trade: PolymarketTrade;
  highlighted?: boolean;
  onTrade: () => void;
}

const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value >= 10_000 ? 0 : 2,
    maximumFractionDigits: value >= 10_000 ? 0 : 2,
  });

const formatPrice = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: value >= 1 ? 2 : 4,
    maximumFractionDigits: value >= 1 ? 2 : 4,
  });

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
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
};

export function MarketCard({ trade, highlighted, onTrade }: MarketCardProps) {
  return (
    <li
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-sm text-sky-100 shadow-[0_0_24px_rgba(48,128,255,0.12)] backdrop-blur-xl transition hover:border-white/20 hover:bg-white/10",
        highlighted && "fade-in"
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
        <span>
          {trade.outcome
            ? `${trade.outcome} @ ${formatPrice(trade.price)}`
            : formatPrice(trade.price)}
        </span>
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
          onClick={onTrade}
          className="rounded-xl bg-gradient-to-r from-[#1b3f7c] via-[#254d93] to-[#6aa8ff] px-4 py-1.5 text-xs font-semibold text-white shadow-[0_10px_30px_-20px_rgba(106,168,255,0.7)] transition hover:brightness-110"
        >
          Trade via AI
        </button>
      </div>
    </li>
  );
}
