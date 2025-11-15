import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("poly_session")?.value || "";
  return NextResponse.json({
    active: cookie.length > 5,
  });
}
