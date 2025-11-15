"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { polygon } from "wagmi/chains";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  polymarketClient,
  type GammaMarket,
  type PolymarketBalanceSnapshot,
  type SubmitOrderRequest,
  type SubmitOrderResult,
} from "@/lib/polymarket-client";

interface OrderReceipt {
  id: string;
  marketId: string;
  slug?: string;
  question: string;
  outcome: "YES" | "NO";
  side: "BUY" | "SELL";
  size: number;
  price?: number | null;
  timestamp: number;
}

const RECEIPTS_KEY = "beaverxbt-poly-order-receipts";

const readReceipts = (): OrderReceipt[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(RECEIPTS_KEY);
    return raw ? (JSON.parse(raw) as OrderReceipt[]) : [];
  } catch {
    return [];
  }
};

const writeReceipts = (entries: OrderReceipt[]) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(RECEIPTS_KEY, JSON.stringify(entries.slice(0, 50)));
  } catch {
    // ignore storage errors
  }
};

export interface UsePolymarketState {
  address?: string;
  isConnected: boolean;
  isConnecting: boolean;
  connect: ReturnType<typeof useConnect>["connect"];
  connectors: ReturnType<typeof useConnect>["connectors"];
  connectError: ReturnType<typeof useConnect>["error"];
  disconnect: ReturnType<typeof useDisconnect>["disconnect"];
  switchChain: ReturnType<typeof useSwitchChain>["switchChainAsync"];
  isSwitching: boolean;
  markets: GammaMarket[];
  marketsLoading: boolean;
  refreshMarkets: () => Promise<void>;
  balance: PolymarketBalanceSnapshot | null;
  balanceLoading: boolean;
  refreshBalance: () => Promise<void>;
  submitOrder: (request: SubmitOrderRequest) => Promise<SubmitOrderResult>;
  placingOrder: boolean;
  lastError: string | null;
  lastResult: SubmitOrderResult | null;
  receipts: OrderReceipt[];
}

export function usePolymarket(): UsePolymarketState {
  const { address, isConnected } = useAccount();
  const { connect, connectors, error: connectError, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();

  const [receipts, setReceipts] = useState<OrderReceipt[]>(() => readReceipts());
  const [placingOrder, setPlacingOrder] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SubmitOrderResult | null>(null);

  useEffect(() => {
    polymarketClient.setWalletClient(walletClient ?? undefined);
    if (!walletClient && !isConnected) {
      polymarketClient.resetSession();
    }
  }, [isConnected, walletClient]);

  const marketsQuery = useQuery({
    queryKey: ["polymarket", "markets"],
    queryFn: () => polymarketClient.fetchMarkets(24),
    enabled: isConnected,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const balanceQuery = useQuery({
    queryKey: ["polymarket", "balance", address ?? "unknown"],
    queryFn: () => polymarketClient.getBalanceSnapshot(),
    enabled: isConnected,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const appendReceipt = useCallback(
    (entry: Omit<OrderReceipt, "id" | "timestamp">) => {
      const next: OrderReceipt = {
        ...entry,
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: Date.now(),
      };
      setReceipts(prev => {
        const updated = [next, ...prev].slice(0, 50);
        writeReceipts(updated);
        return updated;
      });
    },
    []
  );

  const refreshMarkets = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["polymarket", "markets"] });
  }, [queryClient]);

  const refreshBalance = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["polymarket", "balance", address ?? "unknown"] });
  }, [address, queryClient]);

  const submitOrder = useCallback(
    async (request: SubmitOrderRequest): Promise<SubmitOrderResult> => {
      if (!isConnected) {
        throw new Error("Connect MetaMask before trading on Polymarket");
      }
      setPlacingOrder(true);
      setLastError(null);
      try {
        await switchChainAsync({ chainId: polygon.id });
      } catch (error) {
        console.warn("Unable to switch to Polygon", error);
      }

      try {
        const result = await polymarketClient.submitOrder(request);
        setLastResult(result);
        appendReceipt({
          marketId: request.marketId,
          slug: request.slug,
          question: request.slug ?? request.marketId,
          outcome: request.outcome,
          side: request.side,
          size: request.size,
          price: request.price ?? null,
        });
        await Promise.all([refreshBalance(), refreshMarkets()]);
        return result;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to submit Polymarket order";
        setLastError(message);
        throw error;
      } finally {
        setPlacingOrder(false);
      }
    },
    [appendReceipt, isConnected, refreshBalance, refreshMarkets, switchChainAsync]
  );

  const markets = marketsQuery.data ?? [];
  const balance = balanceQuery.data ?? null;

  return {
    address,
    isConnected,
    isConnecting,
    connect,
    connectors,
    connectError,
    disconnect,
    switchChain: switchChainAsync,
    isSwitching,
    markets,
    marketsLoading: marketsQuery.isLoading,
    refreshMarkets,
    balance,
    balanceLoading: balanceQuery.isLoading,
    refreshBalance,
    submitOrder,
    placingOrder,
    lastError,
    lastResult,
    receipts,
  };
}
