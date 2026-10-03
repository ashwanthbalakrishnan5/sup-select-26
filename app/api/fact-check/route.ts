// POST /api/fact-check { chunk } → { claims } (two-step grounded fact-check, ~4-7 s).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { factCheck } from '@/lib/server/fact-check';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({ chunk: z.string().min(1).max(8000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    return NextResponse.json({ claims: await factCheck(parsed.data.chunk) });
  } catch (e) {
    console.error('[fact-check]', (e as Error).message);
    return NextResponse.json({ claims: [] });
  }
}
