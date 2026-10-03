// POST /api/panels/[id]/sessions
//   { mode: 'interview', candidate: { founderName, startupName, oneLiner, email, consent } }  ← a startup via invite link
//   { mode: 'test' }                                                                         ← the VC trying the panel
import { NextResponse } from 'next/server';
import { CandidateSchema, sessionFromPanel } from '@/lib/config';
import { currentUser } from '@/lib/server/auth';
import { createSession, getPanel } from '@/lib/server/store';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const panel = await getPanel(id);
  if (!panel) return NextResponse.json({ error: 'This interview link is not valid' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { mode?: string; candidate?: unknown } | null;

  if (body?.mode === 'test') {
    const user = await currentUser();
    if (user?.role !== 'investor') return NextResponse.json({ error: 'Sign in as an investor' }, { status: 401 });
    const tester = { founderName: user.name, startupName: 'Test Startup', oneLiner: 'A test run of this interview panel' };
    const sid = await createSession(sessionFromPanel(panel, tester), { mode: 'test', panelId: id });
    return NextResponse.json({ id: sid });
  }

  const parsed = CandidateSchema.safeParse(body?.candidate);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid details' }, { status: 400 });
  const { founderName, startupName, oneLiner, email } = parsed.data;
  const candidate = { founderName, startupName, oneLiner, email, consentAt: new Date().toISOString() };
  const sid = await createSession(sessionFromPanel(panel, candidate), { mode: 'interview', panelId: id, candidate });
  return NextResponse.json({ id: sid });
}
