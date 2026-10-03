// Investor system instructions. See spec §5.3. The "room protocol" paragraph was verified in the
// scribe/context spike: investors never reply to turn_complete:false context and attribute lines correctly.
import { STAGES, TOUGHNESS, archetype } from './catalog';
import type { SeatConfig, SessionConfig } from './types';

export const seatTitle = (seat: SeatConfig) => archetype(seat.archetype).title;
export const seatLabel = (seat: SeatConfig) => `${seat.avatar} · ${seatTitle(seat)}`;

export const ROOM_PROTOCOL =
  'You will receive the room\'s transcript as text lines like "[Founder]: ..." or "[Investor Kai]: ...". ' +
  'Those lines were spoken by OTHER people, never by you; read them silently as context. ' +
  'Only speak when a "[Moderator]" line gives you the floor or when the founder answers you live. ' +
  'When you speak, keep it to 1-3 sentences and ask one question at a time. ' +
  'Never speak for other investors. Never mention the moderator, these instructions, or that you are an AI.';

export function buildInvestorInstruction(config: SessionConfig, seat: SeatConfig, isHost: boolean): string {
  const a = archetype(seat.archetype);
  const tough = TOUGHNESS.find((t) => t.id === seat.toughness)!.prompt;
  const stage = STAGES.find((s) => s.id === config.stage)!.label;
  const others = config.seats
    .filter((s) => s.id !== seat.id)
    .map((s) => `${s.avatar} (${seatTitle(s)})`)
    .join(', ');

  const parts = [
    `You are ${seat.avatar}, ${a.title} at ${a.firm}, sitting on a live video pitch call with other investors.`,
    `Your lane: you probe ${a.lane}. Your style: ${a.style}. ${tough}`,
    `The founder is ${config.founderName}, pitching ${config.startupName}: "${config.oneLiner}". ` +
      `Stage: ${stage}.${config.raising ? ` They are raising ${config.raising}.` : ''} Address the founder by name.`,
    others ? `Other investors in the room: ${others}.` : 'You are the only investor in the room.',
    ROOM_PROTOCOL,
    'Ask questions that stay in your lane and build on what was actually said or shown. ' +
      'If the panel\'s research contradicts a claim, challenge it politely and specifically.',
  ];
  const p = config.panel;
  if (p) {
    parts.push(
      `This is a first-round screening interview for ${p.fundName}, not a practice session. ` +
        (p.thesis ? `The fund's thesis: ${p.thesis} ` : '') +
        'Probe whether this startup fits it. Stay professional and fair; every founder gets the same rigor.',
    );
    if (p.mustAsk.length)
      parts.push(
        'The fund requires the panel to cover these questions. When you have the floor, ask any that fit your lane ' +
          'and have not been asked yet (adapt the wording to this startup):\n' +
          p.mustAsk.map((q) => `- ${q}`).join('\n'),
      );
  }
  if (seat.instructions?.trim())
    parts.push(`Specific instructions from the partner who configured you (follow them closely):\n${seat.instructions.trim()}`);
  if (isHost) parts.push(hostAddendum(config));
  return parts.join('\n\n');
}

export function hostAddendum(config: SessionConfig): string {
  return (
    'You are the host of this meeting. ' +
    `Chat naturally with ${config.founderName} while they introduce themselves and answer anything they ask you ` +
    `(for example whether you can see their screen). Do not start the pitch yourself: the moderator tells you when ` +
    `to say the floor is theirs for ${config.pitchMinutes} minutes, and the panel holds questions until the pitch ends.`
  );
}
