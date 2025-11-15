import { NextResponse } from "next/server";

const SOURCES = [
  "https://api-v2.moonapi.xyz/polymarket/feed",
  "https://polymarket.moonapi.xyz/feed",
  "https://api.moonapi.ai/polymarket/feed"
];

export const revalidate = 0;

type RawTrade = {
  id?: string | number;
  market?: string;
  outcome?: string;
  side?: string;
  size?: number | string;
  price?: number | string;
  timestamp?: number | string;
  maker?: string;
  taker?: string;
};

type RawFeed = {
  trades?: unknown;
};

type NormalizedTrade = {
  id: string;
  market: string;
  outcome: string;
  side: string;
  size: number;
  price: number;
  timestamp: string;
  maker: string;
  taker: string;
};

function normalizeTrade(trade: RawTrade): NormalizedTrade {
  const id = trade.id != null ? String(trade.id) : "";
  const size = Number(trade.size ?? 0);
  const price = Number(trade.price ?? 0);
  const timestampValue = trade.timestamp;
  const timestamp = typeof timestampValue === "number"
    ? new Date(timestampValue * 1000).toISOString()
    : typeof timestampValue === "string"
      ? timestampValue
      : "";

  return {
    id,
    market: trade.market ?? "",
    outcome: trade.outcome ?? "",
    side: trade.side ?? "",
    size,
    price,
    timestamp,
    maker: trade.maker ?? "",
    taker: trade.taker ?? ""
  };
}

function isValidTrade(trade: unknown): trade is RawTrade {
  return trade !== null && typeof trade === "object";
}

async function fetchFeed(): Promise<NormalizedTrade[] | null> {
  for (const url of SOURCES) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "BeaverXBT/1.0"
        },
        cache: "no-store",
        next: { revalidate: 0 }
      });

      if (!res.ok) {
        continue;
      }

      const data = (await res.json()) as RawFeed;
      const tradesPayload = data?.trades;

      if (Array.isArray(tradesPayload) && tradesPayload.length > 0) {
        return tradesPayload
          .filter(isValidTrade)
          .map((trade) => normalizeTrade(trade));
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function GET() {
  const trades = await fetchFeed();

  if (!trades) {
    return NextResponse.json(
      { trades: [], error: "Feed unavailable" },
      { status: 200 }
    );
  }

  return NextResponse.json({ trades });
}
