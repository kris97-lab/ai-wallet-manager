import WebSocket from "ws";

type ActivityPayload = {
  id?: unknown;
  price?: unknown;
  size?: unknown;
  outcome?: unknown;
  title?: unknown;
  timestamp?: unknown;
  market?: unknown;
  url?: unknown;
};

type ActivityMessage = {
  topic?: unknown;
  type?: unknown;
  payload?: unknown;
};

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
  __polymarketWSState__?: {
    initialized: boolean;
    socket: WebSocket | null;
    reconnectTimer: NodeJS.Timeout | null;
  };
};

const WS_URL = "wss://ws-live-data.polymarket.com";
const RECONNECT_DELAY_MS = 5000;
const MAX_TRADES = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return null;
}

function parseTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return new Date(numeric * 1000).toISOString();
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function buildTrade(payload: ActivityPayload): PolymarketTrade | null {
  if (!isRecord(payload)) {
    return null;
  }

  const price = parseNumber(payload.price);
  const size = parseNumber(payload.size);

  if (price === null || size === null) {
    return null;
  }

  if (price <= 0.02 || price >= 0.98) {
    return null;
  }

  const amountUSD = price * size;
  if (!Number.isFinite(amountUSD) || amountUSD < 800) {
    return null;
  }

  const id = parseString(payload.id) ?? `${Date.now()}-${Math.random()}`;
  const outcome = parseString(payload.outcome) ?? "";
  const market = parseString(payload.title ?? payload.market) ?? "";
  const url = parseString(payload.url) ?? undefined;
  const ts = parseTimestamp(payload.timestamp);

  return {
    id,
    ts,
    amountUSD,
    outcome,
    price,
    market,
    url,
  };
}

function ensureGlobalState(): GlobalState {
  const globalRef = globalThis as GlobalState;
  if (!globalRef.polymarketFeed) {
    globalRef.polymarketFeed = [];
  }
  if (!globalRef.__polymarketWSState__) {
    globalRef.__polymarketWSState__ = {
      initialized: false,
      socket: null,
      reconnectTimer: null,
    };
  }
  return globalRef;
}

function connect(state: NonNullable<GlobalState["__polymarketWSState__"]>) {
  if (state.socket) {
    state.socket.removeAllListeners();
    state.socket.terminate();
  }

  const socket = new WebSocket(WS_URL);
  state.socket = socket;

  socket.on("open", () => {
    console.log("Polymarket WS connected");
    socket.send(
      JSON.stringify({
        action: "subscribe",
        subscriptions: [
          {
            topic: "activity",
            type: "orders_matched",
          },
        ],
      })
    );
  });

  socket.on("message", (raw: WebSocket.RawData) => {
    let parsed: ActivityMessage;
    try {
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      parsed = JSON.parse(text) as ActivityMessage;
    } catch {
      return;
    }

    if (parsed.topic !== "activity" || parsed.type !== "orders_matched") {
      return;
    }

    const payload = parsed.payload as ActivityPayload;
    const trade = buildTrade(payload);
    if (!trade) {
      return;
    }

    const globalRef = globalThis as GlobalState;
    const feed = globalRef.polymarketFeed ?? [];
    globalRef.polymarketFeed = [trade, ...feed].slice(0, MAX_TRADES);
  });

  socket.on("error", (err) => {
    console.error("Polymarket WS error", err);
  });

  socket.on("close", () => {
    state.socket = null;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
    }
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connect(state);
    }, RECONNECT_DELAY_MS);
  });
}

export function initPolymarketWS(): void {
  const globalRef = ensureGlobalState();
  const state = globalRef.__polymarketWSState__!;
  if (state.initialized) {
    return;
  }
  state.initialized = true;
  connect(state);
}
