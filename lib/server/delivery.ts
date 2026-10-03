// Vocal confidence & delivery: gemini-3.8-flash LISTENS to ~60 s of the founder's own audio (not the transcript) and
// rates how they sound. The investors' Live sessions never hear the pitch audio (the founder must not be interrupted),
// so these notes are what lets confidence influence their questions and verdicts. Report shows the timeline.
import 'server-only';
import { ThinkingLevel } from '@google/genai';
import type { DeliveryChunk } from '../types';
import { MODELS, textClient } from './vertex';

export const DELIVERY_SYSTEM = `You are a vocal delivery coach listening to a startup founder speaking to investors.
Judge HOW they sound, not what they say: steadiness and volume of the voice, pitch variation vs monotone, upspeak
(statements that sound like questions), hesitations, filler sounds, long pauses, rushing, trailing off, hedging
language ("I think", "maybe", "I'd have to check"). Scores are 1-10 (10 = commanding, assured delivery).
emotions: 1-10 intensity of what the VOICE conveys — nervousness (shaky, rushed, breathy), enthusiasm (energy,
pitch lift), composure (steady, measured under pressure), defensiveness (clipped, sharp, deflecting tone).
dominant_emotion: one word for the overall emotional tone (e.g. calm, confident, nervous, excited, defensive, flat).
moments: up to 3 notable moments with the second offset inside this clip where confidence clearly rose or dropped.
note: one short sentence an investor would notice, e.g. "Voice dropped and hedged when giving the revenue figure."`;

export const DELIVERY_SCHEMA = {
  type: 'object',
  properties: {
    confidence: { type: 'integer', minimum: 1, maximum: 10 },
    energy: { type: 'integer', minimum: 1, maximum: 10 },
    clarity: { type: 'integer', minimum: 1, maximum: 10 },
    pace: { type: 'string', enum: ['slow', 'natural', 'fast'] },
    hesitations: { type: 'integer', minimum: 0, description: 'Count of audible hesitations, fillers and false starts' },
    emotions: {
      type: 'object',
      properties: Object.fromEntries(
        ['nervousness', 'enthusiasm', 'composure', 'defensiveness'].map((k) => [k, { type: 'integer', minimum: 1, maximum: 10 }]),
      ),
      required: ['nervousness', 'enthusiasm', 'composure', 'defensiveness'],
    },
    dominant_emotion: { type: 'string' },
    note: { type: 'string' },
    moments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { at_seconds: { type: 'number' }, observation: { type: 'string' } },
        required: ['at_seconds', 'observation'],
      },
    },
  },
  required: ['confidence', 'energy', 'clarity', 'pace', 'hesitations', 'emotions', 'dominant_emotion', 'note', 'moments'],
};

/** wavBase64: 16 kHz mono PCM16 WAV of one chunk of the founder's speech. */
export async function analyzeDelivery(
  wavBase64: string,
  context: { startSec: number; phase: string; founderName: string },
): Promise<DeliveryChunk> {
  const res = await textClient().models.generateContent({
    model: MODELS.research,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'audio/wav', data: wavBase64 } },
          { text: `This is ${context.founderName} during the ${context.phase} phase of an investor pitch.` },
        ],
      },
    ],
    config: {
      systemInstruction: DELIVERY_SYSTEM,
      responseMimeType: 'application/json',
      responseJsonSchema: DELIVERY_SCHEMA,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  const r = JSON.parse(res.text ?? '{}') as Omit<DeliveryChunk, 'startSec' | 'phase'>;
  return { ...r, startSec: context.startSec, phase: context.phase };
}
