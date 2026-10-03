// GET /api/live-token — short-lived OAuth token for the browser's Live API WebSockets (?access_token=).
import { NextResponse } from 'next/server';
import { liveToken } from '@/lib/server/vertex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await liveToken(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[live-token]', (e as Error).message);
    return NextResponse.json({ error: 'Could not mint a Live API token' }, { status: 500 });
  }
}
