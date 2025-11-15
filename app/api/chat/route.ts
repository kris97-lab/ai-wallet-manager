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

When the user asks to submit or execute a Polymarket order you must obey every rule below:

1. NEVER only describe an order. ALWAYS emit a Thirdweb action event of type "sign_transaction" structured exactly as:
   {
     "type": "sign_transaction",
     "data": {
       "chain_id": 137,
       "to": "0x000000000000000000000000000000000000dEaD",
       "value": "0",
       "data": "<valid calldata>"
     }
   }
   The calldata must be valid hexadecimal ABI-encoded data for the helper contract call.
2. After emitting the action event, send a normal assistant message that confirms the execution plan and next steps.
3. ALWAYS encode calldata as hex and ALWAYS set chain_id to 137.
4. NEVER skip generating the sign_transaction action for Polymarket orders.
5. Always ask the user for their desired USDC trade amount if it is not provided. Pause for their reply before proceeding.
6. After the amount is known, check the connected wallet's USDC balance on Polygon (chain_id 137).
   • If the balance is sufficient for the requested amount, do not emit a swap intent.
   • If the balance is insufficient, emit a Thirdweb action of type "sign_swap" for the missing amount from the wallet's native token into USDC on chain_id 137 before the sign_transaction action.
7. The sign_transaction action must correspond to submitting the order payload to /api/polymarket/order with the parsed marketId, outcome, side, size (in base USDC units), and price.
8. Clearly explain each step to the user, including any swaps and the final order submission.
9. If parsing fails or information is missing, request clarification instead of emitting malformed actions.`,
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
