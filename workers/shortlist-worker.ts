// Supabase Compute worker (private): drains the `shortlist` queue (pgmq, fed by a trigger when an interview report is
// ready) and re-ranks that panel's startups with Claude. Bundled to supabase/compute/shortlist-worker/index.mjs by
// `pnpm worker:build`; deployed with `supabase compute push shortlist-worker`.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { drainShortlistQueue } from '../lib/agents/shortlist';

const POLL_MS = 5000;
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const model = process.env.REPORT_MODEL ?? 'claude-sonnet-5-5';

const stats = {
  worker: 'shortlist-worker',
  started_at: new Date().toISOString(),
  configured: { supabase: !!(url && key), claude: !!process.env.ANTHROPIC_API_KEY },
  last_poll_at: null as string | null,
  ranked: 0,
  failed: 0,
  last_error: null as string | null,
  last_panel: null as string | null,
};

const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
const claude = new Anthropic();

async function tick() {
  if (!db) return;
  stats.last_poll_at = new Date().toISOString();
  for (const r of await drainShortlistQueue(db, claude, model)) {
    if (r.error) {
      stats.failed++;
      stats.last_error = r.error;
      console.error(`[shortlist] panel ${r.panelId} failed: ${r.error}`);
    } else {
      stats.ranked++;
      stats.last_panel = r.panelId;
      console.log(`[shortlist] panel ${r.panelId}: ranked ${r.ranked} in ${r.ms} ms`);
    }
  }
}

async function loop() {
  try {
    await tick();
  } catch (e) {
    stats.last_error = (e as Error).message;
    console.error('[shortlist] poll failed:', e);
  }
  setTimeout(loop, POLL_MS);
}

console.log('[shortlist] worker up', stats.configured);
void loop();

// Health/status endpoint (private exposure: reachable only from inside the project).
const worker = { fetch: () => Response.json(stats) };
export default worker;
