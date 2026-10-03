// Panel builder agent: a VC describes their fund and what they screen for in plain English; Claude drafts the whole
// interview panel (investors, per-agent instructions, must-ask questions, scoring criteria, format). Server-only.
import 'server-only';
import { ARCHETYPES, AVATARS, MAX_PITCH_PLUS_QA, TOUGHNESS, VOICES } from '@/lib/catalog';
import { DEFAULT_PANEL, PanelConfigSchema } from '@/lib/config';
import type { PanelConfig, SeatConfig } from '@/lib/types';
import { claudeJson } from './claude';

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short panel name, e.g. "Climate seed screening — Q4".' },
    fundName: { type: 'string' },
    thesis: { type: 'string', description: '1–3 sentences the panel screens against.' },
    pitchMinutes: { type: 'integer', enum: [2, 3, 4, 5, 6] },
    qaMinutes: { type: 'integer', enum: [2, 3, 4] },
    factCheck: { type: 'boolean' },
    mustAsk: { type: 'array', items: { type: 'string' }, description: '3–6 questions every startup must be asked.' },
    criteria: { type: 'array', items: { type: 'string' }, description: '4–6 short scoring criteria (2–4 words each).' },
    vocabulary: { type: 'array', items: { type: 'string' }, description: 'Domain terms, competitor and product names to listen for (max 15).' },
    seats: {
      type: 'array',
      description: '2–4 AI investors. The first is the host and must be archetype "chair". Each avatar at most once.',
      items: {
        type: 'object',
        properties: {
          avatar: { type: 'string', enum: AVATARS.map((a) => a.name) },
          archetype: { type: 'string', enum: ARCHETYPES.map((a) => a.id) },
          voice: { type: 'string', enum: VOICES.map((v) => v.name) },
          toughness: { type: 'string', enum: TOUGHNESS.map((t) => t.id) },
          instructions: {
            type: 'string',
            description: "2–4 sentences of specific instructions for this investor, in the partner's voice: what to probe, what to ask, what a good answer sounds like.",
          },
        },
        required: ['avatar', 'archetype', 'voice', 'toughness', 'instructions'],
      },
    },
  },
  required: ['name', 'fundName', 'thesis', 'pitchMinutes', 'qaMinutes', 'factCheck', 'mustAsk', 'criteria', 'vocabulary', 'seats'],
};

type Draft = Pick<PanelConfig, 'name' | 'fundName' | 'thesis' | 'pitchMinutes' | 'qaMinutes' | 'factCheck' | 'mustAsk' | 'criteria' | 'vocabulary'> & {
  seats: Omit<SeatConfig, 'id'>[];
};

const SYSTEM = `You design first-round AI interview panels for venture investors. A partner describes their fund and what they screen for; you turn it into a panel of AI investors that will run live video interviews with startups.

Available AI investors (avatars): ${AVATARS.map((a) => `${a.name} (${a.look})`).join('; ')}.
Roles (archetypes): ${ARCHETYPES.map((a) => `${a.id} = ${a.title}, probes ${a.lane}`).join('; ')}.
Voices: ${VOICES.map((v) => `${v.name} (${v.tone})`).join(', ')}.

Rules: the first seat is the host with archetype "chair". Give each investor a distinct lane so they don't repeat each other. Turn the partner's specific asks into must-ask questions and per-investor instructions. Pitch + Q&A must total at most ${MAX_PITCH_PLUS_QA} minutes. Keep everything concise and concrete.`;

/** Drafts a panel from a plain-English brief. Always returns a config that passes PanelConfigSchema. */
export async function draftPanel(brief: string): Promise<PanelConfig> {
  const d = await claudeJson<Draft>({ system: SYSTEM, content: brief, schema: SCHEMA, maxTokens: 6000 });

  // Repair anything the schema can't enforce: unique avatars, chair first, 1–4 seats, time cap.
  const seen = new Set<string>();
  const seats = d.seats
    .filter((s) => !seen.has(s.avatar) && seen.add(s.avatar))
    .slice(0, 4)
    .map((s, i): SeatConfig => ({ ...s, id: `seat-${i + 1}`, archetype: i === 0 ? 'chair' : s.archetype === 'chair' ? 'numbers' : s.archetype }));
  const qaMinutes = d.pitchMinutes + d.qaMinutes > MAX_PITCH_PLUS_QA ? 2 : d.qaMinutes;
  const pitchMinutes = (d.pitchMinutes + qaMinutes > MAX_PITCH_PLUS_QA ? MAX_PITCH_PLUS_QA - qaMinutes : d.pitchMinutes) as PanelConfig['pitchMinutes'];
  const draft: PanelConfig = {
    ...DEFAULT_PANEL,
    name: d.name.slice(0, 80),
    fundName: d.fundName.slice(0, 60),
    thesis: d.thesis.slice(0, 1000),
    pitchMinutes,
    qaMinutes,
    factCheck: d.factCheck,
    mustAsk: d.mustAsk.map((q) => q.slice(0, 300)).filter(Boolean).slice(0, 10),
    criteria: d.criteria.map((c) => c.slice(0, 120)).filter(Boolean).slice(0, 8),
    vocabulary: d.vocabulary.map((v) => v.slice(0, 40)).filter(Boolean).slice(0, 20),
    seats: seats.length ? seats : DEFAULT_PANEL.seats,
  };
  return PanelConfigSchema.parse(draft) as PanelConfig;
}
