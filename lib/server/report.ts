// Final analysis report: gemini-3.8-flash (thinking LOW, ~26-30 s) over the full transcript + fact-checks +
// code-computed metrics (given as ground truth). Schema verified in the spike.
import 'server-only';
import { ThinkingLevel } from '@google/genai';
import { archetype } from '../catalog';
import { formatTranscript } from '../room/transcript';
import type { Claim, DeliveryChunk, Metrics, Report, SessionConfig, TranscriptLine, Verdict } from '../types';
import { claudeEnabled, claudeJson } from './claude';
import { MODELS, textClient } from './vertex';

const system = (c: SessionConfig) => `You are a senior pitch coach writing the post-meeting report for ${c.founderName}, who just \
pitched ${c.startupName} to AI investors (${c.seats.map((s) => `${s.avatar} - ${archetype(s.archetype).title}`).join(', ')}).
You receive the full timestamped transcript (intro, pitch, Q&A, verdicts), fact-check results gathered live, \
the investors' spoken verdicts, deterministic delivery metrics computed in code, and VOCAL_CONFIDENCE: ratings of \
how the founder actually sounded, from a model that listened to their voice in ~45 s clips (startSec = offset in \
the meeting). Treat the metrics, fact-check verdicts and vocal ratings as ground truth; interpret them, do not \
recompute them. confidence_feedback: 2-3 sentences on vocal confidence — where it held, where it dropped (cite the \
moments), and how it likely affected the investors.
Be specific and candid. Every judgement about an answer must cite a short verbatim quote with its [MM:SS]. \
Score harshly but fairly: 50 = typical seed pitch, 80+ = would get a term sheet in this room.
answered_well: answers that were direct, specific and data-backed. dodged: vague, evasive, \
walked-back or admitted-unknown answers to a direct question.
investor_verdicts: one per investor; decision must match what they actually said ("I'm in" / "I'm out"), use \
"conditional" only if they made an explicit condition.
top_fixes: exactly the three changes that would most improve the outcome next time, most important first.
one_liner: rewrite the company's pitch into one sharp sentence (<25 words) using only facts the founder \
stated that were not contradicted.`;

export function reportSchema(investors: string[]) {
  const qaItem = {
    type: 'object',
    properties: {
      investor: { type: 'string', enum: investors },
      question: { type: 'string' },
      answer_quote: { type: 'string' },
      timestamp: { type: 'string' },
      why: { type: 'string' },
    },
    required: ['investor', 'question', 'answer_quote', 'timestamp', 'why'],
  };
  const areas = ['problem', 'solution', 'traction', 'market', 'team', 'delivery', 'qa_handling', 'credibility'];
  return {
    type: 'object',
    properties: {
      overall_score: { type: 'integer', minimum: 0, maximum: 100 },
      score_breakdown: {
        type: 'object',
        properties: Object.fromEntries(areas.map((k) => [k, { type: 'integer', minimum: 1, maximum: 10 }])),
        required: areas,
      },
      summary: { type: 'string', description: '3 sentences max' },
      investor_verdicts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            investor: { type: 'string', enum: investors },
            decision: { type: 'string', enum: ['in', 'out', 'conditional'] },
            reason: { type: 'string' },
            deciding_moment: { type: 'string', description: '[MM:SS] + quote' },
          },
          required: ['investor', 'decision', 'reason', 'deciding_moment'],
        },
      },
      answered_well: { type: 'array', items: qaItem },
      dodged: { type: 'array', items: qaItem },
      fact_check_flags: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claim: { type: 'string' },
            timestamp: { type: 'string' },
            verdict: { type: 'string' },
            impact: { type: 'string' },
          },
          required: ['claim', 'timestamp', 'verdict', 'impact'],
        },
      },
      delivery_feedback: { type: 'string', description: 'Interpret pace, fillers, talk-time' },
      confidence_feedback: { type: 'string', description: 'Interpret the vocal confidence timeline' },
      strengths: { type: 'array', items: { type: 'string' } },
      top_fixes: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: { fix: { type: 'string' }, why: { type: 'string' }, example: { type: 'string', description: 'What to say instead' } },
          required: ['fix', 'why', 'example'],
        },
      },
      one_liner: { type: 'string' },
      emotional_read: { type: 'string', description: 'How the founder came across emotionally, from VOCAL_CONFIDENCE' },
    },
    required: [
      'emotional_read',
      'overall_score',
      'score_breakdown',
      'summary',
      'investor_verdicts',
      'answered_well',
      'dodged',
      'fact_check_flags',
      'delivery_feedback',
      'confidence_feedback',
      'strengths',
      'top_fixes',
      'one_liner',
    ],
  };
}

/** Extra fields for interview/test sessions: scored against the VC's own criteria + a screening recommendation. */
function addPanelFields(schema: ReturnType<typeof reportSchema>, criteria: string[], mustAsk: string[]) {
  const props = schema.properties as Record<string, unknown>;
  props.criteria_scores = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        criterion: { type: 'string', enum: criteria.length ? criteria : ['Overall'] },
        score: { type: 'integer', minimum: 1, maximum: 10 },
        evidence: { type: 'string', description: '[MM:SS] + short quote or observation' },
      },
      required: ['criterion', 'score', 'evidence'],
    },
  };
  props.recommendation = { type: 'string', enum: ['advance', 'hold', 'pass'] };
  props.recommendation_reason = { type: 'string', description: '2 sentences for the VC deciding on a human round' };
  props.red_flags = { type: 'array', items: { type: 'string' } };
  props.must_ask_coverage = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        question: { type: 'string', enum: mustAsk.length ? mustAsk : ['(none)'] },
        covered: { type: 'boolean' },
        answer_summary: { type: 'string' },
      },
      required: ['question', 'covered', 'answer_summary'],
    },
  };
  schema.required.push('criteria_scores', 'recommendation', 'recommendation_reason', 'red_flags', 'must_ask_coverage');
  return schema;
}

const panelSystem = (c: SessionConfig) =>
  c.panel
    ? `\nThis was a screening interview for ${c.panel.fundName} (${c.panel.name}). The reader is the VC deciding \
whether to invite the founder to a human round, not the founder. Fund thesis: ${c.panel.thesis || '(none)'}.
criteria_scores: score EVERY criterion in VC_CRITERIA 1-10 with evidence. must_ask_coverage: one entry per \
MUST_ASK question. red_flags: concrete concerns (contradicted claims, dodges, inconsistencies). recommendation: \
advance / hold / pass with recommendation_reason. emotional_read: what the voice analysis says about composure, \
nervousness and confidence under questioning — present it as a voice-based signal, not a judgement of character.`
    : `\nemotional_read: 2 sentences coaching the founder on how they came across emotionally (from VOCAL_CONFIDENCE).`;

export async function generateReport(input: {
  config: SessionConfig;
  transcript: TranscriptLine[];
  claims: Claim[];
  deliveries?: DeliveryChunk[];
  verdicts: Verdict[];
  metrics: Metrics;
}): Promise<Report> {
  const { config, transcript, claims, deliveries = [], verdicts, metrics } = input;
  const flagged = claims
    .filter((c) => c.verdict !== 'supported')
    .map(({ claim, timestamp, verdict, evidence }) => ({ claim, timestamp, verdict, evidence }));
  const contents = [
    `TRANSCRIPT:\n${formatTranscript(transcript) || '(empty)'}`,
    `FACT_CHECKS:\n${JSON.stringify(flagged)}`,
    `SPOKEN_VERDICTS:\n${JSON.stringify(verdicts.map(({ name, decision, text }) => ({ investor: name, decision, text })))}`,
    `METRICS:\n${JSON.stringify(metrics)}`,
    `VOCAL_CONFIDENCE:\n${deliveries.length ? JSON.stringify(deliveries) : '(not analyzed)'}`,
    `TARGET_PITCH_SECONDS: ${config.pitchMinutes * 60}`,
    ...(config.panel
      ? [`VC_CRITERIA:\n${JSON.stringify(config.panel.criteria)}`, `MUST_ASK:\n${JSON.stringify(config.panel.mustAsk)}`]
      : []),
  ].join('\n\n');
  const schema = reportSchema(config.seats.map((s) => s.avatar));

  const systemInstruction = system(config) + panelSystem(config);
  const responseSchema = config.panel ? addPanelFields(schema, config.panel.criteria, config.panel.mustAsk) : schema;

  // Claude Sonnet 5.5 writes the report when a key is configured; Gemini is the fallback.
  if (claudeEnabled()) {
    try {
      return await claudeJson<Report>({ system: systemInstruction, content: contents, schema: responseSchema });
    } catch (e) {
      console.error('[report] Claude failed, falling back to Gemini:', (e as Error).message);
    }
  }
  const res = await textClient().models.generateContent({
    model: MODELS.research,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseJsonSchema: responseSchema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  return JSON.parse(res.text ?? '{}') as Report;
}
