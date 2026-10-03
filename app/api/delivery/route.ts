// POST /api/delivery { wavBase64, startSec, phase, founderName } → DeliveryChunk (vocal confidence of ~45 s of speech).
// A 45 s 16 kHz WAV is ~1.9 MB (~2.6 MB base64) — inside Vercel's 4.5 MB request limit.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { analyzeDelivery } from '@/lib/server/delivery';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({
  wavBase64: z.string().min(100).max(4_000_000),
  startSec: z.number().min(0),
  phase: z.enum(['pitch', 'qa']),
  founderName: z.string().max(40),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { wavBase64, ...context } = parsed.data;
  try {
    return NextResponse.json(await analyzeDelivery(wavBase64, context));
  } catch (e) {
    console.error('[delivery]', (e as Error).message);
    return NextResponse.json({ error: 'Delivery analysis failed' }, { status: 502 });
  }
}
