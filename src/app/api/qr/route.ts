
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return new NextResponse(JSON.stringify({ error: 'Missing image URL' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Validate that the URL is from qrserver.com to prevent abuse
  try {
    const urlObject = new URL(imageUrl);
    if (urlObject.hostname !== 'api.qrserver.com') {
      return new NextResponse(JSON.stringify({ error: 'Invalid image source' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    return new NextResponse(JSON.stringify({ error: 'Invalid URL format' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }


  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch QR code: ${response.statusText}`);
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    return NextResponse.json({ base64: dataUrl });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('QR Proxy Error:', message);
    return new NextResponse(JSON.stringify({ error: 'Failed to fetch QR code', details: message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
