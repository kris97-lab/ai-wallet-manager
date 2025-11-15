import { NextResponse } from 'next/server';

const POLYMARKET_TRADES_URL = 'https://clob.polymarket.com/trades?minSize=800';

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
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(milliseconds).toISOString();
  }

  return '';
};

const normalizeTrade = (trade: UnknownRecord): NormalizedTrade | null => {
  const id = toString(trade.id ?? trade.transactionHash ?? trade.txid);
  const market = toString(trade.market ?? trade.marketQuestion ?? trade.question);
  const outcome = toString(trade.outcome ?? trade.outcomeName ?? trade.asset);
  const side = toString(trade.side ?? trade.orderType ?? trade.type);
  const size = toNumber(trade.size ?? trade.quoteAmount ?? trade.usdcSize);
  const price = toNumber(trade.price ?? trade.avgPrice ?? trade.executionPrice);
  const timestamp = toTimestamp(trade.timestamp ?? trade.createdAt ?? trade.time);
  const maker = toString(trade.maker ?? trade.makerAddress ?? trade.makerUser);
  const taker = toString(trade.taker ?? trade.takerAddress ?? trade.takerUser);

  if (
    !id ||
    !market ||
    !outcome ||
    !side ||
    size === null ||
    price === null ||
    !timestamp ||
    !maker ||
    !taker
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
    const response = await fetch(POLYMARKET_TRADES_URL, {
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

    if (!payload || !Array.isArray(payload.trades)) {
      return NextResponse.json(
        { error: 'Unexpected Polymarket response format.' },
        { status: 500 }
      );
    }

    const trades = payload.trades
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const record: UnknownRecord = { ...(entry as UnknownRecord) };
        const rawTimestamp =
          typeof record.timestamp === 'number'
            ? record.timestamp
            : typeof record.createdAt === 'number'
            ? record.createdAt
            : typeof record.time === 'number'
            ? record.time
            : null;

        if (rawTimestamp !== null) {
          record.timestamp = new Date(rawTimestamp * 1000).toISOString();
        }

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
