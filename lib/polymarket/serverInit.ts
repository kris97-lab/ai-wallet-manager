import { initPolymarketWS } from "./wsListener";

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
  __POLY_WS__?: boolean;
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function cleanOldTrades() {
  const globalRef = globalThis as GlobalState;
  const trades = globalRef.polymarketFeed;

  if (!trades || trades.length === 0) {
    return;
  }

  const cutoff = Date.now() - SIX_HOURS_MS;
  globalRef.polymarketFeed = trades.filter((trade) => {
    const time = Date.parse(trade.ts);
    return Number.isNaN(time) ? true : time >= cutoff;
  });
}

const globalRef = globalThis as GlobalState;

if (!globalRef.__POLY_WS__) {
  globalRef.__POLY_WS__ = true;
  initPolymarketWS();
  setInterval(cleanOldTrades, 60_000);
}

export {};
