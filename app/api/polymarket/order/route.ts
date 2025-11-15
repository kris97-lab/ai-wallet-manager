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

    const res = await fetch("https://clob.polymarket.com/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      body: JSON.stringify({
        market: marketId,
        outcome,
        side,
        price,
        size,
        type: "market",
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error || "Order rejected" },
        { status: 400 }
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
