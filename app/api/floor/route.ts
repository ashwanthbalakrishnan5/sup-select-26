// POST /api/floor — { mode:'hands', recent, seats } | { mode:'turn', recent, seats, current, questionCounts, queuedHands }.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { decideHands, decideTurn } from '@/lib/server/floor';

export const runtime = 'nodejs';

const Seat = z.object({ name: z.string(), title: z.string(), lane: z.string() });
const Body = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('hands'), recent: z.string().max(8000), seats: z.array(Seat).min(1).max(4) }),
  z.object({
    mode: z.literal('turn'),
    recent: z.string().max(8000),
    seats: z.array(Seat).min(1).max(4),
    current: z.string(),
    questionCounts: z.record(z.string(), z.number()),
    queuedHands: z.array(z.string()),
  }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const b = parsed.data;
  try {
    return NextResponse.json(b.mode === 'hands' ? await decideHands(b.recent, b.seats) : await decideTurn(b));
  } catch (e) {
    console.error('[floor]', (e as Error).message);
    return NextResponse.json({ error: 'Floor decision failed' }, { status: 502 });
  }
}
