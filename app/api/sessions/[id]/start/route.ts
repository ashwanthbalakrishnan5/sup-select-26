// POST /api/sessions/[id]/start — the meeting began (intro started).
import { NextResponse } from 'next/server';
import { getSession, updateSession } from '@/lib/server/store';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await updateSession(id, { status: 'live', started_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
