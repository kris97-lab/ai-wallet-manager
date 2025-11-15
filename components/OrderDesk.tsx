"use client";

import { useMemo, useRef, useState, FormEvent } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  WagmiProvider,
  createConfig,
  http,
} from "wagmi";
import { polygon } from "wagmi/chains";
import { MetaMaskConnector } from "wagmi/connectors/metaMask";
import { Loader2, RefreshCcw, Wallet } from "lucide-react";

import { usePolymarket } from "@/hooks/usePolymarket";
import { useToast } from "@/components/Toast";
import type { SubmitOrderRequest } from "@/lib/polymarket-client";

interface OrderDeskProps {
  className?: string;
}

const wagmiConfig = createConfig({
  ssr: false,
  chains: [polygon],
  connectors: [new MetaMaskConnector({ chains: [polygon] })],
  transports: {
    [polygon.id]: http(),
  },
});

export function OrderDesk({ className }: OrderDeskProps) {
  const queryClientRef = useRef<QueryClient>();
  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient();
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClientRef.current}>
        <OrderDeskContent className={className} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function OrderDeskContent({ className }: OrderDeskProps) {
  const {
    connect,
    connectors,
    connectError,
    isConnecting,
    disconnect,
    isConnected,
    address,
    markets,
    marketsLoading,
    balance,
    balanceLoading,
    submitOrder,
    placingOrder,
    receipts,
  } = usePolymarket();
  const { success, error } = useToast();

  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(undefined);
  const [outcome, setOutcome] = useState<"YES" | "NO">("YES");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("0.10");
  const [price, setPrice] = useState("0.52");

  const marketsList = useMemo(() => (markets.length > 0 ? markets : []), [markets]);
  const activeMarket = useMemo(() => {
    if (selectedSlug) {
      return marketsList.find(entry => entry.slug === selectedSlug) ?? marketsList[0];
    }
    return marketsList[0];
  }, [marketsList, selectedSlug]);

  const handleSelectMarket = (slug: string) => {
    setSelectedSlug(slug);
    const matched = marketsList.find(entry => entry.slug === slug);
    if (matched) {
      const fallbackPrice = matched.outcomes[0]?.price ?? 0.5;
      setPrice((fallbackPrice ?? 0.5).toFixed(2));
    }
  };

  const normalizedAmount = Number(amount);
  const normalizedPrice = price ? Number(price) : null;
  const isValidAmount = Number.isFinite(normalizedAmount) && normalizedAmount > 0;
  const insufficientBalance =
    isValidAmount && balance ? balance.available < normalizedAmount : false;

  const handleConnect = async () => {
    const connector = connectors[0];
    if (!connector) {
      error("MetaMask connector not found.");
      return;
    }
    try {
      await connect({ connector });
    } catch (err) {
      error(
        err instanceof Error ? err.message : "Unable to connect MetaMask for Polymarket trading."
      );
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeMarket) {
      error("Select a market first");
      return;
    }
    if (!isValidAmount) {
      error("Enter a valid trade size in USDC.");
      return;
    }
    try {
      const payload: SubmitOrderRequest = {
        marketId: activeMarket.id,
        slug: activeMarket.slug,
        outcome,
        side,
        size: normalizedAmount,
        price: normalizedPrice,
      };
      await submitOrder(payload);
      success("Order submitted to Polymarket CLOB.");
    } catch (err) {
      error(err instanceof Error ? err.message : "Polymarket order failed");
    }
  };

  return (
    <div
      className={`rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-white shadow-[0_35px_80px_-50px_rgba(42,117,255,0.9)] backdrop-blur-xl ${className ?? ""}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-sky-200/80">
            Polymarket Trade Engine
          </p>
          <p className="text-sm text-sky-100/70">Place Polygon market orders instantly.</p>
        </div>
        <div className="flex flex-col items-end text-right text-xs text-sky-100/80">
          <span>Cash Balance</span>
          <strong className="text-base text-white">
            {balanceLoading ? "…" : `$${(balance?.available ?? 0).toFixed(2)}`}
          </strong>
        </div>
      </div>

      {!isConnected ? (
        <button
          type="button"
          onClick={handleConnect}
          disabled={isConnecting}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white shadow-[0_25px_60px_-40px_rgba(65,129,255,0.9)] transition hover:border-white/40"
        >
          {isConnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wallet className="h-4 w-4" />
          )}
          {isConnecting ? "Connecting" : "Connect MetaMask"}
        </button>
      ) : (
        <div className="mb-4 flex items-center justify-between text-xs text-sky-100/70">
          <span className="truncate">{address}</span>
          <button
            type="button"
            onClick={() => disconnect()}
            className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/80 hover:border-white/30"
          >
            Disconnect
          </button>
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-xs font-semibold uppercase tracking-[0.4em] text-sky-200/60">
          Market
          <select
            value={activeMarket?.slug ?? ""}
            onChange={event => handleSelectMarket(event.target.value)}
            disabled={!isConnected || marketsLoading}
            className="mt-2 w-full rounded-2xl border border-white/15 bg-[#0b1f44]/70 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
          >
            {marketsList.length === 0 && <option value="">Loading markets…</option>}
            {marketsList.map(market => (
              <option key={market.id} value={market.slug}>
                {market.question}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-sky-200/70">
          <button
            type="button"
            onClick={() => setOutcome("YES")}
            className={`rounded-2xl border px-3 py-2 transition ${
              outcome === "YES"
                ? "border-sky-300 bg-sky-500/20 text-white"
                : "border-white/15 bg-white/5"
            }`}
          >
            Outcome · YES
          </button>
          <button
            type="button"
            onClick={() => setOutcome("NO")}
            className={`rounded-2xl border px-3 py-2 transition ${
              outcome === "NO"
                ? "border-sky-300 bg-sky-500/20 text-white"
                : "border-white/15 bg-white/5"
            }`}
          >
            Outcome · NO
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-sky-200/70">
          <button
            type="button"
            onClick={() => setSide("BUY")}
            className={`rounded-2xl border px-3 py-2 transition ${
              side === "BUY"
                ? "border-emerald-300 bg-emerald-500/20 text-white"
                : "border-white/15 bg-white/5"
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setSide("SELL")}
            className={`rounded-2xl border px-3 py-2 transition ${
              side === "SELL"
                ? "border-rose-300 bg-rose-500/20 text-white"
                : "border-white/15 bg-white/5"
            }`}
          >
            Sell
          </button>
        </div>

        <label className="block text-xs font-semibold uppercase tracking-[0.4em] text-sky-200/60">
          Amount (USDC)
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={event => setAmount(event.target.value)}
            disabled={!isConnected}
            className="mt-2 w-full rounded-2xl border border-white/15 bg-[#0b1f44]/70 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
          />
        </label>

        <label className="block text-xs font-semibold uppercase tracking-[0.4em] text-sky-200/60">
          Limit price
          <input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={event => setPrice(event.target.value)}
            disabled={!isConnected}
            className="mt-2 w-full rounded-2xl border border-white/15 bg-[#0b1f44]/70 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={!isConnected || placingOrder || insufficientBalance || !isValidAmount}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-sky-500/60 to-blue-600/60 px-4 py-3 text-sm font-semibold text-white shadow-[0_25px_70px_-40px_rgba(51,117,255,0.8)] transition hover:shadow-[0_35px_80px_-35px_rgba(51,117,255,0.8)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {placingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          {placingOrder ? "Submitting order" : "Place marketable limit order"}
        </button>
        {insufficientBalance && (
          <p className="text-center text-xs text-rose-200/80">
            Available Polymarket balance is too low for this trade.
          </p>
        )}
        {connectError && (
          <p className="text-center text-xs text-rose-200/80">{connectError.message}</p>
        )}
      </form>

      {receipts.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.3em] text-sky-200/70">
            <span>Order receipts</span>
          </div>
          <div className="space-y-3 text-sm text-sky-100/80">
            {receipts.slice(0, 4).map(receipt => (
              <div key={receipt.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-[13px] font-semibold text-white">{receipt.question}</p>
                <p className="text-xs text-sky-200/80">
                  {receipt.side} {receipt.outcome} · ${receipt.size.toFixed(2)} @
                  {receipt.price ? ` ${receipt.price.toFixed(3)}` : " market"}
                </p>
                <p className="text-[11px] text-slate-200/60">
                  {new Date(receipt.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
