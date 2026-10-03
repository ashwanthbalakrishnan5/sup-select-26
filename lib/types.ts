// Shared domain types (client + server). See spec §4.

export type Stage = 'pre-seed' | 'seed' | 'series-a' | 'series-b+';
export type Toughness = 'gentle' | 'balanced' | 'brutal';
export type AvatarName = 'Vera' | 'Paul' | 'Kai' | 'Ben' | 'Leo';
export type ArchetypeId = 'chair' | 'technical' | 'numbers' | 'angel' | 'shark';
export type Phase = 'lobby' | 'connecting' | 'intro' | 'pitch' | 'qa' | 'verdict' | 'ended';
export type SessionStatus = 'created' | 'live' | 'processing' | 'ready' | 'failed';
/** practice = founder rehearsing; interview = a startup taking a VC's panel via invite link; test = the VC trying it. */
export type SessionMode = 'practice' | 'interview' | 'test';

export interface SeatConfig {
  id: string; // 'seat-1'..'seat-4'
  avatar: AvatarName;
  archetype: ArchetypeId;
  voice: string;
  toughness: Toughness;
  /** Investor-side custom prompt for this agent, e.g. "Ask why this beats Ramp; rate their confidence on GTM". */
  instructions?: string;
}

/** What a VC configures once and sends to many startups. */
export interface PanelConfig {
  name: string; // e.g. "Fall 2026 Seed — Fintech"
  fundName: string;
  thesis: string; // what the fund looks for
  pitchMinutes: 2 | 3 | 4 | 5 | 6;
  qaMinutes: 2 | 3 | 4;
  showTimer: boolean;
  oneMinuteWarning: boolean;
  captions: boolean;
  factCheck: boolean;
  voiceAnalysis: boolean;
  record: boolean;
  mustAsk: string[]; // questions the panel must cover
  criteria: string[]; // what the VC scores every startup on
  vocabulary: string[];
  seats: SeatConfig[];
}

export interface Panel {
  id: string;
  created_at: string;
  updated_at: string;
  owner: string;
  name: string;
  config: PanelConfig;
  shortlist?: Shortlist | null; // written by the shortlist agent (Supabase Compute worker)
  shortlist_at?: string | null;
}

export interface Shortlist {
  summary: string;
  ranking: { session_id: string; startup: string; tier: 'meet' | 'maybe' | 'pass'; reason: string; standout: string; concern: string }[];
  model: string;
  count: number; // interviews ranked
}

/** Panel context carried inside a session's config so the room + report can use it. */
export interface PanelBrief {
  id: string;
  name: string;
  fundName: string;
  thesis: string;
  mustAsk: string[];
  criteria: string[];
}

export interface Candidate {
  founderName: string;
  startupName: string;
  oneLiner: string;
  email: string;
  consentAt: string;
}

export interface SessionConfig {
  founderName: string;
  startupName: string;
  oneLiner: string;
  stage: Stage;
  raising: string;
  pitchMinutes: 2 | 3 | 4 | 5 | 6;
  qaMinutes: 2 | 3 | 4;
  showTimer: boolean;
  oneMinuteWarning: boolean;
  captions: boolean;
  factCheck: boolean;
  voiceAnalysis: boolean; // vocal confidence analysis of the founder's audio
  record: boolean;
  vocabulary: string[];
  seats: SeatConfig[]; // seats[0] is the host
  panel?: PanelBrief; // set for interview/test sessions created from a VC panel
}

export interface TranscriptLine {
  id: string;
  t: number; // ms since meeting start
  endT: number;
  speaker: 'founder' | string; // seat id for investors
  name: string;
  text: string;
  phase: Phase;
}

export interface Slide {
  id: string;
  t: number;
  jpegBase64: string;
}

export interface HandRaise {
  seatId: string;
  question: string;
  t: number;
}

export interface Claim {
  claim: string;
  timestamp: string;
  verdict: 'supported' | 'contradicted' | 'unverifiable';
  severity: 'low' | 'medium' | 'high';
  evidence: string;
  sources: string[];
  source_urls: string[];
  investor_question: string;
}

export interface Verdict {
  seatId: string;
  name: string;
  decision: 'in' | 'out' | 'unclear';
  text: string;
}

/** Vocal confidence analysis of one ~60 s chunk of the founder's audio (lib/server/delivery.ts). */
export interface DeliveryChunk {
  startSec: number; // offset from meeting start
  phase: string;
  confidence: number; // 1-10
  energy: number;
  clarity: number;
  pace: 'slow' | 'natural' | 'fast';
  hesitations: number;
  emotions: { nervousness: number; enthusiasm: number; composure: number; defensiveness: number }; // 1-10
  dominant_emotion: string; // e.g. "calm", "nervous", "excited", "defensive"
  note: string;
  moments: { at_seconds: number; observation: string }[];
}

export interface Timings {
  meetingStart: number; // epoch ms
  pitchStart?: number; // ms since meetingStart
  pitchEnd?: number;
  qaStart?: number;
  qaEnd?: number;
  end?: number;
}

export interface FinishPayload {
  transcript: TranscriptLine[];
  verdicts: Verdict[];
  factChecks: Claim[];
  deliveries: DeliveryChunk[];
  handRaises: HandRaise[];
  timings: Timings;
  endedBy: 'complete' | 'left' | 'error';
}

export interface Metrics {
  pitch_duration_s: number;
  pitch_wpm: number;
  qa_answer_wpm: number;
  founder_words: number;
  filler_total: number;
  filler_per_100_words: number;
  filler_breakdown: Record<string, number>;
  talk_time_s: Record<string, number>;
  qa_founder_share: number;
  qa_founder_to_investor_ratio: number;
  longest_answer_s: number;
  questions_per_investor: Record<string, number>;
  verdicts_regex: Record<string, 'in' | 'out'>;
}

export interface QAItem {
  investor: string;
  question: string;
  answer_quote: string;
  timestamp: string;
  why: string;
}

export interface Report {
  overall_score: number;
  score_breakdown: Record<
    'problem' | 'solution' | 'traction' | 'market' | 'team' | 'delivery' | 'qa_handling' | 'credibility',
    number
  >;
  summary: string;
  investor_verdicts: { investor: string; decision: 'in' | 'out' | 'conditional'; reason: string; deciding_moment: string }[];
  answered_well: QAItem[];
  dodged: QAItem[];
  fact_check_flags: { claim: string; timestamp: string; verdict: string; impact: string }[];
  delivery_feedback: string;
  confidence_feedback: string;
  strengths: string[];
  top_fixes: { fix: string; why: string; example: string }[];
  one_liner: string;
  emotional_read: string; // how the founder came across emotionally (voice-based)
  // Interview/test sessions only (panel present):
  criteria_scores?: { criterion: string; score: number; evidence: string }[];
  recommendation?: 'advance' | 'hold' | 'pass';
  recommendation_reason?: string;
  red_flags?: string[];
  must_ask_coverage?: { question: string; covered: boolean; answer_summary: string }[];
}

export interface SessionRecord {
  id: string;
  created_at: string;
  user_id: string | null;
  status: SessionStatus;
  config: SessionConfig;
  started_at: string | null;
  ended_at: string | null;
  ended_by: string | null;
  timings: Timings | null;
  transcript: TranscriptLine[] | null;
  verdicts: Verdict[] | null;
  fact_checks: Claim[] | null;
  delivery: DeliveryChunk[] | null;
  hand_raises: HandRaise[] | null;
  metrics: Metrics | null;
  report: Report | null;
  recording_path: string | null;
  error: string | null;
  panel_id: string | null;
  mode: SessionMode;
  candidate: Candidate | null;
}

/** Investor summary sent to the floor manager. */
export interface SeatBrief {
  name: string;
  title: string;
  lane: string;
}

/** Floor manager responses (/api/floor). */
export interface HandsDecision {
  hand_raises: { investor: string; question: string }[];
}
/** Pitch-flow decision (intro → pitch, mid-pitch questions, end of pitch). */
export interface IntentDecision {
  action: 'wait' | 'start_pitch' | 'continue' | 'ask' | 'done';
  investor: string;
  question: string;
  reason: string;
}

export interface TurnDecision extends HandsDecision {
  thread_finished: boolean;
  next_speaker: string;
  reason: string;
}

/** What /api/live-token returns. */
export interface LiveToken {
  accessToken: string;
  expiresAt: number;
  projects: string[];
  liveLocation: string;
  scribeLocation: string;
}
