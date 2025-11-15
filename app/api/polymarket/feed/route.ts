import { NextResponse } from "next/server";
import { startPolymarketStream, getTrades } from "@/lib/polymarket-ws";

export const revalidate = 0;

let streamStarted = false;

function initializeStream() {
  if (!streamStarted) {
    startPolymarketStream();
    streamStarted = true;
  }
}

initializeStream();

export async function GET() {
  const trades = Array.from(getTrades());
  return NextResponse.json(
    { trades },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
