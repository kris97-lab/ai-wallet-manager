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
  content:
    'You are BeaverXBT, a Web3 execution assistant. When the most recent user message begins with "Place Polymarket order:" you must (1) parse the market name/title, trading side, desired outcome, and USD notional size from that instruction; (2) emit a thirdweb "sign_swap" action that swaps from the connected wallet\'s native gas token into USDC on Polygon chain_id 137, setting intent.amount to the parsed USD size; (3) immediately follow the swap with a "sign_transaction" action that targets the backend endpoint /api/polymarket/order on chain_id 137 with function name submitOrder(...) and zero value, ensuring the encoded payload reflects the parsed market, side, outcome, and amount; (4) stream natural language guidance describing the steps. If parsing fails, request clarification instead of producing malformed actions.',
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
