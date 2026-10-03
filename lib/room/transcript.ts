// Transcript helpers shared by the RoomController, report and metrics.
import type { TranscriptLine } from '../types';

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** "[MM:SS] Name: text" — the format every text agent (fact-check, floor, report) receives. */
export const formatLine = (l: Pick<TranscriptLine, 't' | 'name' | 'text'>) => `[${mmss(l.t)}] ${l.name}: ${l.text}`;

export const formatTranscript = (lines: TranscriptLine[]) => lines.map(formatLine).join('\n');

/**
 * The scribe's text is cumulative. Returns the part added since `consumed` characters, cut back to the last
 * sentence/word boundary so a chunk never ends mid-word (the remainder goes to the next chunk).
 */
export function takeNewText(full: string, consumed: number, final = false): { chunk: string; consumed: number } {
  const fresh = full.slice(consumed);
  if (final) return { chunk: fresh.trim(), consumed: full.length };
  const cut = Math.max(fresh.lastIndexOf('. '), fresh.lastIndexOf('? '), fresh.lastIndexOf('! '));
  const end = cut >= 0 ? cut + 1 : fresh.lastIndexOf(' ');
  if (end <= 0) return { chunk: '', consumed };
  return { chunk: fresh.slice(0, end).trim(), consumed: consumed + end };
}

let seq = 0;
export const lineId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;
