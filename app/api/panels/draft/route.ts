// POST /api/panels/draft — Claude drafts a whole panel from the investor's plain-English brief.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/server/auth';
import { claudeEnabled } from '@/lib/server/claude';
import { draftPanel } from '@/lib/server/panel-builder';

export const runtime = 'nodejs';
export const maxDuration = 60;

const Body = z.object({ brief: z.string().trim().min(20, 'Tell Claude a bit more about your fund').max(4000) });

export async function POST(req: Request) {
  if ((await currentUser())?.role !== 'investor') return NextResponse.json({ error: 'Sign in as an investor' }, { status: 401 });
  if (!claudeEnabled()) return NextResponse.json({ error: 'Claude is not configured' }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid brief' }, { status: 400 });
  try {
    return NextResponse.json({ config: await draftPanel(parsed.data.brief) });
  } catch (e) {
    console.error('[panel-draft]', e);
    return NextResponse.json({ error: "Claude couldn't draft this panel — try rephrasing." }, { status: 502 });
  }
}
