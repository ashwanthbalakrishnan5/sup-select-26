// Floor manager (who speaks next + silent hand-raises). Latency-critical: gemini-3.5-flash-lite, thinking MINIMAL
// (spike: 33/36 correct, median 1.09 s). Hard rules live in the RoomController; the model only makes judgement calls.
import 'server-only';
import { ThinkingLevel } from '@google/genai';
import type { HandsDecision, IntentDecision, SeatBrief, TurnDecision } from '../types';
import { MODELS, textClient } from './vertex';

const roster = (seats: SeatBrief[]) => seats.map((s) => `- ${s.name} (${s.title}): probes ${s.lane}`).join('\n');

const handsSchema = (names: string[]) => ({
  type: 'object',
  properties: {
    hand_raises: {
      type: 'array',
      items: {
        type: 'object',
        properties: { investor: { type: 'string', enum: names }, question: { type: 'string' } },
        required: ['investor', 'question'],
      },
    },
  },
  required: ['hand_raises'],
});

const handsSystem = (seats: SeatBrief[]) => `You watch a live startup pitch on behalf of these investors. The founder must not be interrupted.
Investors:
${roster(seats)}
Given the latest ~60s of the pitch, list which investors would now queue a question. Only raise a hand \
for something specific in that investor's lane: a dubious number, a vague or risky claim, a missing \
metric, or a strong point worth probing. Each question is in that investor's voice, under 30 words, \
and quotes or names the exact claim. Zero to three hands; most urgent first.`;

const turnSystem = (seats: SeatBrief[]) => `You are the floor manager of an investor Q&A. The founder has just finished answering \
current_investor. Decide:
1. thread_finished: false ONLY if the founder dodged, was vague, contradicted themself, or the answer \
opened an obviously risky new issue - then current_investor follows up. true if the answer was \
direct and complete, or the founder plainly admitted not knowing (a follow-up would just repeat).
2. next_speaker: if not finished, current_investor. If finished, choose a different investor: strongly \
prefer one listed in not_yet_asked, then whoever has the sharpest still-open issue (queued_hands help).
3. hand_raises: questions investors now want to ask (new or still open), most urgent first, max 3.
Investors:
${roster(seats)}`;

async function call<T>(system: string, schema: object, payload: object, timeoutMs: number): Promise<T> {
  const res = await textClient().models.generateContent({
    model: MODELS.fast,
    contents: JSON.stringify(payload),
    config: {
      systemInstruction: system,
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });
  return JSON.parse(res.text ?? '{}') as T;
}

export async function decideHands(recent: string, seats: SeatBrief[]): Promise<HandsDecision> {
  const names = seats.map((s) => s.name);
  return call<HandsDecision>(handsSystem(seats), handsSchema(names), { latest_chunk: recent }, 15_000); // not latency-critical
}

export async function decideTurn(input: {
  recent: string;
  seats: SeatBrief[];
  current: string;
  questionCounts: Record<string, number>;
  queuedHands: string[];
}): Promise<TurnDecision> {
  const names = input.seats.map((s) => s.name);
  const schema = {
    type: 'object',
    properties: {
      thread_finished: { type: 'boolean' },
      next_speaker: { type: 'string', enum: names },
      reason: { type: 'string', description: 'Under 15 words' },
      hand_raises: handsSchema(names).properties.hand_raises,
    },
    required: ['thread_finished', 'next_speaker', 'reason', 'hand_raises'],
  };
  const r = await call<TurnDecision>(turnSystem(input.seats), schema, {
    current_investor: input.current,
    question_counts: input.questionCounts,
    not_yet_asked: names.filter((n) => !input.questionCounts[n] && n !== input.current),
    queued_hands: input.queuedHands,
    recent_transcript: input.recent,
  }, 4_000); // the client gives up after 2 s and falls back to a rule anyway
  if (r.thread_finished && r.next_speaker === input.current && names.length > 1) {
    // guard: a finished thread must move on — pick the least-asked other investor
    r.next_speaker = names
      .filter((n) => n !== input.current)
      .reduce((a, b) => ((input.questionCounts[a] ?? 0) <= (input.questionCounts[b] ?? 0) ? a : b));
  }
  return r;
}

const intentSystem = (seats: SeatBrief[], host: string, founder: string) => `You manage the flow of a live startup pitch meeting \
with an investor panel, like a real VC partner meeting. The host is ${host}; the founder is ${founder}.
Investors:
${roster(seats)}
You get the meeting phase and the latest transcript. Decide what happens now:
- phase "intro" (the founder is introducing themselves to the host before pitching):
  "start_pitch" only when the founder has introduced themselves and nothing is left open between them and the host: \
no unanswered question, no question just answered that the founder may follow up on (e.g. "can you see my screen?" → wait), \
or the founder clearly says they are ready / starts pitching. Otherwise "wait".
- phase "pitch" (the panel listens silently; the founder must not be interrupted):
  "ask" ONLY if the founder's latest words directly address the panel or an investor with a question or request that \
needs an answer now (e.g. "can you see my slides?", "Leo, have you seen this market?", "any questions so far?"). \
Rhetorical questions inside the pitch ("So why now?", "What does this mean?") are NOT asks. Set investor to the one \
addressed by name, else the most relevant lane, else the host.
  "done" if the founder signals the pitch is over ("that's my pitch", "happy to take questions", "thank you, that's all").
  Otherwise "continue".
- phase "aside" (an investor briefly answered the founder mid-pitch): "continue" if the founder went back to pitching, \
"ask" if they asked something new (set investor), "done" if they signal the pitch is over, "wait" if they are still \
talking with that investor (follow-up question or reply).`;

export async function decideIntent(input: {
  phase: 'intro' | 'pitch' | 'aside';
  seats: SeatBrief[];
  host: string;
  founder: string;
  latest: string;
  context: string;
}): Promise<IntentDecision> {
  const names = input.seats.map((s) => s.name);
  const schema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['wait', 'start_pitch', 'continue', 'ask', 'done'] },
      investor: { type: 'string', enum: names },
      question: { type: 'string', description: "The founder's question in their words, if action is ask." },
      reason: { type: 'string', description: 'Under 12 words' },
    },
    required: ['action', 'investor', 'question', 'reason'],
  };
  return call<IntentDecision>(
    intentSystem(input.seats, input.host, input.founder),
    schema,
    { phase: input.phase, founder_latest_words: input.latest, earlier_context: input.context },
    4_000,
  );
}
