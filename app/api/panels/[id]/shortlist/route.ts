// POST /api/panels/[id]/shortlist — re-rank now. (The Supabase Compute worker also re-ranks after every interview.)
import { NextResponse } from 'next/server';
import { runShortlist } from '@/lib/agents/shortlist';
import { currentUser } from '@/lib/server/auth';
import { claudeEnabled, getClaude } from '@/lib/server/claude';
import { getPanel, supabaseAdmin } from '@/lib/server/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await currentUser())?.role !== 'investor') return NextResponse.json({ error: 'Sign in as an investor' }, { status: 401 });
  const { id } = await params;
  const db = supabaseAdmin();
  if (!db || !claudeEnabled()) return NextResponse.json({ error: 'Shortlist needs Supabase and Claude' }, { status: 503 });
  if (!(await getPanel(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    const shortlist = await runShortlist(db, getClaude(), id, process.env.REPORT_MODEL);
    return NextResponse.json({ shortlist });
  } catch (e) {
    console.error('[shortlist]', e);
    return NextResponse.json({ error: "Claude couldn't rank this panel." }, { status: 502 });
  }
}
