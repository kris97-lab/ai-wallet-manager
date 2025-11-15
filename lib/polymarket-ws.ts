import WebSocket from "ws";

const WS_URL = "wss://ws-live-data.polymarket.com";
const RECONNECT_DELAY_MS = 3000;
const MAX_TRADES = 100;

type RawMessage = {
  topic?: unknown;
  type?: unknown;
  data?: unknown;
};

type OrdersMatchedData = {
  price?: unknown;
  size?: unknown;
  outcome?: unknown;
  side?: unknown;
  title?: unknown;
  timestamp?: unknown;
};

type BaseTrade = {
  price: number;
  size: number;
  outcome: string;
  side: string;
  title: string;
  timestamp: string;
};

type StoredTrade = BaseTrade & {
  usdAmount: number;
};

let trades: StoredTrade[] = [];
let socket: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let connecting = false;

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

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === "string" && value.trim() !== "") {
    const directDate = new Date(value);
    if (!Number.isNaN(directDate.getTime())) {
      return directDate.toISOString();
    }
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return new Date(asNumber * 1000).toISOString();
    }
  }

  return null;
}

function normalizeTrade(data: OrdersMatchedData | undefined): BaseTrade | null {
  if (!data || !isRecord(data)) {
    return null;
  }

  const price = parseNumber(data.price);
  const size = parseNumber(data.size);

  if (price === null || size === null) {
    return null;
  }

  const outcome = typeof data.outcome === "string" ? data.outcome : "";
  const side = typeof data.side === "string" ? data.side : "";
  const title = typeof data.title === "string" ? data.title : "";
  const timestamp = normalizeTimestamp(data.timestamp) ?? new Date().toISOString();

  return {
    price,
    size,
    outcome,
    side,
    title,
    timestamp,
  };
}

function handleMessage(raw: WebSocket.RawData) {
  let parsed: RawMessage;

  try {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    parsed = JSON.parse(text) as RawMessage;
  } catch {
    return;
  }

  if (parsed.topic !== "activity" || parsed.type !== "orders_matched") {
    return;
  }

  const baseTrade = normalizeTrade(parsed.data as OrdersMatchedData | undefined);
  if (!baseTrade) {
    return;
  }

  const usdAmount = baseTrade.price * baseTrade.size;
  if (!Number.isFinite(usdAmount) || usdAmount < 800) {
    return;
  }

  const storedTrade: StoredTrade = {
    ...baseTrade,
    usdAmount,
  };

  trades = [storedTrade, ...trades];
  if (trades.length > MAX_TRADES) {
    trades = trades.slice(0, MAX_TRADES);
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

function cleanupSocket(instance?: WebSocket) {
  const target = instance ?? socket;
  if (!target) {
    return;
  }

  target.removeAllListeners();

  if (target.readyState === WebSocket.OPEN || target.readyState === WebSocket.CONNECTING) {
    target.terminate();
  }

  if (socket === target) {
    socket = null;
  }
}

function connect() {
  if (connecting) {
    return;
  }

  connecting = true;

  const ws = new WebSocket(WS_URL);
  socket = ws;

  ws.on("open", () => {
    connecting = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    const subscription = {
      action: "subscribe",
      subscriptions: [
        {
          topic: "activity",
          type: "orders_matched",
        },
      ],
    };

    ws.send(JSON.stringify(subscription));
  });

  ws.on("message", handleMessage);

  ws.on("close", () => {
    connecting = false;
    cleanupSocket(ws);
    scheduleReconnect();
  });

  ws.on("error", () => {
    connecting = false;
    cleanupSocket(ws);
    scheduleReconnect();
  });
}

export function startPolymarketStream(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  connect();
}

export function getTrades(): ReadonlyArray<StoredTrade> {
  return trades.slice();
}
