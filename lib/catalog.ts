// Static catalog: avatars, archetypes, voices, stages. Values verified against Vertex AI on 2026-10-02.
import type { ArchetypeId, AvatarName, Stage, Toughness } from './types';

export interface AvatarInfo {
  name: AvatarName;
  image: string; // public path, 320x320 still
  look: string;
  defaultArchetype: ArchetypeId;
  defaultVoice: string;
}

// The only prebuilt avatars that exist (probed 160 names). Order = default panel order.
export const AVATARS: AvatarInfo[] = [
  { name: 'Vera', image: '/avatars/Vera.jpg', look: 'Silver bob, black high-neck', defaultArchetype: 'chair', defaultVoice: 'Kore' },
  { name: 'Kai', image: '/avatars/Kai.jpg', look: 'Young, sunglasses on head', defaultArchetype: 'technical', defaultVoice: 'Puck' },
  { name: 'Ben', image: '/avatars/Ben.jpg', look: 'Young, beard, olive jacket', defaultArchetype: 'numbers', defaultVoice: 'Charon' },
  { name: 'Leo', image: '/avatars/Leo.jpg', look: 'Older, beret and scarf', defaultArchetype: 'angel', defaultVoice: 'Algieba' },
  { name: 'Paul', image: '/avatars/Paul.jpg', look: 'Senior, suit and tie', defaultArchetype: 'shark', defaultVoice: 'Algenib' },
];

export const avatarInfo = (name: AvatarName): AvatarInfo => AVATARS.find((a) => a.name === name)!;

export interface Archetype {
  id: ArchetypeId;
  title: string; // shown on the tile
  firm: string;
  lane: string; // what they probe
  style: string;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'chair',
    title: 'Lead Partner',
    firm: 'Northbeam Ventures',
    lane: 'credibility, competition, why now, and whether this team can win',
    style: 'warm, crisp and in control; you run the meeting',
  },
  {
    id: 'technical',
    title: 'Technical Partner',
    firm: 'Northbeam Ventures',
    lane: 'technical feasibility, architecture, moat, scalability, AI accuracy and the cost of the technology',
    style: 'skeptical and precise; you want specifics, not buzzwords',
  },
  {
    id: 'numbers',
    title: 'Growth Investor',
    firm: 'Ledger Capital',
    lane: 'market size, unit economics, CAC, LTV, retention, revenue and every number the founder states',
    style: 'data-driven and terse; you ask for exact figures',
  },
  {
    id: 'angel',
    title: 'Angel Investor',
    firm: 'an operator-angel syndicate',
    lane: "founder motivation, customer love, user experience and go-to-market hustle",
    style: 'encouraging but honest; you care about the founder and the customer',
  },
  {
    id: 'shark',
    title: 'The Shark',
    firm: 'Apex Growth Partners',
    lane: 'valuation, deal terms, defensibility and why anyone should give this company money',
    style: 'blunt and provocative, but never rude',
  },
];

export const archetype = (id: ArchetypeId): Archetype => ARCHETYPES.find((a) => a.id === id)!;

export const TOUGHNESS: { id: Toughness; label: string; prompt: string }[] = [
  {
    id: 'gentle',
    label: 'Gentle',
    prompt: 'Be supportive. Accept partial answers and help the founder find their footing.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    prompt: 'Be fair and rigorous, like a typical good investor.',
  },
  {
    id: 'brutal',
    label: 'Brutal',
    prompt: 'Be demanding. Push on every weak spot and show little patience for vague answers. Never insult the founder.',
  },
];

// 30 prebuilt Live API voices (configure-language-voice docs).
export const VOICES: { name: string; tone: string }[] = [
  { name: 'Zephyr', tone: 'Bright' },
  { name: 'Kore', tone: 'Firm' },
  { name: 'Orus', tone: 'Firm' },
  { name: 'Autonoe', tone: 'Bright' },
  { name: 'Umbriel', tone: 'Easy-going' },
  { name: 'Erinome', tone: 'Clear' },
  { name: 'Laomedeia', tone: 'Upbeat' },
  { name: 'Schedar', tone: 'Even' },
  { name: 'Achird', tone: 'Friendly' },
  { name: 'Sadachbia', tone: 'Lively' },
  { name: 'Puck', tone: 'Upbeat' },
  { name: 'Fenrir', tone: 'Excitable' },
  { name: 'Aoede', tone: 'Breezy' },
  { name: 'Enceladus', tone: 'Breathy' },
  { name: 'Algieba', tone: 'Smooth' },
  { name: 'Algenib', tone: 'Gravelly' },
  { name: 'Achernar', tone: 'Soft' },
  { name: 'Gacrux', tone: 'Mature' },
  { name: 'Zubenelgenubi', tone: 'Casual' },
  { name: 'Sadaltager', tone: 'Knowledgeable' },
  { name: 'Charon', tone: 'Informative' },
  { name: 'Leda', tone: 'Youthful' },
  { name: 'Callirrhoe', tone: 'Easy-going' },
  { name: 'Iapetus', tone: 'Clear' },
  { name: 'Despina', tone: 'Smooth' },
  { name: 'Rasalgethi', tone: 'Informative' },
  { name: 'Alnilam', tone: 'Firm' },
  { name: 'Pulcherrima', tone: 'Forward' },
  { name: 'Vindemiatrix', tone: 'Gentle' },
  { name: 'Sulafat', tone: 'Warm' },
];

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'pre-seed', label: 'Pre-seed' },
  { id: 'seed', label: 'Seed' },
  { id: 'series-a', label: 'Series A' },
  { id: 'series-b+', label: 'Series B+' },
];

export const PITCH_MINUTES = [2, 3, 4, 5, 6] as const;
export const QA_MINUTES = [2, 3, 4] as const;
export const MAX_PITCH_PLUS_QA = 8; // + ~45 s intro + ~60 s verdict keeps the meeting ≤ 10 min
export const MAX_SEATS = 4;
