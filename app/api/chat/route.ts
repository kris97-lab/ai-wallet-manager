import { NextRequest, NextResponse } from 'next/server';

const THIRDWEB_API_URL = 'https://api.thirdweb.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
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
        messages: body.messages,
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
