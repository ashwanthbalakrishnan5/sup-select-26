// Shortlist agent: Claude reads every finished interview for a panel and ranks the startups against the fund's thesis
// and criteria, writing the result to panels.shortlist. Pure (no server-only): runs in the Supabase Compute worker
// (queue-driven, see supabase/compute/shortlist-worker) and in the Next server ("Re-rank now").
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Panel, SessionRecord, Shortlist } from '../types';
import { toClaudeSchema } from './claude-schema';

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '2–3 sentences for the partner: how strong this batch is and who to meet first.' },
    ranking: {
      type: 'array',
      description: 'Every interview, best first.',
      items: {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          startup: { type: 'string' },
          tier: { type: 'string', enum: ['meet', 'maybe', 'pass'], description: 'meet = invite to a human partner meeting.' },
          reason: { type: 'string', description: 'One sentence, citing evidence from the interview.' },
          standout: { type: 'string', description: 'The single strongest signal.' },
          concern: { type: 'string', description: 'The single biggest open risk.' },
        },
        required: ['session_id', 'startup', 'tier', 'reason', 'standout', 'concern'],
      },
    },
  },
  required: ['summary', 'ranking'],
};

type Row = Pick<SessionRecord, 'id' | 'created_at' | 'mode' | 'candidate' | 'config' | 'report' | 'verdicts' | 'delivery'>;

function brief(s: Row) {
  const r = s.report!;
  const d = s.delivery ?? [];
  const conf = d.length ? Math.round((d.reduce((a, x) => a + x.confidence, 0) / d.length) * 10) / 10 : null;
  return {
    session_id: s.id,
    startup: s.config.startupName,
    founder: s.config.founderName,
    one_liner: s.config.oneLiner,
    test_run: s.mode === 'test',
    overall_score: r.overall_score,
    recommendation: r.recommendation,
    recommendation_reason: r.recommendation_reason,
    criteria_scores: r.criteria_scores,
    red_flags: r.red_flags,
    must_ask_coverage: r.must_ask_coverage?.map((m) => ({ q: m.question, covered: m.covered })),
    verdicts: (s.verdicts ?? []).map((v) => `${v.name}: ${v.decision}`),
    voice_confidence: conf,
    emotional_read: r.emotional_read,
    summary: r.summary,
    fact_check_flags: r.fact_check_flags?.map((f) => `${f.claim} → ${f.verdict}`),
  };
}

/** Ranks a panel's finished interviews with Claude and saves the shortlist. Returns null if there's nothing to rank. */
export async function runShortlist(db: SupabaseClient, claude: Anthropic, panelId: string, model = 'claude-sonnet-5-5') {
  const { data: panel, error: pe } = await db.from('panels').select('*').eq('id', panelId).maybeSingle<Panel>();
  if (pe) throw new Error(pe.message);
  if (!panel) return null;
  const { data: rows, error } = await db
    .from('pitch_sessions')
    .select('id, created_at, mode, candidate, config, report, verdicts, delivery')
    .eq('panel_id', panelId)
    .eq('status', 'ready')
    .in('mode', ['interview', 'test'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const ready = (rows as Row[]).filter((r) => r.report);
  if (!ready.length) return null;

  const c = panel.config;
  const res = await claude.beta.messages.create({
    model,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system:
      `You are the associate at ${c.fundName} who prepares the partner's shortlist after an AI first-round interview panel. ` +
      'Rank every startup against the fund thesis and scoring criteria, using only the evidence in the interview reports. ' +
      'Weigh substance (criteria scores, must-ask answers, fact-check flags, red flags) above polish; use voice confidence ' +
      'and emotional read as tie-breakers, never as the main reason. Put at most a third of startups in "meet". ' +
      'Test runs are the partner trying the panel themselves; rank them like anyone else.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          fund: c.fundName,
          panel: c.name,
          thesis: c.thesis,
          criteria: c.criteria,
          must_ask: c.mustAsk,
          interviews: ready.map(brief),
        }),
      },
    ],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: toClaudeSchema(SCHEMA) as Record<string, unknown> } },
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to rank this panel');
  if (res.stop_reason === 'max_tokens') throw new Error('Shortlist was cut off (max_tokens)');
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const shortlist: Shortlist = { ...(JSON.parse(text) as Omit<Shortlist, 'model' | 'count'>), model: res.model, count: ready.length };

  const { error: ue } = await db.from('panels').update({ shortlist, shortlist_at: new Date().toISOString() }).eq('id', panelId);
  if (ue) throw new Error(ue.message);
  return shortlist;
}

/**
 * Drains the `shortlist` queue (pgmq; a trigger enqueues a job whenever a panel interview's report is ready) and
 * re-ranks each affected panel once. Failed jobs stay unacked and reappear after the 120 s visibility timeout.
 * Consumers: the Supabase Compute worker, and the Next server after each report unless SHORTLIST_CONSUMER=compute.
 */
export async function drainShortlistQueue(db: SupabaseClient, claude: Anthropic, model?: string) {
  const { data: jobs, error } = await db.rpc('claim_shortlist_jobs', { n: 10 });
  if (error) throw new Error(error.message);
  const byPanel = new Map<string, number[]>();
  for (const j of (jobs ?? []) as { msg_id: number; panel_id: string }[]) byPanel.set(j.panel_id, [...(byPanel.get(j.panel_id) ?? []), j.msg_id]);
  const results: { panelId: string; ranked?: number; ms: number; error?: string }[] = [];
  for (const [panelId, ids] of byPanel) {
    const t0 = Date.now();
    try {
      const s = await runShortlist(db, claude, panelId, model);
      await Promise.all(ids.map((id) => db.rpc('ack_shortlist_job', { id })));
      results.push({ panelId, ranked: s?.count ?? 0, ms: Date.now() - t0 });
    } catch (e) {
      results.push({ panelId, ms: Date.now() - t0, error: (e as Error).message });
    }
  }
  return results;
}
