import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  const res = await fetch("https://api.polymarket.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      client_id: process.env.POLYMARKET_CLIENT_ID!,
      client_secret: process.env.POLYMARKET_CLIENT_SECRET!,
      redirect_uri: process.env.POLYMARKET_REDIRECT_URI!,
      grant_type: "authorization_code"
    })
  });

  const data = await res.json();

  const session = data.session_token ?? "";

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": `poly_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
    }
  });
}
