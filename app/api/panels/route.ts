// POST /api/panels — an investor creates an interview panel.
import { NextResponse } from 'next/server';
import { PanelConfigSchema } from '@/lib/config';
import { currentUser } from '@/lib/server/auth';
import { createPanel } from '@/lib/server/store';
import type { PanelConfig } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if ((await currentUser())?.role !== 'investor') return NextResponse.json({ error: 'Sign in as an investor' }, { status: 401 });
  const parsed = PanelConfigSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid panel' }, { status: 400 });
  return NextResponse.json({ id: await createPanel(parsed.data as PanelConfig) });
}
