import { NextResponse } from 'next/server';

const POLYMARKET_FEED_URL =
  process.env.NEXT_PUBLIC_POLY_FEED ?? 'https://api-v2.moonapi.xyz/polymarket/feed';

interface NormalizedTrade {
  id: string;
  market: string;
  outcome: string;
  side: string;
  size: number;
  price: number;
  timestamp: string;
  maker: string;
  taker: string;
}

type UnknownRecord = Record<string, unknown>;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toString = (value: unknown): string => (typeof value === 'string' ? value : '');

const toTimestamp = (value: unknown): string => {
  if (typeof value === 'number') {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(numeric * 1000).toISOString();
    }
    return value;
  }

  return '';
};

const normalizeTrade = (trade: UnknownRecord): NormalizedTrade | null => {
  const id = toString(trade.id);
  const market = toString(trade.market);
  const outcome = toString(trade.outcome);
  const side = toString(trade.side);
  const size = toNumber(trade.size);
  const price = toNumber(trade.price);
  const timestamp = toTimestamp(trade.timestamp);
  const maker = toString(trade.maker);
  const taker = toString(trade.taker);

  if (
    !id ||
    !market ||
    !outcome ||
    !side ||
    size === null ||
    price === null ||
    !timestamp
  ) {
    return null;
  }

  return {
    id,
    market,
    outcome,
    side,
    size,
    price,
    timestamp,
    maker,
    taker,
  };
};

export async function GET() {
  try {
    const response = await fetch(POLYMARKET_FEED_URL, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'user-agent': 'BeaverXBT/1.0 (+https://beaverxbt.example)',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch Polymarket trades.' },
        { status: response.status }
      );
    }

    const payload = (await response.json()) as { trades?: unknown } | null;
    const tradesPayload = Array.isArray(payload?.trades) ? payload?.trades : [];

    const trades = tradesPayload
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const record: UnknownRecord = { ...(entry as UnknownRecord) };
        return normalizeTrade(record);
      })
      .filter((trade): trade is NormalizedTrade => Boolean(trade))
      .filter((trade) => trade.size > 800)
      .slice(0, 50);

    return NextResponse.json({ trades });
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach Polymarket trades endpoint.' },
      { status: 500 }
    );
  }
}
