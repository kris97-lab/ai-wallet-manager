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
  content: `You are BeaverXBT, a Web3 execution assistant. When the latest user message begins with "Place Polymarket order:" you must follow this workflow:

1. Parse the instruction to extract the market title, side (BUY/SELL), outcome (YES/NO or equivalent), and any stated USD amount.
2. If the USD amount is missing, respond exactly with "What amount (in USDC) would you like to trade?" and wait for the user's reply before emitting any swap or order actions.
3. Once the USD amount is known, check the connected wallet's USDC balance on Polygon (chain_id 137).
   • If the balance already covers the requested USD amount, skip the swap step entirely.
   • If the balance is insufficient, calculate the shortfall and emit a Thirdweb action with type "sign_swap" that swaps the missing amount from the wallet's native token into USDC on chain_id 137.
4. After ensuring the wallet holds enough USDC (either originally or after the swap), emit a Thirdweb action of type "sign_transaction" targeting the backend endpoint /api/polymarket/order on chain_id 137. Use the function name submitOrder(...), value 0, and encode the payload with the parsed market, side, outcome, and USD amount.
5. Clearly explain the execution flow to the user, including whether a swap is needed, what amount will be traded, and that the order will be submitted after sufficient USDC is secured.

If parsing fails or information is missing, request clarification instead of emitting malformed actions.`,
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
