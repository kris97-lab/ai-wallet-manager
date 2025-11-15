import { BrowserProvider, JsonRpcSigner } from "ethers";
import {
  ClobClient,
  Chain,
  Side,
  OrderType,
  AssetType,
} from "@polymarket/clob-client";
import type { ApiKeyCreds } from "@polymarket/clob-client/dist/types";

export interface GammaOutcome {
  id: string;
  tokenId: string;
  outcome: string;
  price: number | null;
}

export interface GammaMarket {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  outcomes: GammaOutcome[];
}

export interface PolymarketBalanceSnapshot {
  cash: number;
  available: number;
  allowance: number;
}

export interface SubmitOrderRequest {
  marketId: string;
  outcomeIndex: number;
  side: "BUY" | "SELL";
  size: number;
  price?: number | null;
  slug?: string;
}

export interface SubmitOrderResponse {
  ok: boolean;
  orderId?: string;
  price?: number | null;
  raw?: unknown;
}

const CREDS_STORAGE_KEY = "beaverxbt-poly-creds";
const MARKET_CACHE_LIMIT = 50;
const POLY_HOST = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma.api.polymarket.com";
const POLYGON_CHAIN_ID = 137n;
const SIGNATURE_TYPE = 2 as number;

const isBrowser = () => typeof window !== "undefined";

function readStorage<T>(key: string): T | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

function normalizeOutcome(raw: Record<string, unknown>): GammaOutcome | null {
  const tokenId =
    typeof raw.token_id === "string"
      ? raw.token_id
      : typeof raw.tokenId === "string"
      ? raw.tokenId
      : typeof raw.id === "string"
      ? raw.id
      : null;

  if (!tokenId) {
    return null;
  }

  const priceCandidate =
    typeof raw.price === "number"
      ? raw.price
      : typeof raw.price === "string"
      ? Number(raw.price)
      : null;

  const outcomeText =
    typeof raw.outcome === "string"
      ? raw.outcome.toUpperCase()
      : typeof raw.name === "string"
      ? raw.name.toUpperCase()
      : typeof raw.ticker === "string"
      ? raw.ticker.toUpperCase()
      : "";

  return {
    id: String(raw.id ?? tokenId),
    tokenId,
    outcome: outcomeText === "NO" ? "NO" : "YES",
    price: Number.isFinite(priceCandidate ?? NaN) ? Number(priceCandidate) : null,
  };
}

function normalizeMarket(raw: Record<string, unknown>): GammaMarket | null {
  const conditionId =
    typeof raw.condition_id === "string"
      ? raw.condition_id
      : typeof raw.conditionId === "string"
      ? raw.conditionId
      : null;

  const id =
    typeof raw.id === "string"
      ? raw.id
      : typeof raw.cid === "string"
      ? raw.cid
      : conditionId;

  if (!id) {
    return null;
  }

  const outcomesRaw = Array.isArray(raw.outcomes)
    ? (raw.outcomes as Record<string, unknown>[])
    : Array.isArray(raw.tokens)
    ? (raw.tokens as Record<string, unknown>[])
    : [];

  const outcomes = outcomesRaw
    .map(normalizeOutcome)
    .filter((item): item is GammaOutcome => Boolean(item));

  return {
    id,
    conditionId: conditionId ?? id,
    question:
      typeof raw.question === "string"
        ? raw.question
        : typeof raw.title === "string"
        ? raw.title
        : "Polymarket market",
    slug:
      typeof raw.slug === "string"
        ? raw.slug
        : typeof raw.market_slug === "string"
        ? raw.market_slug
        : id,
    outcomes,
  };
}

class PolymarketTradeEngine {
  private client?: ClobClient;
  private signer?: JsonRpcSigner;
  private creds?: ApiKeyCreds;
  private pendingClient?: Promise<ClobClient>;
  private marketCache = new Map<string, GammaMarket>();

  private assertBrowser() {
    if (!isBrowser()) {
      throw new Error("Polymarket trading is only available in the browser");
    }
  }

  private async getSigner(): Promise<JsonRpcSigner> {
    this.assertBrowser();

    if (this.signer) {
      return this.signer;
    }

    const ethereumProvider = (window as typeof window & { ethereum?: unknown }).ethereum;
    if (!ethereumProvider) {
      throw new Error("MetaMask is required for Polymarket trading");
    }

    const provider = new BrowserProvider(ethereumProvider as never);
    await provider.send("eth_requestAccounts", []);
    const network = await provider.getNetwork();
    if (network.chainId !== POLYGON_CHAIN_ID) {
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0x89" }]);
      } catch (error) {
        console.warn("Unable to switch network automatically", error);
      }
    }

    const signer = await provider.getSigner();
    this.signer = signer;
    return signer;
  }

  private getStoredCreds(): ApiKeyCreds | null {
    if (this.creds) {
      return this.creds;
    }
    const stored = readStorage<ApiKeyCreds>(CREDS_STORAGE_KEY);
    if (stored) {
      this.creds = stored;
    }
    return stored ?? null;
  }

  private async ensureClient(): Promise<ClobClient> {
    if (this.client) {
      return this.client;
    }

    if (!this.pendingClient) {
      this.pendingClient = this.createClient();
    }

    this.client = await this.pendingClient;
    this.pendingClient = undefined;
    return this.client;
  }

  private async createClient(): Promise<ClobClient> {
    const signer = await this.getSigner();
    const creds = this.getStoredCreds() ?? undefined;
    return new ClobClient(POLY_HOST, Chain.POLYGON, signer, creds, SIGNATURE_TYPE);
  }

  private cacheMarket(entry: GammaMarket) {
    if (this.marketCache.has(entry.id)) {
      this.marketCache.set(entry.id, entry);
      return;
    }
    this.marketCache.set(entry.id, entry);
    if (this.marketCache.size > MARKET_CACHE_LIMIT) {
      const [firstKey] = this.marketCache.keys();
      if (firstKey) {
        this.marketCache.delete(firstKey);
      }
    }
  }

  private getCachedMarket(identifier: string): GammaMarket | null {
    return (
      this.marketCache.get(identifier) ||
      Array.from(this.marketCache.values()).find(
        market => market.slug === identifier || market.conditionId === identifier
      ) ||
      null
    );
  }

  private async fetchGamma(path: string) {
    const response = await fetch(`${GAMMA_BASE}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "BeaverXBT-TradeEngine/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to fetch Polymarket market data");
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private async resolveMarket(identifier: string, slug?: string): Promise<GammaMarket | null> {
    const cached = this.getCachedMarket(identifier) || (slug ? this.getCachedMarket(slug) : null);
    if (cached) {
      return cached;
    }

    const candidates: GammaMarket[] = [];

    const tryPaths = [`/markets/${identifier}`];
    if (slug) {
      tryPaths.push(`/markets/${slug}`);
    }

    for (const path of tryPaths) {
      try {
        const payload = await this.fetchGamma(path);
        const normalized = normalizeMarket(payload);
        if (normalized) {
          this.cacheMarket(normalized);
          return normalized;
        }
      } catch {
        // continue to next strategy
      }
    }

    const queryParams = new URLSearchParams({ limit: "10", active: "true" });
    if (slug) {
      queryParams.set("slug", slug);
    } else {
      queryParams.set("market", identifier);
    }

    try {
      const payload = await this.fetchGamma(`/markets?${queryParams.toString()}`);
      const markets = Array.isArray(payload?.markets)
        ? (payload.markets as Record<string, unknown>[])
        : Array.isArray(payload)
        ? (payload as Record<string, unknown>[])
        : [];
      for (const entry of markets) {
        const normalized = normalizeMarket(entry);
        if (!normalized) {
          continue;
        }
        this.cacheMarket(normalized);
        candidates.push(normalized);
      }
    } catch {
      // swallow errors and fall through
    }

    if (candidates.length > 0) {
      return candidates[0];
    }

    return null;
  }

  private async ensureApiCreds(client: ClobClient): Promise<ApiKeyCreds> {
    if (this.creds) {
      return this.creds;
    }

    const stored = this.getStoredCreds();
    if (stored) {
      return stored;
    }

    const derived = await client.createOrDeriveApiKey();
    this.creds = derived;
    writeStorage(CREDS_STORAGE_KEY, derived);
    return derived;
  }

  async getBalance(): Promise<PolymarketBalanceSnapshot | null> {
    try {
      const client = await this.ensureClient();
      await this.ensureApiCreds(client);
      const snapshot = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
      const normalize = (value: unknown) => {
        const numeric = typeof value === "string" ? Number(value) : (value as number);
        return Number.isFinite(numeric) ? numeric / 1_000_000 : 0;
      };
      return {
        cash: normalize(snapshot.balance),
        available: normalize(snapshot.balance),
        allowance: normalize(snapshot.allowance),
      };
    } catch (error) {
      console.warn("Unable to read Polymarket balance", error);
      return null;
    }
  }

  async submitOrder(request: SubmitOrderRequest): Promise<SubmitOrderResponse> {
    if (!request.marketId) {
      return { ok: false, orderId: undefined, price: null };
    }

    const client = await this.ensureClient();
    await this.ensureApiCreds(client);

    const market = await this.resolveMarket(request.marketId, request.slug);
    if (!market) {
      throw new Error("Unable to resolve Polymarket market metadata");
    }

    const outcome = market.outcomes[request.outcomeIndex] ?? market.outcomes[0];
    if (!outcome) {
      throw new Error("Missing outcome token for this market");
    }

    const amount = Number(request.size);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter a valid positive trade size");
    }

    const orderSide = request.side === "SELL" ? Side.SELL : Side.BUY;

    const order = await client.createAndPostMarketOrder(
      {
        tokenID: outcome.tokenId,
        amount,
        side: orderSide,
        price: request.price ?? undefined,
      },
      undefined,
      OrderType.FOK
    );

    const orderId =
      typeof order?.orderID === "string"
        ? order.orderID
        : typeof (order as Record<string, unknown>)?.order_id === "string"
        ? ((order as Record<string, unknown>).order_id as string)
        : typeof (order as Record<string, unknown>)?.id === "string"
        ? ((order as Record<string, unknown>).id as string)
        : undefined;

    return {
      ok: true,
      orderId,
      price: request.price ?? outcome.price ?? null,
      raw: order,
    };
  }
}

export const polymarketTradeEngine = new PolymarketTradeEngine();
