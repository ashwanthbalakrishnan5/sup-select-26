// Unit tests (pure logic). Run: pnpm test  →  node --import tsx --test tests/unit.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CONFIG, SessionConfigSchema, addSeat, removeSeat, totalMinutes } from '../lib/config';
import { bytesToBase64 } from '../lib/live/base64';
import { DHASH_H, DHASH_W, SlideDeduper, dhash, hamming } from '../lib/live/dhash';
import { FLUSH_SECONDS, VoiceSampler } from '../lib/live/voice-sampler';
import { pcm16ToWav } from '../lib/live/wav';
import { buildInvestorInstruction, ROOM_PROTOCOL } from '../lib/personas';
import { deliveryLine, pitchPacketText, roomLine } from '../lib/room/prompts';
import { formatLine, mmss, takeNewText } from '../lib/room/transcript';
import { computeMetrics, fillerCounts, toSegments } from '../lib/server/metrics';
import type { SessionConfig, TranscriptLine } from '../lib/types';
import { parseVerdict } from '../lib/verdict';

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');

/** "[MM:SS] Speaker: text" lines (+ "[MM:SS] END") → TranscriptLine[] (a line ends where the next starts). */
function parseFixture(text: string): TranscriptLine[] {
  const rows = text
    .split('\n')
    .map((l) => /^\[(\d+):(\d\d)\]\s+([^:]+?)(?::\s*(.*))?$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ t: (+m[1] * 60 + +m[2]) * 1000, name: m[3].trim(), text: m[4] ?? '' }));
  return rows.flatMap((r, i) =>
    r.name === 'END'
      ? []
      : [{ id: `${i}`, t: r.t, endT: rows[i + 1]?.t ?? r.t, speaker: r.name, name: r.name, text: r.text, phase: 'qa' as const }],
  );
}

const valid: SessionConfig = { ...DEFAULT_CONFIG, founderName: 'Priya', startupName: 'Mise AI', oneLiner: 'Inventory AI for kitchens' };

test('metrics match the Python spike exactly', () => {
  const lines = [...parseFixture(fixture('pitch_transcript.txt')), ...parseFixture(fixture('qa_transcript.txt'))];
  const m = computeMetrics(toSegments(lines), 'Priya', ['Maya', 'Raj', 'Elena', 'Tom'], 500);
  assert.equal(m.pitch_duration_s, 500);
  assert.equal(m.pitch_wpm, 128.6);
  assert.equal(m.qa_answer_wpm, 149.2);
  assert.equal(m.founder_words, 1522);
  assert.equal(m.filler_total, 74);
  assert.equal(m.filler_per_100_words, 4.9);
  assert.deepEqual(m.filler_breakdown, {
    um: 25,
    like: 14,
    uh: 13,
    'you know': 12,
    honestly: 4,
    basically: 3,
    literally: 1,
    'i mean': 1,
    'kind of': 1,
  });
  assert.equal(m.qa_founder_share, 0.52);
  assert.equal(m.qa_founder_to_investor_ratio, 1.1);
  assert.equal(m.longest_answer_s, 35);
  assert.deepEqual(m.questions_per_investor, { Maya: 3, Raj: 3, Elena: 3, Tom: 2 });
  assert.deepEqual(m.verdicts_regex, { Tom: 'in', Raj: 'in', Elena: 'out', Maya: 'in' });
});

test('"like" as a verb or "such as" is not a filler', () => {
  assert.deepEqual(fillerCounts('I would like to show tools like MarketMan. It looks like growth.'), {});
  assert.deepEqual(fillerCounts('It was, like, really, um, fast you know'), { 'you know': 1, um: 1, like: 1 });
});

test('metrics on an empty meeting do not throw', () => {
  const m = computeMetrics([], 'Priya', ['Vera'], 0);
  assert.equal(m.pitch_wpm, 0);
  assert.equal(m.longest_answer_s, 0);
  assert.equal(m.qa_founder_share, 0);
});

test('verdict parsing', () => {
  assert.equal(parseVerdict("I'm in. Great team."), 'in');
  assert.equal(parseVerdict('I’m out for now.'), 'out');
  assert.equal(parseVerdict('I am in, conditionally.'), 'in');
  assert.equal(parseVerdict('Im out'), 'out');
  assert.equal(parseVerdict('Interesting, but I need more data.'), 'unclear');
  assert.equal(parseVerdict("I'm intrigued"), 'unclear');
});

test('config validation: defaults need founder details; meeting capped at 10 minutes', () => {
  assert.equal(SessionConfigSchema.safeParse(DEFAULT_CONFIG).success, false);
  assert.equal(SessionConfigSchema.safeParse(valid).success, true);
  const tooLong = SessionConfigSchema.safeParse({ ...valid, pitchMinutes: 6, qaMinutes: 3 });
  assert.equal(tooLong.success, false);
  assert.equal(SessionConfigSchema.safeParse({ ...valid, pitchMinutes: 6, qaMinutes: 2 }).success, true);
  assert.equal(totalMinutes({ pitchMinutes: 4, qaMinutes: 3 }), 9);
});

test('config validation: unique avatars and host in seat 1', () => {
  const dup = { ...valid, seats: [valid.seats[0], { ...valid.seats[1], avatar: valid.seats[0].avatar }] };
  assert.equal(SessionConfigSchema.safeParse(dup).success, false);
  const noHost = { ...valid, seats: [{ ...valid.seats[0], archetype: 'shark' as const }] };
  assert.equal(SessionConfigSchema.safeParse(noHost).success, false);
});

test('seat add/remove keeps ids sequential and seat 1 as host', () => {
  const removed = removeSeat(valid.seats, 'seat-1');
  assert.deepEqual(
    removed.map((s) => s.id),
    ['seat-1', 'seat-2', 'seat-3'],
  );
  assert.equal(removed[0].archetype, 'chair');
  assert.equal(removed[0].avatar, 'Kai');
  const added = addSeat(removed);
  assert.equal(added.length, 4);
  assert.equal(new Set(added.map((s) => s.avatar)).size, 4);
  assert.equal(addSeat(added).length, 4); // max 4
  assert.equal(removeSeat([valid.seats[0]], 'seat-1').length, 1); // min 1
});

test('dhash: identical frames match, different frames differ', () => {
  const grad = Array.from({ length: DHASH_W * DHASH_H }, (_, i) => (i % DHASH_W) * 10);
  const rev = grad.map((v) => 255 - v);
  const noisy = grad.map((v, i) => v + (i % 7 === 0 ? 3 : 0));
  assert.equal(hamming(dhash(grad), dhash(grad)), 0);
  assert.ok(hamming(dhash(grad), dhash(noisy)) <= 40);
  assert.ok(hamming(dhash(grad), dhash(rev)) > 200);
});

test('slide deduper keeps stable distinct slides and skips revisits/transitions', () => {
  const a = dhash(Array.from({ length: 272 }, (_, i) => (i % DHASH_W) * 10));
  const b = dhash(Array.from({ length: 272 }, (_, i) => 255 - (i % DHASH_W) * 10));
  const c = dhash(Array.from({ length: 272 }, (_, i) => (Math.floor(i / DHASH_W) % 2) * 200 + (i % 3) * 20));
  const d = new SlideDeduper();
  const kept = [a, a, a, b, b, a, a, c, c].map((h) => d.offer(h));
  // first frame is never "stable"; a kept at 2nd frame; b kept once stable; a revisit skipped; c kept
  assert.deepEqual(kept, [false, true, false, false, true, false, false, false, true]);
  assert.equal(d.count, 3);
});

test('scribe chunking cuts at sentence boundaries and carries the rest', () => {
  const full = 'We save kitchens money. Our churn is low and';
  const first = takeNewText(full, 0);
  assert.equal(first.chunk, 'We save kitchens money.');
  const second = takeNewText(full + ' falling. Next.', first.consumed, true);
  assert.equal(second.chunk, 'Our churn is low and falling. Next.');
  assert.equal(takeNewText('nospace', 0).chunk, '');
});

test('transcript formatting', () => {
  assert.equal(mmss(65_400), '01:05');
  assert.equal(formatLine({ t: 3000, name: 'Vera', text: 'Hi' }), '[00:03] Vera: Hi');
  assert.equal(roomLine({ speaker: 'founder', name: 'Priya', text: 'Yes' }), '[Founder]: Yes');
  assert.equal(roomLine({ speaker: 'seat-2', name: 'Kai', text: 'Why?' }), '[Investor Kai]: Why?');
});

test('investor instruction carries persona, startup, roster and room protocol', () => {
  const host = buildInvestorInstruction(valid, valid.seats[0], true);
  assert.match(host, /You are Vera, Lead Partner/);
  assert.match(host, /Mise AI/);
  assert.match(host, /Kai \(Technical Partner\)/);
  assert.ok(host.includes(ROOM_PROTOCOL));
  assert.match(host, /floor is theirs for 4 minutes/);
  const guest = buildInvestorInstruction(valid, valid.seats[1], false);
  assert.doesNotMatch(guest, /floor is theirs/);
});

test('pitch packet lists only non-supported claims', () => {
  const text = pitchPacketText(valid, 'We grew 3x.', [
    { claim: 'Toast is bankrupt', verdict: 'contradicted', evidence: 'Toast is public', timestamp: '01:00', severity: 'high', sources: [], source_urls: [], investor_question: '' },
    { claim: 'USDA 30-40%', verdict: 'supported', evidence: 'USDA', timestamp: '00:10', severity: 'low', sources: [], source_urls: [], investor_question: '' },
  ], 2);
  assert.match(text, /Toast is bankrupt/);
  assert.doesNotMatch(text, /USDA/);
  assert.match(text, /Slides shown during the pitch/);
});

test('pcm16ToWav writes a valid 16 kHz mono header', () => {
  const wav = pcm16ToWav([new Uint8Array(3200), new Uint8Array(3200)]);
  const v = new DataView(wav.buffer);
  const tag = (o: number) => String.fromCharCode(...wav.subarray(o, o + 4));
  assert.equal(tag(0), 'RIFF');
  assert.equal(tag(8), 'WAVE');
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(40, true), 6400);
  assert.equal(wav.length, 44 + 6400);
});

test('voice sampler keeps speech (+500 ms hangover), drops silence, flushes at 45 s', () => {
  const chunk = bytesToBase64(new Uint8Array(3200));
  const vs = new VoiceSampler();
  for (let i = 0; i < 20; i++) vs.push(chunk, 0, i * 100); // silence → dropped
  assert.equal(vs.seconds, 0);
  vs.push(chunk, 0.2, 0); // speech
  for (let i = 0; i < 10; i++) vs.push(chunk, 0, 0); // 5 hangover chunks kept, rest dropped
  assert.equal(vs.seconds, 0.6);
  assert.equal(vs.flush(), null); // < 8 s → nothing to analyze
  let clip = null;
  for (let i = 0; i < FLUSH_SECONDS * 10 && !clip; i++) clip = vs.push(chunk, 0.3, 1000 + i * 100);
  assert.ok(clip);
  assert.equal(clip!.startMs, 1000);
  assert.equal(clip!.seconds, FLUSH_SECONDS);
  assert.equal(vs.seconds, 0);
});

test('delivery notes reach the pitch packet', () => {
  const d = {
    startSec: 30,
    phase: 'pitch',
    confidence: 3,
    energy: 4,
    clarity: 5,
    pace: 'slow' as const,
    hesitations: 9,
    emotions: { nervousness: 8, enthusiasm: 3, composure: 3, defensiveness: 2 },
    dominant_emotion: 'nervous',
    note: 'Hedged on revenue.',
    moments: [],
  };
  assert.equal(deliveryLine(d), 'confidence 3/10, energy 4/10, slow pace, sounds nervous — Hedged on revenue.');
  assert.match(pitchPacketText(valid, 'x', [], 0, [d]), /How Priya sounded while pitching[\s\S]*Hedged on revenue/);
});
