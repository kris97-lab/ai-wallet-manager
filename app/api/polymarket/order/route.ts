import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      marketId,
      outcome,
      side,
      size,
      price,
    } = body;

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
      console.error("Polymarket order error", {
        status: res.status,
        response: json,
        request: requestPayload,
      });

      return NextResponse.json(
        {
          ok: false,
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

    return NextResponse.json({ ok: true, order: json });
  } catch (err) {
    return NextResponse.json(
      { error: "Server error", details: String(err) },
      { status: 500 }
    );
  }
}
