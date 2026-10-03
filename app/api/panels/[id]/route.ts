// PUT /api/panels/[id] — save panel changes.
import { NextResponse } from 'next/server';
import { PanelConfigSchema } from '@/lib/config';
import { currentUser } from '@/lib/server/auth';
import { getPanel, updatePanel } from '@/lib/server/store';
import type { PanelConfig } from '@/lib/types';

export const runtime = 'nodejs';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await currentUser())?.role !== 'investor') return NextResponse.json({ error: 'Sign in as an investor' }, { status: 401 });
  const { id } = await params;
  if (!(await getPanel(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = PanelConfigSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid panel' }, { status: 400 });
  await updatePanel(id, parsed.data as PanelConfig);
  return NextResponse.json({ ok: true });
}
