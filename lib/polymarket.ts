const POLYMARKET_API_URL = "https://data-api.polymarket.com/trades";

export interface RawTrade {
  id?: string | number;
  transactionHash?: string;
  idempotencyKey?: string;
  timestamp?: number | string;
  ts?: number | string;
  createdAt?: string;
  price?: number | string;
  size?: number | string;
  amount?: number | string;
  amount_usdc?: number | string;
  amountUSD?: number | string;
  amount_usd?: number | string;
  outcome?: string;
  side?: string;
  title?: string;
  asset?: string;
  market?: string;
  question?: string;
  marketId?: string | number;
  market_id?: string | number;
  slug?: string;
  marketSlug?: string;
  market_slug?: string;
  eventSlug?: string;
  event_slug?: string;
  maker?: string;
  makerAddress?: string;
  maker_address?: string;
  taker?: string;
  takerAddress?: string;
  taker_address?: string;
}

export interface PolymarketTrade {
  id: string;
  ts: string;
  side: string;
  amountUSD: number;
  price: number;
  outcome: string;
  market: string;
  marketId: string;
  maker: string;
  url: string;
  slug: string;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return 0;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function tsToIso(value?: number | string | null): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return "";
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const ms = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
      return new Date(ms).toISOString();
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return "";
}

function resolveUrl(slug: string, eventSlug: string): string {
  if (slug) {
    return `https://polymarket.com/market/${slug}`;
  }

  if (eventSlug) {
    return `https://polymarket.com/event/${eventSlug}`;
  }

  return "";
}

function normalizeTrade(raw: RawTrade): PolymarketTrade | null {
  const idSource = raw.id ?? raw.transactionHash ?? raw.idempotencyKey;
  if (idSource == null) {
    return null;
  }

  const price = parseNumber(raw.price);
  const size = parseNumber(raw.size);

  const amountUsdc = parseNumber(raw.amount_usdc ?? raw.amountUSD ?? raw.amount_usd);
  const computedAmount = price > 0 && size > 0 ? price * size : 0;
  const fallbackAmount = parseNumber(raw.amount);
  const amountUSD = amountUsdc > 0 ? amountUsdc : computedAmount > 0 ? computedAmount : fallbackAmount;

  const slug =
    typeof raw.slug === "string"
      ? raw.slug
      : typeof raw.marketSlug === "string"
      ? raw.marketSlug
      : typeof raw.market_slug === "string"
      ? raw.market_slug
      : "";
  const eventSlug =
    typeof raw.eventSlug === "string"
      ? raw.eventSlug
      : typeof raw.event_slug === "string"
      ? raw.event_slug
      : "";

  const tsCandidate = raw.timestamp ?? raw.ts ?? raw.createdAt ?? null;
  const isoTimestamp = tsToIso(tsCandidate) || new Date().toISOString();

  return {
    id: String(idSource),
    ts: isoTimestamp,
    side: typeof raw.side === "string" ? raw.side : "",
    amountUSD,
    price,
    outcome: typeof raw.outcome === "string" ? raw.outcome : "",
    market: raw.title ?? raw.asset ?? raw.market ?? raw.question ?? "Unknown market",
    marketId: raw.marketId != null ? String(raw.marketId) : raw.market_id != null ? String(raw.market_id) : "",
    maker: raw.maker ?? raw.makerAddress ?? raw.maker_address ?? "",
    url: resolveUrl(slug, eventSlug),
    slug,
  };
}

async function fetchPolymarketTrades(minUSD = 800, limit = 200): Promise<PolymarketTrade[]> {
  const url = new URL(POLYMARKET_API_URL);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("takerOnly", "true");
  url.searchParams.set("filterType", "CASH");
  url.searchParams.set("filterAmount", String(minUSD));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "BeaverXBT/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return [];
  }

  const payload: unknown = await response.json();
  const trades: RawTrade[] = Array.isArray((payload as { trades?: RawTrade[] })?.trades)
    ? ((payload as { trades?: RawTrade[] }).trades as RawTrade[])
    : Array.isArray(payload)
    ? (payload as RawTrade[])
    : [];

  const normalized = trades
    .map(normalizeTrade)
    .filter((trade): trade is PolymarketTrade => trade !== null && trade.amountUSD >= minUSD);

  normalized.sort((a, b) => {
    const aTime = new Date(a.ts).getTime();
    const bTime = new Date(b.ts).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });

  return normalized.slice(0, limit);
}

export async function getPolymarketTrades(minUSD = 800, limit = 200): Promise<PolymarketTrade[]> {
  try {
    return await fetchPolymarketTrades(minUSD, limit);
  } catch {
    return [];
  }
}

export { POLYMARKET_API_URL };
