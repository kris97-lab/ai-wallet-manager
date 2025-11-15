"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";

import { submitPolymarketOrder } from "@/lib/polymarket/submitOrder";
import type { OrderReceiptInput } from "@/store/chatHistory";
import { useToast } from "@/components/Toast";

export interface OrderModalTrade {
  marketId: string;
  market: string;
  outcome: "YES" | "NO";
  outcomeIndex: number;
  side: "BUY" | "SELL";
  referencePrice: number | null;
  defaultAmount?: number;
}

interface PolymarketOrderModalProps {
  isOpen: boolean;
  trade: OrderModalTrade | null;
  onClose: () => void;
  onSuccess?: (receipt: OrderReceiptInput) => void;
}

export function PolymarketOrderModal({
  isOpen,
  trade,
  onClose,
  onSuccess,
}: PolymarketOrderModalProps) {
  const [amount, setAmount] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    if (trade?.defaultAmount) {
      setAmount(String(trade.defaultAmount));
    } else {
      setAmount("");
    }
  }, [trade]);

  if (!isOpen || !trade) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number.parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      error("Enter a valid USDC amount to place this order.");
      return;
    }

    setIsSubmitting(true);
    const result = await submitPolymarketOrder({
      marketId: trade.marketId,
      outcomeIndex: trade.outcomeIndex,
      side: trade.side,
      size: parsed,
      price: null,
    });
    setIsSubmitting(false);

    if (!result.ok) {
      error(result.error ?? "Order rejected by Polymarket.");
      return;
    }

    success("Order successfully submitted to Polymarket CLOB.");
    onSuccess?.({
      marketId: trade.marketId,
      outcomeIndex: trade.outcomeIndex,
      side: trade.side,
      size: parsed,
      market: trade.market,
      outcome: trade.outcome,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl border border-white/15 bg-[#0a1d3f]/95 p-6 text-white shadow-[0_30px_120px_-50px_rgba(20,60,140,0.9)] backdrop-blur-3xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-white/70 transition hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-4 text-xs font-semibold uppercase tracking-[0.35em] text-[#8ec5ff]">
          BeaverXBT Order Desk
        </div>
        <h3 className="text-lg font-semibold">{trade.market}</h3>
        <p className="mt-1 text-sm text-[#b7d8ff]">
          {trade.side} {trade.outcome} • Polygon CLOB
        </p>
        {trade.referencePrice != null ? (
          <p className="mt-2 text-xs text-[#86bbff]">
            Reference price: {trade.referencePrice.toFixed(trade.referencePrice >= 1 ? 2 : 4)}
          </p>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-[#8ec5ff]">
            USDC Amount
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={event => setAmount(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-[#6aa8ff] focus:outline-none"
              placeholder="Enter amount"
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-gradient-to-r from-[#1b3f7c] via-[#254d93] to-[#6aa8ff] px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_60px_-35px_rgba(45,121,255,0.9)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting order…
              </>
            ) : (
              "Place Market Order"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
