import {
  polymarketTradeEngine,
  type SubmitOrderRequest,
} from "./tradeEngine";

export interface SubmitOrderInput {
  marketId: string;
  outcomeIndex: number;
  side: "BUY" | "SELL";
  size: number;
  price: number | null;
  slug?: string;
}

export interface SubmitOrderOptions {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export interface SubmitOrderResult {
  ok: boolean;
  order?: unknown;
  orderId?: string | null;
  price?: number | null;
  error?: string;
}

const normalizeSide = (side: string): "BUY" | "SELL" =>
  side.trim().toUpperCase() === "SELL" ? "SELL" : "BUY";

const validateOutcomeIndex = (value: number) => (value === 0 ? 0 : 1);

export async function submitPolymarketOrder(
  input: SubmitOrderInput,
  options?: SubmitOrderOptions
): Promise<SubmitOrderResult> {
  const marketId = input.marketId?.trim();
  if (!marketId) {
    const error = "Missing market identifier.";
    options?.onError?.(error);
    return { ok: false, error };
  }

  if (!Number.isFinite(input.outcomeIndex)) {
    const error = "Invalid outcome index.";
    options?.onError?.(error);
    return { ok: false, error };
  }

  if (!Number.isFinite(input.size) || input.size <= 0) {
    const error = "Enter a valid trade size greater than zero.";
    options?.onError?.(error);
    return { ok: false, error };
  }

  const payload: SubmitOrderRequest = {
    marketId,
    outcomeIndex: validateOutcomeIndex(Number(input.outcomeIndex)),
    side: normalizeSide(input.side),
    size: Number(input.size),
    price: input.price ?? null,
    slug: input.slug,
  };

  try {
    const response = await polymarketTradeEngine.submitOrder(payload);
    if (!response.ok) {
      const error = "Polymarket rejected this order. Please try again.";
      options?.onError?.(error);
      return { ok: false, error };
    }

    options?.onSuccess?.("Order placed!");
    return {
      ok: true,
      order: response.raw,
      orderId: response.orderId ?? null,
      price: response.price ?? null,
    };
  } catch (error) {
    const fallbackMessage =
      error instanceof Error
        ? error.message
        : "Unable to submit order. Check your wallet connection.";
    options?.onError?.(fallbackMessage);
    return {
      ok: false,
      error: fallbackMessage,
    };
  }
}
