// "[Moderator]" lines the RoomController sends as turn_complete:true prompts. See spec §7.3.
import { seatTitle } from '../personas';
import type { Claim, DeliveryChunk, SeatConfig, SessionConfig, TranscriptLine } from '../types';

export const moderator = {
  welcome: (c: SessionConfig, host: SeatConfig, seats: SeatConfig[]) =>
    `[Moderator]: ${c.founderName} from ${c.startupName} just joined. Welcome them in one sentence, introduce yourself ` +
    `and the panel (${seats.map((s) => `${s.avatar} – ${seatTitle(s)}`).join(', ')}) in under 20 seconds, ` +
    `then ask them to introduce themselves briefly.`,

  handOff: (c: SessionConfig) =>
    `[Moderator]: Tell ${c.founderName} in one sentence that the floor is theirs for ${c.pitchMinutes} minutes.`,

  timeUp: (c: SessionConfig) =>
    `[Moderator]: Time is up. Politely stop ${c.founderName}, thank them in one sentence, and say the panel will now ask questions.`,

  pitchDone: (c: SessionConfig) =>
    `[Moderator]: ${c.founderName} has finished the pitch. Thank them in one sentence and say the panel will now ask questions.`,

  floor: (c: SessionConfig, seat: SeatConfig, queued?: string) =>
    `[Moderator]: ${seat.avatar}, you have the floor. ` +
    (queued ? `You raised your hand to ask about: ${queued} ` : '') +
    `Ask ${c.founderName} one question, under 25 words.`,

  respond: (c: SessionConfig, seat: SeatConfig) =>
    `[Moderator]: ${seat.avatar}, ${c.founderName} has finished answering. Respond now: if the answer was vague or ` +
    `dodged your question, ask one short follow-up question; otherwise thank them in one short sentence.`,

  /** Silent context to the floor-holder before its last allowed reply, so it doesn't ask a question nobody answers. */
  lastFollowUp: (c: SessionConfig) =>
    `[Moderator]: After ${c.founderName}'s next answer, do not ask another question — thank them in one short sentence.`,

  verdict: (c: SessionConfig, seat: SeatConfig, isLast: boolean) =>
    `[Moderator]: Q&A is over. ${seat.avatar}, give your decision now. Start with exactly "I'm in" or "I'm out", ` +
    `then give one or two sentences on why. Do not ask questions.` +
    (isLast ? ` Then thank ${c.founderName} and close the meeting in one sentence.` : ''),

  newHost: (c: SessionConfig) =>
    `[Moderator]: The host could not join, so you are now hosting this meeting. Keep the same lane, and follow the ` +
    `moderator's prompts to welcome ${c.founderName} and hand them the floor.`,
};

/** "confidence 7/10, energy 6/10, natural pace — Voice dropped when giving the revenue figure." */
export const deliveryLine = (d: DeliveryChunk) =>
  `confidence ${d.confidence}/10, energy ${d.energy}/10, ${d.pace} pace, sounds ${d.dominant_emotion ?? 'neutral'} — ${d.note}`;

export const roomLine = (line: Pick<TranscriptLine, 'speaker' | 'name' | 'text'>) =>
  line.speaker === 'founder' ? `[Founder]: ${line.text}` : `[Investor ${line.name}]: ${line.text}`;

/** Text part of the pitch packet sent to every seat at Q&A start (slides follow as image parts). */
export function pitchPacketText(
  c: SessionConfig,
  pitchTranscript: string,
  claims: Claim[],
  slideCount: number,
  deliveries: DeliveryChunk[] = [],
): string {
  const lines = [`[Scribe] ${c.founderName}'s full pitch transcript:`, `[Founder]: ${pitchTranscript || '(transcript unavailable)'}`];
  const flagged = claims.filter((x) => x.verdict !== 'supported');
  if (flagged.length) {
    lines.push("[Scribe] Fact-check notes from the panel's research:");
    for (const x of flagged) lines.push(`- "${x.claim}" → ${x.verdict}: ${x.evidence}`);
  }
  if (deliveries.length) {
    lines.push(`[Scribe] How ${c.founderName} sounded while pitching (you heard this tone of voice in the room):`);
    for (const d of deliveries) lines.push(`- ${deliveryLine(d)}`);
  }
  lines.push(slideCount ? '[Scribe] Slides shown during the pitch, in order:' : '[Scribe] No slides were shared.');
  return lines.join('\n');
}
