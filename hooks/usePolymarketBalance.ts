"use client";

import useSWR from "swr";

interface BalanceResponse {
  cash: number;
  positions: number;
  available: number;
}

const fetcher = async (url: string): Promise<BalanceResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to fetch Polymarket balance");
  }
  const data = (await res.json()) as BalanceResponse;
  return {
    cash: Number(data.cash ?? 0),
    positions: Number(data.positions ?? 0),
    available: Number(data.available ?? 0),
  };
};

export function usePolymarketBalance(enabled = true) {
  const { data, error } = useSWR<BalanceResponse>(
    enabled ? "/api/polymarket/balance" : null,
    fetcher,
    {
      refreshInterval: 10_000,
      dedupingInterval: 5_000,
      revalidateOnFocus: false,
    }
  );

  return {
    balance: data ?? null,
    loading: enabled && !error && !data,
    error: error ?? null,
  };
}
