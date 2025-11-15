import { NextResponse } from "next/server";

import { getPolymarketTrades } from "@/lib/polymarket";

export const dynamic = "force-dynamic";

export async function GET() {
  const trades = await getPolymarketTrades();

  return NextResponse.json(
    {
      ok: true,
      lastSync: new Date().toISOString(),
      trades,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
