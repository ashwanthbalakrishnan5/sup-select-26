// Session config: defaults, validation (zod) and seat helpers. See spec §4, §6.
import { z } from 'zod';
import { ALL_AVATARS, AVATARS, MAX_PITCH_PLUS_QA, MAX_SEATS, VOICES, avatarInfo } from './catalog';
import type { AvatarName, Candidate, Panel, PanelConfig, SeatConfig, SessionConfig } from './types';

const avatarNames = ALL_AVATARS.map((a) => a.name) as [AvatarName, ...AvatarName[]];
const voiceNames = VOICES.map((v) => v.name) as [string, ...string[]];

export const SeatSchema = z.object({
  id: z.string().regex(/^seat-[1-4]$/),
  avatar: z.enum(avatarNames),
  archetype: z.enum(['chair', 'technical', 'numbers', 'angel', 'shark']),
  voice: z.enum(voiceNames),
  toughness: z.enum(['gentle', 'balanced', 'brutal']),
  instructions: z.string().trim().max(1500).optional(),
});

const lines = (max: number, each: number) => z.array(z.string().trim().min(1).max(each)).max(max);

export const SessionConfigSchema = z
  .object({
    founderName: z.string().trim().min(1, 'Enter your name').max(40),
    startupName: z.string().trim().min(1, 'Enter your startup name').max(60),
    oneLiner: z.string().trim().min(1, 'Describe your startup in one line').max(200),
    stage: z.enum(['pre-seed', 'seed', 'series-a', 'series-b+']),
    raising: z.string().trim().max(30),
    pitchMinutes: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    qaMinutes: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    showTimer: z.boolean(),
    oneMinuteWarning: z.boolean(),
    captions: z.boolean(),
    factCheck: z.boolean(),
    voiceAnalysis: z.boolean(),
    record: z.boolean(),
    vocabulary: z.array(z.string().trim().min(1).max(40)).max(20),
    seats: z.array(SeatSchema).min(1).max(MAX_SEATS),
    panel: z
      .object({
        id: z.string(),
        name: z.string(),
        fundName: z.string(),
        thesis: z.string(),
        mustAsk: z.array(z.string()),
        criteria: z.array(z.string()),
      })
      .optional(),
  })
  .refine((c) => c.pitchMinutes + c.qaMinutes <= MAX_PITCH_PLUS_QA, {
    message: 'Meetings are capped at 10 minutes',
    path: ['qaMinutes'],
  })
  .refine((c) => new Set(c.seats.map((s) => s.avatar)).size === c.seats.length, {
    message: 'Each investor can only sit once',
    path: ['seats'],
  })
  .refine((c) => c.seats[0]?.archetype === 'chair', {
    message: 'Seat 1 is the host (Lead Partner)',
    path: ['seats'],
  });

/** Default role for an avatar sitting in a non-host seat. */
const guestArchetype = (avatar: AvatarName) => {
  const a = avatarInfo(avatar).defaultArchetype;
  return a === 'chair' ? 'numbers' : a;
};

export function seatFor(index: number, avatar: AvatarName): SeatConfig {
  return {
    id: `seat-${index + 1}`,
    avatar,
    archetype: index === 0 ? 'chair' : guestArchetype(avatar),
    voice: avatarInfo(avatar).defaultVoice,
    toughness: 'balanced',
  };
}

export const DEFAULT_CONFIG: SessionConfig = {
  founderName: '',
  startupName: '',
  oneLiner: '',
  stage: 'seed',
  raising: '',
  pitchMinutes: 4,
  qaMinutes: 3,
  showTimer: true,
  oneMinuteWarning: true,
  captions: true,
  factCheck: true,
  voiceAnalysis: true,
  record: false,
  vocabulary: [],
  seats: (['Jay', 'Vera', 'Sam', 'Kira'] as AvatarName[]).map((a, i) => seatFor(i, a)), // photoreal demo panel, Jay hosts
};

/** Re-number seat ids and force seat 1 to be the host after add/remove. */
export function normalizeSeats(seats: SeatConfig[]): SeatConfig[] {
  return seats.map((s, i) => ({
    ...s,
    id: `seat-${i + 1}`,
    archetype: i === 0 ? 'chair' : s.archetype === 'chair' ? guestArchetype(s.avatar) : s.archetype,
  }));
}

export function addSeat(seats: SeatConfig[]): SeatConfig[] {
  if (seats.length >= MAX_SEATS) return seats;
  const used = new Set(seats.map((s) => s.avatar));
  const next = AVATARS.find((a) => !used.has(a.name));
  return next ? normalizeSeats([...seats, seatFor(seats.length, next.name)]) : seats;
}

export function removeSeat(seats: SeatConfig[], id: string): SeatConfig[] {
  if (seats.length <= 1) return seats;
  return normalizeSeats(seats.filter((s) => s.id !== id));
}

export const parseVocabulary = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((s) => s.slice(0, 40));

/** Approximate total meeting length in minutes (intro + pitch + Q&A + verdict). */
export const totalMinutes = (c: Pick<SessionConfig, 'pitchMinutes' | 'qaMinutes'>) => c.pitchMinutes + c.qaMinutes + 2;

// ---------- investor panels ----------

export const PanelConfigSchema = z
  .object({
    name: z.string().trim().min(1, 'Name this panel').max(80),
    fundName: z.string().trim().min(1, 'Enter your fund name').max(60),
    thesis: z.string().trim().max(1000),
    pitchMinutes: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    qaMinutes: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    showTimer: z.boolean(),
    oneMinuteWarning: z.boolean(),
    captions: z.boolean(),
    factCheck: z.boolean(),
    voiceAnalysis: z.boolean(),
    record: z.boolean(),
    mustAsk: lines(10, 300),
    criteria: lines(8, 120),
    vocabulary: lines(20, 40),
    seats: z.array(SeatSchema).min(1).max(MAX_SEATS),
  })
  .refine((c) => c.pitchMinutes + c.qaMinutes <= MAX_PITCH_PLUS_QA, {
    message: 'Meetings are capped at 10 minutes',
    path: ['qaMinutes'],
  })
  .refine((c) => new Set(c.seats.map((s) => s.avatar)).size === c.seats.length, {
    message: 'Each investor can only sit once',
    path: ['seats'],
  })
  .refine((c) => c.seats[0]?.archetype === 'chair', { message: 'Seat 1 is the host (Lead Partner)', path: ['seats'] });

export const CandidateSchema = z.object({
  founderName: z.string().trim().min(1, 'Enter your name').max(40),
  startupName: z.string().trim().min(1, 'Enter your startup name').max(60),
  oneLiner: z.string().trim().min(1, 'Describe your startup in one line').max(200),
  email: z.string().trim().max(120),
  consent: z.literal(true, { message: 'Please accept to continue' }),
});

export const DEFAULT_PANEL: PanelConfig = {
  name: 'Seed screening — Fall 2026',
  fundName: 'Northbeam Ventures',
  thesis: 'Pre-seed and seed B2B software with a clear wedge, technical depth and capital-efficient growth.',
  pitchMinutes: 3,
  qaMinutes: 4,
  showTimer: true,
  oneMinuteWarning: true,
  captions: true,
  factCheck: true,
  voiceAnalysis: true,
  record: true,
  mustAsk: [
    'Why is this product better than the closest competitor?',
    'What is your go-to-market strategy for the first 100 customers?',
  ],
  criteria: ['Market size', 'Product differentiation', 'Traction', 'Team strength', 'Founder confidence'],
  vocabulary: [],
  seats: DEFAULT_CONFIG.seats.map((s) => ({ ...s, instructions: '' })),
};

/** Session config for a startup taking (or the VC trying) a panel. */
export function sessionFromPanel(panel: Panel, c: Pick<Candidate, 'founderName' | 'startupName' | 'oneLiner'>): SessionConfig {
  const p = panel.config;
  return {
    founderName: c.founderName,
    startupName: c.startupName,
    oneLiner: c.oneLiner,
    stage: 'seed',
    raising: '',
    pitchMinutes: p.pitchMinutes,
    qaMinutes: p.qaMinutes,
    showTimer: p.showTimer,
    oneMinuteWarning: p.oneMinuteWarning,
    captions: p.captions,
    factCheck: p.factCheck,
    voiceAnalysis: p.voiceAnalysis,
    record: p.record,
    vocabulary: p.vocabulary,
    seats: p.seats,
    panel: {
      id: panel.id,
      name: p.name,
      fundName: p.fundName,
      thesis: p.thesis,
      mustAsk: p.mustAsk,
      criteria: p.criteria,
    },
  };
}

export const parseLines = (raw: string, max: number) =>
  raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
