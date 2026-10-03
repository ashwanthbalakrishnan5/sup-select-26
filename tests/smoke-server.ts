// Server smoke test against real Vertex AI (costs a few cents). Uses ADC locally or GOOGLE_SERVICE_ACCOUNT_JSON.
// Run: pnpm smoke  →  node --conditions=react-server --import tsx tests/smoke-server.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../lib/config';
import { analyzeDelivery } from '../lib/server/delivery';
import { factCheck } from '../lib/server/fact-check';
import { decideHands, decideTurn } from '../lib/server/floor';
import { computeMetrics, toSegments } from '../lib/server/metrics';
import { generateReport } from '../lib/server/report';
import { liveToken } from '../lib/server/vertex';
import type { SeatBrief, SessionConfig, TranscriptLine } from '../lib/types';

const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const t = performance.now();
  const r = await fn();
  console.log(`✔ ${label} (${((performance.now() - t) / 1000).toFixed(2)} s)`);
  return r;
};

const seats: SeatBrief[] = [
  { name: 'Vera', title: 'Lead Partner', lane: 'credibility, competition, why now' },
  { name: 'Kai', title: 'Technical Partner', lane: 'technical feasibility, moat, AI accuracy' },
  { name: 'Ben', title: 'Growth Investor', lane: 'market size, unit economics, CAC, retention' },
];

const CHUNK =
  '[01:10] Founder: The restaurant software market is worth four trillion dollars in the US alone. ' +
  'Our main competitor Toast actually went bankrupt last year, so the field is wide open. ' +
  'We have sixty two paying kitchens and they cut food waste by twenty six percent.';

const config: SessionConfig = {
  ...DEFAULT_CONFIG,
  founderName: 'Priya',
  startupName: 'Mise AI',
  oneLiner: 'Computer vision inventory for independent restaurants',
  seats: DEFAULT_CONFIG.seats.slice(0, 3),
};

const line = (t: number, speaker: string, name: string, text: string, phase: TranscriptLine['phase'], dur = 10): TranscriptLine => ({
  id: `${t}`,
  t: t * 1000,
  endT: (t + dur) * 1000,
  speaker,
  name,
  text,
  phase,
});

async function main() {
  const tok = await timed('live token', liveToken);
  assert.ok(tok.accessToken.length > 20);
  assert.ok(tok.projects.length >= 1);

  const hands = await timed('floor: hands', () => decideHands(CHUNK, seats));
  console.log('   hands:', hands.hand_raises.map((h) => `${h.investor}: ${h.question}`));
  assert.ok(hands.hand_raises.length >= 1);

  const turn = await timed('floor: turn', () =>
    decideTurn({
      recent: '[03:00] Ben: What is your CAC?\n[03:05] Priya: Honestly we have not calculated it yet, we grow mostly by word of mouth.',
      seats,
      current: 'Ben',
      questionCounts: { Vera: 0, Kai: 1, Ben: 1 },
      queuedHands: [],
    }),
  );
  console.log('   turn:', turn);
  assert.ok(seats.some((s) => s.name === turn.next_speaker));

  const wav = (f: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', f)).toString('base64');
  const ctx = { startSec: 0, phase: 'pitch', founderName: 'Priya' };
  const confident = await timed('delivery: confident voice', () => analyzeDelivery(wav('confident.wav'), ctx));
  const hesitant = await timed('delivery: hesitant voice', () => analyzeDelivery(wav('hesitant.wav'), ctx));
  console.log(`   confident ${confident.confidence}/10 vs hesitant ${hesitant.confidence}/10 — ${hesitant.note}`);
  assert.ok(confident.confidence - hesitant.confidence >= 4, 'confidence should clearly separate the two clips');

  const claims = await timed('fact-check (two-step, grounded)', () => factCheck(CHUNK));
  for (const c of claims) console.log(`   [${c.verdict}/${c.severity}] ${c.claim} → ${c.source_urls.length} urls`);
  assert.ok(claims.some((c) => /toast/i.test(c.claim) && c.verdict === 'contradicted'), 'should catch the Toast claim');

  const transcript = [
    line(0, 'seat-1', 'Vera', "Welcome Priya, I'm Vera. Please introduce yourself.", 'intro', 5),
    line(6, 'founder', 'Priya', "Hi, I'm Priya, founder of Mise AI.", 'intro', 4),
    line(12, 'founder', 'Priya', CHUNK.replace('[01:10] Founder: ', '') + ' Um, we are raising two million dollars, you know, to expand.', 'pitch', 60),
    line(80, 'seat-3', 'Ben', 'What is your CAC payback?', 'qa', 4),
    line(85, 'founder', 'Priya', 'Honestly we have not calculated it yet.', 'qa', 5),
    line(92, 'seat-2', 'Kai', 'How accurate is the camera on dark shelves?', 'qa', 4),
    line(97, 'founder', 'Priya', 'We measured 94 percent item accuracy across 62 kitchens, using weight sensors as a cross-check.', 'qa', 8),
    line(110, 'seat-3', 'Ben', "I'm out. No unit economics yet.", 'verdict', 4),
    line(115, 'seat-2', 'Kai', "I'm in. The sensor fusion is clever.", 'verdict', 4),
    line(120, 'seat-1', 'Vera', "I'm in. Fix the Toast claim. Thanks Priya.", 'verdict', 5),
  ];
  const metrics = computeMetrics(toSegments(transcript), 'Priya', ['Vera', 'Kai', 'Ben'], 72);
  const report = await timed('report', () =>
    generateReport({
      config,
      transcript,
      claims,
      verdicts: [
        { seatId: 'seat-3', name: 'Ben', decision: 'out', text: "I'm out." },
        { seatId: 'seat-2', name: 'Kai', decision: 'in', text: "I'm in." },
        { seatId: 'seat-1', name: 'Vera', decision: 'in', text: "I'm in." },
      ],
      metrics,
    }),
  );
  console.log('   score', report.overall_score, '| verdicts', report.investor_verdicts.map((v) => `${v.investor}:${v.decision}`).join(' '));
  console.log('   one-liner:', report.one_liner);
  assert.equal(report.top_fixes.length, 3);
  assert.equal(report.investor_verdicts.find((v) => v.investor === 'Ben')?.decision, 'out');
  console.log('\nALL SERVER SMOKE TESTS PASSED');
}

main().catch((e) => {
  console.error('✘', e);
  process.exit(1);
});
