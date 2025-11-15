import { NextRequest, NextResponse } from "next/server";

const ERROR_MESSAGES: Record<string, string> = {
  insufficient_funds: "Your Polymarket balance is too low to place this order.",
  balance_not_found: "Polymarket could not find an available cash balance for this account.",
  market_closed: "This market is currently closed to new orders.",
  price_out_of_bounds: "The submitted price is outside the allowed range for this market.",
};

const normalizeNumber = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { marketId, outcome, side, size, price } = body;

    const API_KEY = process.env.POLY_BUILDER_KEY;
    if (!API_KEY) {
      return NextResponse.json(
        { error: "Missing POLY_BUILDER_KEY in env" },
        { status: 500 }
      );
    }

    const requestPayload = {
      market: marketId,
      outcome,
      side,
      price,
      size,
      type: "market",
    };

    const res = await fetch("https://clob.polymarket.com/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify(requestPayload),
    });

    const json = await res.json();
    if (!res.ok) {
      const rawCode = (json?.code || json?.error || "unknown_error") as string;
      const normalizedCode = rawCode.toLowerCase();
      const friendlyMessage =
        ERROR_MESSAGES[normalizedCode] ||
        json?.message ||
        "Polymarket rejected this order.";

      console.error("Polymarket order error", {
        status: res.status,
        response: json,
        request: requestPayload,
      });

      return NextResponse.json(
        {
          ok: false,
          code: normalizedCode,
          message: friendlyMessage,
          polymarketError: {
            status: res.status,
            error: json?.error ?? null,
            message: json?.message ?? null,
            code: json?.code ?? null,
            details: json?.details ?? null,
            raw: json,
            request: {
              marketId,
              outcome,
              side,
              price,
              size,
            },
          },
        },
        { status: res.status }
      );
    }

    const orderId =
      json?.id ??
      json?.order_id ??
      json?.orderId ??
      json?.data?.order_id ??
      json?.data?.orderId ??
      null;
    const resolvedPrice = normalizeNumber(json?.price ?? json?.avg_price);

    return NextResponse.json({
      ok: true,
      order: json,
      orderId,
      price: resolvedPrice,
    });
  } catch (err) {
    console.error("Polymarket order server error", err);
    return NextResponse.json(
      { error: "Server error", details: String(err) },
      { status: 500 }
    );
  }
}
