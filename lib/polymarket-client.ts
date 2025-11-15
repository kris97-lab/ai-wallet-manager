import { providers, utils } from "ethers";
import type {
  ExternalProvider,
  JsonRpcSigner,
} from "@ethersproject/providers";
import {
  AssetType,
  Chain,
  ClobClient,
  OrderType,
  Side,
} from "@polymarket/clob-client";
import type { ApiKeyCreds } from "@polymarket/clob-client/dist/types";
import { SignatureType } from "@polymarket/order-utils";
import type { WalletClient } from "viem";

export interface GammaOutcome {
  id: string;
  tokenId: string;
  outcome: "YES" | "NO";
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
  slug?: string;
  outcome: "YES" | "NO";
  side: "BUY" | "SELL";
  size: number;
  price?: number | null;
}

export interface SubmitOrderResult {
  ok: boolean;
  orderId?: string;
  raw?: unknown;
  filledPrice?: number | null;
}

const CREDS_STORAGE_KEY = "beaverxbt-poly-creds-v2";
const MARKET_CACHE_LIMIT = 60;
const POLYGON_CHAIN_ID = 137;
const SIGNATURE = SignatureType.EOA;
const POLY_HOST = "https://clob.polymarket.com";
const GAMMA_BASE = "https://gamma.api.polymarket.com";

const isBrowser = () => typeof window !== "undefined";

function readStorage<T>(key: string): T | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    const payload = window.localStorage.getItem(key);
    return payload ? (JSON.parse(payload) as T) : null;
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
    // ignore persistence failures
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

  const label =
    typeof raw.outcome === "string"
      ? raw.outcome
      : typeof raw.name === "string"
      ? raw.name
      : typeof raw.ticker === "string"
      ? raw.ticker
      : "YES";

  const outcome = label.toUpperCase() === "NO" ? "NO" : "YES";

  return {
    id: String(raw.id ?? tokenId),
    tokenId,
    outcome,
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

  const marketId =
    typeof raw.id === "string"
      ? raw.id
      : typeof raw.cid === "string"
      ? raw.cid
      : conditionId;

  if (!marketId) {
    return null;
  }

  const outcomesRaw = Array.isArray(raw.outcomes)
    ? (raw.outcomes as Record<string, unknown>[])
    : Array.isArray(raw.tokens)
    ? (raw.tokens as Record<string, unknown>[])
    : [];

  const outcomes = outcomesRaw
    .map(normalizeOutcome)
    .filter((entry): entry is GammaOutcome => Boolean(entry));

  return {
    id: marketId,
    conditionId: conditionId ?? marketId,
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
        : marketId,
    outcomes,
  };
}

function walletClientToSigner(walletClient: WalletClient): JsonRpcSigner {
  const { account, chain, transport } = walletClient;
  if (!account) {
    throw new Error("Wallet account is not available yet");
  }

  const externalProvider: ExternalProvider = {
    request: async ({ method, params }) =>
      transport.request({ method, params: params ?? [] }),
  };

  const provider = new providers.Web3Provider(externalProvider, {
    chainId: chain?.id ?? POLYGON_CHAIN_ID,
    name: chain?.name ?? "Polygon",
  });

  return provider.getSigner(account.address);
}

async function ensureTypedDataSupport(signer: JsonRpcSigner): Promise<JsonRpcSigner> {
  const maybeSigner = signer as JsonRpcSigner & {
    _signTypedData?: JsonRpcSigner["_signTypedData"];
  };

  if (typeof maybeSigner._signTypedData === "function") {
    return maybeSigner;
  }

  maybeSigner._signTypedData = async (domain, types, value) => {
    const payload = utils._TypedDataEncoder.getPayload(domain, types, value);
    const provider = signer.provider;
    if (!provider || typeof provider.send !== "function") {
      throw new Error("The connected wallet does not support EIP-712");
    }
    const address = await signer.getAddress();
    return provider.send("eth_signTypedData_v4", [
      address,
      JSON.stringify(payload),
    ]);
  };

  return maybeSigner;
}

export class PolymarketClient {
  private signer?: JsonRpcSigner;
  private walletClient?: WalletClient;
  private walletAddress?: string;
  private creds?: ApiKeyCreds;
  private client?: ClobClient;
  private pendingClient?: Promise<ClobClient>;
  private marketCache = new Map<string, GammaMarket>();

  setWalletClient(client?: WalletClient | null) {
    this.walletClient = client ?? undefined;
    this.signer = undefined;
    this.client = undefined;
    if (client?.account?.address) {
      this.walletAddress = client.account.address;
    }
  }

  resetSession() {
    this.signer = undefined;
    this.walletClient = undefined;
    this.walletAddress = undefined;
    this.client = undefined;
    this.creds = undefined;
    this.pendingClient = undefined;
  }

  async getBalanceSnapshot(): Promise<PolymarketBalanceSnapshot | null> {
    try {
      const client = await this.ensureClient();
      await this.ensureApiCreds(client);
      const snapshot = await client.getBalanceAllowance({
        asset_type: AssetType.COLLATERAL,
      });
      const normalize = (value: unknown) => {
        const numeric =
          typeof value === "string"
            ? Number(value)
            : typeof value === "number"
            ? value
            : 0;
        return Number.isFinite(numeric) ? numeric / 1_000_000 : 0;
      };
      return {
        cash: normalize(snapshot.balance),
        available: normalize(snapshot.balance),
        allowance: normalize(snapshot.allowance),
      };
    } catch (error) {
      console.warn("Unable to fetch Polymarket balance", error);
      return null;
    }
  }

  async fetchMarkets(limit = 12): Promise<GammaMarket[]> {
    const query = new URLSearchParams({ limit: String(limit), active: "true" });
    const payload = await this.fetchGamma(`/markets?${query.toString()}`);
    const entries = Array.isArray(payload?.markets)
      ? (payload.markets as Record<string, unknown>[])
      : Array.isArray(payload)
      ? (payload as Record<string, unknown>[])
      : [];

    const normalized = entries
      .map(normalizeMarket)
      .filter((entry): entry is GammaMarket => Boolean(entry));

    normalized.forEach(entry => this.cacheMarket(entry));
    return normalized;
  }

  async submitOrder(request: SubmitOrderRequest): Promise<SubmitOrderResult> {
    if (!request.marketId) {
      throw new Error("Missing Polymarket market identifier");
    }
    if (!Number.isFinite(request.size) || request.size <= 0) {
      throw new Error("Enter a valid trade size in USDC");
    }

    const client = await this.ensureClient();
    await this.ensureApiCreds(client);

    const market = await this.resolveMarket(request.marketId, request.slug);
    if (!market) {
      throw new Error("Unable to resolve Polymarket market metadata");
    }

    const desiredOutcome = request.outcome === "NO" ? "NO" : "YES";
    const outcome =
      market.outcomes.find(entry => entry.outcome === desiredOutcome) ??
      market.outcomes[0];

    if (!outcome) {
      throw new Error("Missing market outcome token");
    }

    const amount = Number(request.size);
    await this.ensureAllowance(client, amount);

    const side = request.side === "SELL" ? Side.SELL : Side.BUY;
    const price = request.price ?? outcome.price ?? undefined;

    const order = await client.createAndPostMarketOrder(
      {
        tokenID: outcome.tokenId,
        side,
        amount,
        price,
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
      raw: order,
      filledPrice: price ?? outcome.price ?? null,
    };
  }

  private async ensureAllowance(client: ClobClient, amount: number) {
    try {
      const micros = Math.ceil(Math.max(amount, 0) * 1_000_000);
      const snapshot = await client.getBalanceAllowance({
        asset_type: AssetType.COLLATERAL,
      });
      const allowance = Number(snapshot.allowance ?? 0);
      if (allowance >= micros) {
        return;
      }
      await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
    } catch (error) {
      console.warn("Unable to refresh Polymarket allowance", error);
    }
  }

  private cacheMarket(entry: GammaMarket) {
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
        entry => entry.slug === identifier || entry.conditionId === identifier
      ) ||
      null
    );
  }

  private async resolveMarket(
    identifier: string,
    slug?: string
  ): Promise<GammaMarket | null> {
    const cached =
      this.getCachedMarket(identifier) || (slug ? this.getCachedMarket(slug) : null);
    if (cached) {
      return cached;
    }

    const attempts = [`/markets/${identifier}`];
    if (slug && slug !== identifier) {
      attempts.push(`/markets/${slug}`);
    }

    for (const path of attempts) {
      try {
        const payload = await this.fetchGamma(path);
        const normalized = normalizeMarket(payload);
        if (normalized) {
          this.cacheMarket(normalized);
          return normalized;
        }
      } catch {
        // keep trying alternate endpoints
      }
    }

    const params = new URLSearchParams({ limit: "10", active: "true" });
    if (slug) {
      params.set("slug", slug);
    } else {
      params.set("market", identifier);
    }

    try {
      const payload = await this.fetchGamma(`/markets?${params.toString()}`);
      const entries = Array.isArray(payload?.markets)
        ? (payload.markets as Record<string, unknown>[])
        : Array.isArray(payload)
        ? (payload as Record<string, unknown>[])
        : [];
      for (const entry of entries) {
        const normalized = normalizeMarket(entry);
        if (normalized) {
          this.cacheMarket(normalized);
          if (
            normalized.id === identifier ||
            normalized.slug === slug ||
            normalized.conditionId === identifier
          ) {
            return normalized;
          }
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  private async fetchGamma(path: string) {
    const response = await fetch(`${GAMMA_BASE}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "BeaverXBT-PolymarketClient/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Gamma API rejected the request");
    }

    return (await response.json()) as Record<string, unknown>;
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
    const patchedSigner = await ensureTypedDataSupport(signer);
    const address = await patchedSigner.getAddress();
    this.walletAddress = address;
    const creds = this.getStoredCreds() ?? undefined;
    return new ClobClient(
      POLY_HOST,
      Chain.POLYGON,
      patchedSigner,
      creds,
      SIGNATURE,
      address
    );
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

  private async getSigner(): Promise<JsonRpcSigner> {
    if (this.signer) {
      return this.signer;
    }

    if (this.walletClient) {
      const signer = walletClientToSigner(this.walletClient);
      this.signer = signer;
      return signer;
    }

    if (!isBrowser()) {
      throw new Error("Polymarket trading requires a browser wallet");
    }

    const ethereumProvider = (window as typeof window & {
      ethereum?: ExternalProvider;
    }).ethereum;

    if (!ethereumProvider) {
      throw new Error("MetaMask is required to trade on Polymarket");
    }

    const provider = new providers.Web3Provider(ethereumProvider, "any");
    await provider.send("eth_requestAccounts", []);
    const network = await provider.getNetwork();
    if (network.chainId !== POLYGON_CHAIN_ID) {
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0x89" }]);
      } catch (error) {
        console.warn("Unable to switch to Polygon automatically", error);
      }
    }

    const signer = provider.getSigner();
    this.signer = signer;
    return signer;
  }
}

export const polymarketClient = new PolymarketClient();
