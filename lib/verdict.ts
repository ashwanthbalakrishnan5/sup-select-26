// Parse an investor's spoken verdict. Shared by the RoomController (tile badge) and metrics.
export const VERDICT_RE = /\bI(?:'|’| a)?m\s+(in|out)\b/i;

export function parseVerdict(text: string): 'in' | 'out' | 'unclear' {
  const m = VERDICT_RE.exec(text);
  return m ? (m[1].toLowerCase() as 'in' | 'out') : 'unclear';
}
