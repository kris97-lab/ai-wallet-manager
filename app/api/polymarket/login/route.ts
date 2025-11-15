import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.POLYMARKET_CLIENT_ID!;
  const redirectUri = process.env.POLYMARKET_REDIRECT_URI!;

  const authUrl = new URL("https://api.polymarket.com/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "trade");

  return NextResponse.redirect(authUrl.toString());
}
