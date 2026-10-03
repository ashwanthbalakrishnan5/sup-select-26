// Deterministic delivery metrics (ported 1:1 from the spike's metrics.py). The model's own estimates were badly
// wrong (WPM 141 vs 128.6, fillers 34 vs 74), so these are computed in code and given to the report model as truth.
import { VERDICT_RE } from '../verdict';
import type { Metrics, TranscriptLine } from '../types';

export interface Segment {
  start: number; // seconds
  end: number;
  speaker: string; // display name
  text: string;
}

// Multi-word fillers first so "you know" isn't split; "like" handled separately (verb/preposition vs filler).
const FILLERS = ['you know', 'i mean', 'kind of', 'sort of', 'um', 'uh', 'er', 'ah', 'basically', 'literally', 'honestly'];
const LIKE_NOT_FILLER =
  /\b(would|'d|i|we|you|they|look|looks|looked|feel|feels|felt|seem|seems|seemed|sounds|something|just)\s+like\b/gi;
const WORD_RE = /[A-Za-z0-9'$%.-]+/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

export const words = (text: string) => count(text, WORD_RE);

export function fillerCounts(text: string): Record<string, number> {
  const suchAs = count(text, /\blike\s+[A-Z]/g); // "tools like MarketMan" = "such as"
  let t = text.toLowerCase();
  const c: Record<string, number> = {};
  for (const f of FILLERS) {
    const re = new RegExp(`\\b${escape(f)}\\b`, 'g');
    const n = count(t, re);
    if (n) {
      c[f] = n;
      t = t.replace(re, ' '); // don't double count
    }
  }
  const likeFiller = count(t, /\blike\b/g) - count(t, LIKE_NOT_FILLER) - suchAs;
  if (likeFiller > 0) c.like = likeFiller;
  return c;
}

export function toSegments(lines: TranscriptLine[]): Segment[] {
  return lines.map((l) => ({ start: l.t / 1000, end: Math.max(l.endT, l.t) / 1000, speaker: l.name, text: l.text }));
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function computeMetrics(segs: Segment[], founder: string, investors: string[], pitchEnd: number): Metrics {
  const founderSegs = segs.filter((s) => s.speaker === founder);
  const pitch = founderSegs.filter((s) => s.start < pitchEnd);
  const answers = founderSegs.filter((s) => s.start >= pitchEnd);
  const dur = (ss: Segment[]) => ss.reduce((a, s) => a + (s.end - s.start), 0);
  const wpm = (ss: Segment[]) => {
    const secs = dur(ss);
    return secs ? round(ss.reduce((a, s) => a + words(s.text), 0) / (secs / 60)) : 0;
  };

  const talk: Record<string, number> = {};
  for (const s of segs) talk[s.speaker] = round((talk[s.speaker] ?? 0) + s.end - s.start);
  const qa = segs.filter((s) => s.start >= pitchEnd);
  const qaTalk: Record<string, number> = {};
  for (const s of qa) qaTalk[s.speaker] = (qaTalk[s.speaker] ?? 0) + s.end - s.start;
  const invQa = investors.reduce((a, i) => a + (qaTalk[i] ?? 0), 0);
  const founderQa = qaTalk[founder] ?? 0;

  const fillers: Record<string, number> = {};
  for (const s of founderSegs) for (const [k, v] of Object.entries(fillerCounts(s.text))) fillers[k] = (fillers[k] ?? 0) + v;
  const fillerTotal = Object.values(fillers).reduce((a, b) => a + b, 0);
  const founderWords = founderSegs.reduce((a, s) => a + words(s.text), 0);

  const questions: Record<string, number> = Object.fromEntries(investors.map((i) => [i, 0]));
  const verdicts: Record<string, 'in' | 'out'> = {};
  for (const s of segs) {
    if (!investors.includes(s.speaker)) continue;
    if (s.text.includes('?')) questions[s.speaker]++;
    const m = VERDICT_RE.exec(s.text);
    if (m) verdicts[s.speaker] = m[1].toLowerCase() as 'in' | 'out';
  }

  return {
    pitch_duration_s: pitch.length ? round(pitch[pitch.length - 1].end - pitch[0].start, 0) : 0,
    pitch_wpm: wpm(pitch),
    qa_answer_wpm: wpm(answers),
    founder_words: founderWords,
    filler_total: fillerTotal,
    filler_per_100_words: founderWords ? round((100 * fillerTotal) / founderWords) : 0,
    filler_breakdown: Object.fromEntries(Object.entries(fillers).sort((a, b) => b[1] - a[1])),
    talk_time_s: talk,
    qa_founder_share: qa.length && founderQa + invQa ? round(founderQa / (founderQa + invQa), 2) : 0,
    qa_founder_to_investor_ratio: invQa ? round(founderQa / invQa, 2) : 0,
    longest_answer_s: round(Math.max(0, ...answers.map((s) => s.end - s.start)), 0),
    questions_per_investor: questions,
    verdicts_regex: verdicts,
  };
}
