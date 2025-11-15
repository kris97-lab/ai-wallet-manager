"use client";

import { useMemo } from "react";

import { Tooltip, TooltipArrow, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface PolymarketTrade {
  id: string;
  market: string;
  outcome: string;
  side: string;
  size: number;
  price: number;
  timestamp: string;
}

interface TradeOrbProps {
  trade: PolymarketTrade;
}

const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  const diffMs = Date.now() - date.getTime();

  if (diffMs <= 0) {
    return "just now";
  }

  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  return `${days}d ago`;
};

const truncate = (value: string, limit = 50): string => {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1)}…`;
};

export function TradeOrb({ trade }: TradeOrbProps) {
  const relativeTime = useMemo(() => formatRelativeTime(trade.timestamp), [trade.timestamp]);
  const truncatedMarket = useMemo(() => truncate(trade.market, 50), [trade.market]);
  const normalizedSide = trade.side.toUpperCase();
  const normalizedOutcome = trade.outcome.toUpperCase();

  const formattedPrice = useMemo(
    () =>
      trade.price.toLocaleString("en-US", {
        minimumFractionDigits: trade.price >= 1 ? 2 : 4,
        maximumFractionDigits: trade.price >= 1 ? 2 : 4,
      }),
    [trade.price]
  );

  const formattedSize = useMemo(
    () =>
      trade.size.toLocaleString("en-US", {
        minimumFractionDigits: Number.isInteger(trade.size) ? 0 : 2,
        maximumFractionDigits: 2,
      }),
    [trade.size]
  );

  return (
    <TooltipProvider delayDuration={120} disableHoverableContent>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="group relative h-[140px] w-[140px] cursor-pointer outline-none transition-transform duration-500 ease-out will-change-transform focus-visible:scale-[1.14] focus-visible:ring-2 focus-visible:ring-sky-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent hover:scale-[1.14]"
            aria-label={`${normalizedSide} ${normalizedOutcome} ${formattedSize} USDC`}
          >
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="absolute inset-0 animate-[orbFloat_9s_ease-in-out_infinite]">
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(106,168,255,0.35),rgba(27,63,124,0.65)_60%,rgba(10,27,58,0.9)_95%)]" />
                <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(circle,rgba(155,203,255,0.55),rgba(46,116,202,0.25)_65%,transparent_85%)] opacity-90 animate-[orbGlowPulse_14s_ease-in-out_infinite]" />
                <div className="absolute inset-[20%] rounded-full bg-[radial-gradient(circle,rgba(106,168,255,0.58),transparent_70%)] mix-blend-screen blur-2xl opacity-75" />
              </div>
            </div>

            <div className="absolute inset-0 rounded-full border border-white/15 bg-white/5 shadow-[0_0_28px_rgba(106,168,255,0.28)] transition-all duration-500 group-hover:border-sky-200/50 group-hover:shadow-[0_0_36px_rgba(106,168,255,0.35)]" />

            <div className="relative flex h-full w-full items-center justify-center text-center">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-100/80">
                  {normalizedSide}
                </p>
                <p className="text-sm font-semibold text-white/95">{normalizedOutcome}</p>
                <p className="text-lg font-bold text-sky-100">
                  ${formattedSize}
                </p>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          className="w-64 rounded-2xl border border-white/12 bg-gradient-to-br from-[#0b1b3a]/95 to-[#0f2f5d]/95 p-5 text-left text-sky-100 shadow-[0_0_36px_rgba(106,168,255,0.25)]"
        >
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white/95">{truncatedMarket}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-sky-200/70">Side</dt>
                <dd className="font-semibold text-white/90">{normalizedSide}</dd>
              </div>
              <div>
                <dt className="text-sky-200/70">Outcome</dt>
                <dd className="font-semibold text-white/90">{normalizedOutcome}</dd>
              </div>
              <div>
                <dt className="text-sky-200/70">Price</dt>
                <dd className="font-semibold text-white/90">${formattedPrice}</dd>
              </div>
              <div>
                <dt className="text-sky-200/70">Size</dt>
                <dd className="font-semibold text-white/90">${formattedSize} USDC</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-sky-200/70">Time</dt>
                <dd className="font-medium text-white/80">{relativeTime}</dd>
              </div>
            </dl>
          </div>
          <TooltipArrow className="fill-[#0b1b3a]" />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
