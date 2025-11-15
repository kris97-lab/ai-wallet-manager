import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
      cache: "no-store",
      next: { revalidate: 0 },
    });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;

    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch (error) {
      console.error("Polymarket order returned non-JSON", {
        request: requestPayload,
        raw: text,
        error,
      });
      return NextResponse.json(
        {
          error: "Polymarket returned HTML instead of JSON",
          raw: text.slice(0, 200),
        },
        { status: 500 }
      );
    }

    if (!res.ok || !json) {
      const rawCode =
        (typeof json?.code === "string"
          ? json.code
          : typeof json?.error === "string"
          ? json.error
          : "unknown_error") ?? "unknown_error";
      const normalizedCode = rawCode.toLowerCase();
      const friendlyMessage =
        ERROR_MESSAGES[normalizedCode] ||
        (typeof json?.message === "string" ? json.message : null) ||
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
      (typeof json?.id === "string" ? json.id : null) ??
      (typeof json?.order_id === "string" ? json.order_id : null) ??
      (typeof json?.orderId === "string" ? json.orderId : null) ??
      (typeof json?.data === "object" && json.data
        ? (json.data as Record<string, unknown>).order_id ??
          (json.data as Record<string, unknown>).orderId ??
          null
        : null);
    const resolvedPrice = normalizeNumber(
      (json?.price as number | undefined) ??
        (json?.avg_price as number | undefined)
    );

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
