import "@/lib/polymarket/serverInit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PolymarketTrade = {
  id: string;
  ts: string;
  amountUSD: number;
  outcome: string;
  price: number;
  market: string;
  url?: string;
};

type GlobalState = typeof globalThis & {
  polymarketFeed?: PolymarketTrade[];
};

function getLatestTrades(): PolymarketTrade[] {
  const globalRef = globalThis as GlobalState;
  const trades = globalRef.polymarketFeed ?? [];
  return trades.slice(0, 50);
}

export async function GET() {
  const trades = getLatestTrades();
  const lastSync = trades.length > 0 ? trades[0].ts : null;

  return NextResponse.json(
    {
      ok: true,
      lastSync,
      trades,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
