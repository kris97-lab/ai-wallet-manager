export interface SubmitOrderInput {
  marketId: string;
  outcomeIndex: number;
  side: "BUY" | "SELL";
  size: number;
  price: number | null;
}

export interface SubmitOrderResult {
  ok: boolean;
  order?: unknown;
  error?: string;
}

const normalizeSide = (side: string): "BUY" | "SELL" =>
  side.trim().toUpperCase() === "SELL" ? "SELL" : "BUY";

const validateOutcomeIndex = (value: number) => (value === 0 ? 0 : 1);

const toBaseUnits = (size: number) => Math.round(size * 1_000_000);

export async function submitPolymarketOrder(
  input: SubmitOrderInput
): Promise<SubmitOrderResult> {
  const marketId = input.marketId?.trim();
  if (!marketId) {
    return { ok: false, error: "Missing market identifier." };
  }

  if (!Number.isFinite(input.outcomeIndex)) {
    return { ok: false, error: "Invalid outcome index." };
  }

  const outcomeIndex = validateOutcomeIndex(Number(input.outcomeIndex));

  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: "Enter a valid trade size greater than zero." };
  }

  const normalizedSide = normalizeSide(input.side);
  const normalizedPrice =
    input.price == null || Number.isNaN(Number(input.price))
      ? null
      : Number(input.price);

  const payload = {
    marketId,
    outcome: String(outcomeIndex),
    side: normalizedSide.toLowerCase(),
    size: toBaseUnits(input.size),
    price: normalizedPrice,
  };

  try {
    const response = await fetch("/api/polymarket/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data?.ok === false) {
      const polymarketMessage = data?.polymarketError?.message;
      const fallbackError = data?.error;
      return {
        ok: false,
        error:
          polymarketMessage ||
          fallbackError ||
          "Polymarket rejected this order. Please try again.",
      };
    }

    return { ok: true, order: data.order ?? data };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to submit order. Check your network connection.",
    };
  }
}
