"use client";

import useSWR from "swr";

import type { PolymarketBalanceSnapshot } from "@/lib/polymarket-client";
import { polymarketClient } from "@/lib/polymarket-client";

const balanceFetcher = async (): Promise<PolymarketBalanceSnapshot> => {
      const snapshot = await polymarketClient.getBalanceSnapshot();
  if (!snapshot) {
    throw new Error("Unable to fetch Polymarket balance");
  }
  return snapshot;
};

export function usePolymarketBalance(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<PolymarketBalanceSnapshot>(
    enabled ? "polymarket-balance" : null,
    balanceFetcher,
    {
      refreshInterval: 10_000,
      dedupingInterval: 5_000,
      revalidateOnFocus: false,
    }
  );

  return {
    balance: data ?? null,
    loading: Boolean(enabled && !data && !error && isLoading),
    error: error ?? null,
    refresh: mutate,
  };
}
