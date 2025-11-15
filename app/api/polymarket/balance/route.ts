import { NextResponse } from "next/server";

const parseNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const normalizeBalance = (payload: Record<string, unknown> | null | undefined) => {
  const source = payload ?? {};
  const cash = parseNumber(
    source.cash ?? source.available ?? source.available_cash ?? 0
  );
  const positions = parseNumber(source.positions ?? 0);
  const available = parseNumber(
    source.available ?? source.cash ?? source.available_cash ?? cash
  );

  return { cash, positions, available };
};

export async function GET() {
  const apiKey = process.env.POLY_BUILDER_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing POLY_BUILDER_KEY in env" },
      { status: 500 }
    );
  }

  try {
    const url = new URL("https://clob.polymarket.com/users/balances");
    url.searchParams.set("apiKey", apiKey);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      const errorBody = await res
        .json()
        .catch(() => ({ error: "Unable to read error body" }));
      console.error("Polymarket balance error", {
        status: res.status,
        response: errorBody,
      });
      return NextResponse.json(
        { error: "Unable to load Polymarket balance." },
        { status: res.status }
      );
    }

    const json = await res.json();
    const normalized = normalizeBalance(json?.balances ?? json);
    return NextResponse.json(normalized, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Polymarket balance fetch failed", error);
    return NextResponse.json(
      { error: "Failed to fetch Polymarket balance." },
      { status: 500 }
    );
  }
}
