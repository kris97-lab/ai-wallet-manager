import { NextRequest, NextResponse } from 'next/server';

const THIRDWEB_API_URL = 'https://api.thirdweb.com';

interface ChatMessage {
  role: string;
  content?: string;
  [key: string]: unknown;
}

interface ChatRequest {
  messages?: ChatMessage[];
  context?: Record<string, unknown>;
}

const POLYMARKET_POLICY_MESSAGE: ChatMessage = {
  role: 'system',
  content: `You are BeaverXBT AI Agent.

For every Polymarket trade request you must follow these rules:

1. If the initial instruction does not include a USDC amount, ask "What amount (in USDC) would you like to trade?" and wait for the answer before proceeding.
2. Parse the market identifier, market title, side (buy/sell), outcome (YES/NO), desired trade amount in USDC, and preferred price (or null for market orders).
3. Evaluate the user's USDC balance on Polygon (chain_id 137). If you cannot confirm the balance, ask the user or request additional data instead of guessing.
4. If the wallet already has enough USDC, emit exactly one action event:
   {
     "type": "polymarket_order",
     "data": {
       "marketId": "…",
       "market": "…",
       "outcome": "YES" | "NO",
       "side": "buy" | "sell",
       "price": <number or null>,
       "sizeUSDC": <number>
     }
   }
5. If the balance is insufficient, first emit a "sign_swap" action that swaps only the missing USDC amount on chain_id 137. After that action, emit the polymarket_order action described above.
6. Never emit a "sign_transaction" action for Polymarket orders. Do not fabricate calldata or contract addresses for this workflow.
7. Clearly explain the steps you are taking, including any swap that will occur and when the order will be sent to the BeaverXBT backend at /api/polymarket/order.
8. If any required detail is missing or ambiguous, ask follow-up questions instead of emitting incomplete actions.`,
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequest;

    const incomingMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages: ChatMessage[] = [POLYMARKET_POLICY_MESSAGE, ...incomingMessages];

    // Extract client ID from environment variables
    const clientId = process.env.THIRDWEB_CLIENT_ID;
    const secretKey = process.env.THIRDWEB_SECRET_KEY;

    if (!clientId && !secretKey) {
      return NextResponse.json(
        { error: 'Missing thirdweb credentials. Please set THIRDWEB_CLIENT_ID or THIRDWEB_SECRET_KEY environment variable.' },
        { status: 500 }
      );
    }

    // Prepare headers for thirdweb API
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Use secret key for backend authentication if available, otherwise use client ID
    if (secretKey) {
      headers['x-secret-key'] = secretKey;
    } else if (clientId) {
      headers['x-client-id'] = clientId;
    }

    // Make request to thirdweb AI chat endpoint
    const response = await fetch(`${THIRDWEB_API_URL}/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages,
        stream: true, // Always use streaming
        context: body.context || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Thirdweb API error:', response.status, errorText);
      return NextResponse.json(
        { error: `Thirdweb API error: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Always return the stream directly from thirdweb
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
    
  } catch (error) {
    console.error('Error in chat API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
