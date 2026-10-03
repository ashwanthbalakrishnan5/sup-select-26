// POST /api/sessions/[id]/finish — save the meeting, then (in the background via after()) compute metrics (code)
// and generate the report (model, 25-60 s). Responds immediately with status 'processing'; the report page polls.
// Body: FinishPayload, or { retry: true } to re-run the analysis from the stored transcript.
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { drainShortlistQueue } from '@/lib/agents/shortlist';
import { claudeEnabled, getClaude } from '@/lib/server/claude';
import { computeMetrics, toSegments } from '@/lib/server/metrics';
import { generateReport } from '@/lib/server/report';
import { getSession, supabaseAdmin, updateSession } from '@/lib/server/store';
import type { FinishPayload, SessionRecord } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // background analysis runs inside this budget (Vercel Fluid compute)

const Line = z.object({
  id: z.string(),
  t: z.number(),
  endT: z.number(),
  speaker: z.string(),
  name: z.string(),
  text: z.string(),
  phase: z.string(),
});
const Payload = z.object({
  transcript: z.array(Line).max(2000),
  verdicts: z.array(z.object({ seatId: z.string(), name: z.string(), decision: z.enum(['in', 'out', 'unclear']), text: z.string() })),
  factChecks: z.array(z.any()).max(200),
  deliveries: z.array(z.any()).max(100).default([]),
  handRaises: z.array(z.object({ seatId: z.string(), question: z.string(), t: z.number() })),
  timings: z.object({
    meetingStart: z.number(),
    pitchStart: z.number().optional(),
    pitchEnd: z.number().optional(),
    qaStart: z.number().optional(),
    qaEnd: z.number().optional(),
    end: z.number().optional(),
  }),
  endedBy: z.enum(['complete', 'left', 'error']),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => null);

  let data: FinishPayload;
  if (body?.retry) {
    if (!s.transcript) return NextResponse.json({ error: 'Nothing to analyze yet' }, { status: 400 });
    data = {
      transcript: s.transcript,
      verdicts: s.verdicts ?? [],
      factChecks: s.fact_checks ?? [],
      deliveries: s.delivery ?? [],
      handRaises: s.hand_raises ?? [],
      timings: s.timings ?? { meetingStart: 0 },
      endedBy: (s.ended_by as FinishPayload['endedBy']) ?? 'complete',
    };
  } else {
    const parsed = Payload.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    data = parsed.data as FinishPayload;
    await updateSession(id, {
      ended_at: new Date().toISOString(),
      ended_by: data.endedBy,
      timings: data.timings,
      transcript: data.transcript,
      verdicts: data.verdicts,
      fact_checks: data.factChecks,
      delivery: data.deliveries,
      hand_raises: data.handRaises,
    });
  }
  await updateSession(id, { status: 'processing', error: null });

  after(async () => {
    try {
      const result = await analyze(s, data);
      await updateSession(id, { ...result, status: 'ready', error: null });
      // The DB trigger just queued a shortlist re-rank for this panel. Drain it here too unless the Supabase Compute
      // worker is the consumer (SHORTLIST_CONSUMER=compute); pgmq's visibility timeout stops double processing.
      const db = supabaseAdmin();
      if (s.panel_id && db && claudeEnabled() && process.env.SHORTLIST_CONSUMER !== 'compute') {
        await drainShortlistQueue(db, getClaude(), process.env.REPORT_MODEL).catch((e) => console.error('[finish] shortlist', e));
      }
    } catch (e) {
      console.error('[finish] analysis failed', (e as Error).message);
      await updateSession(id, { status: 'failed', error: (e as Error).message });
    }
  });
  return NextResponse.json({ status: 'processing' });
}

async function analyze(s: SessionRecord, data: FinishPayload): Promise<Pick<SessionRecord, 'metrics' | 'report'>> {
  const investors = s.config.seats.map((x) => x.avatar);
  const pitchEnd = (data.timings.pitchEnd ?? data.timings.qaStart ?? Number.MAX_SAFE_INTEGER) / 1000;
  const metrics = computeMetrics(toSegments(data.transcript), s.config.founderName, investors, pitchEnd);
  const report = await generateReport({
    config: s.config,
    transcript: data.transcript,
    claims: data.factChecks,
    deliveries: data.deliveries,
    verdicts: data.verdicts,
    metrics,
  });
  return { metrics, report };
}
