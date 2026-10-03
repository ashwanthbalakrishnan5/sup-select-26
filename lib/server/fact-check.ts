// Live fact-checker, two steps (spike: search + JSON schema in one call often loses grounding URLs):
// 1) gemini-3.8-flash + Google Search, plain-text notes; 2) gemini-3.5-flash-lite structures them;
// then code swaps model-written domains for the real grounding URLs.
import 'server-only';
import { ThinkingLevel } from '@google/genai';
import type { Claim } from '../types';
import { MODELS, textClient } from './vertex';

export const FACT_CHECK_SYSTEM = `You are the fact-checker for a panel of venture investors listening to a live startup pitch.
You receive one ~60-second chunk of the founder's speech (speech-to-text, may contain filler words).
1. Extract only concrete, checkable factual claims about the outside world: statistics, market sizes, \
facts about named companies/competitors, public events, regulations. Skip opinions, vision statements and \
the startup's own private metrics (revenue, customers, retention) - those cannot be web-verified; \
instead list them under unverifiable only if they are suspicious.
2. Use Google Search to verify each external claim.
3. verdict: "supported" (credible sources agree), "contradicted" (credible sources disagree, or the number \
is off by more than ~2x), or "unverifiable".
4. For each claim write a one-sentence evidence summary and one sharp, specific question an investor could ask \
the founder about it. Questions should be polite but pointed, under 30 words.
If the chunk has no checkable claims, return an empty list.`;

export const CLAIM_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string', description: 'The claim, quoted or tightly paraphrased' },
          timestamp: { type: 'string', description: 'MM:SS of the line' },
          verdict: { type: 'string', enum: ['supported', 'contradicted', 'unverifiable'] },
          severity: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How much this hurts founder credibility if wrong' },
          evidence: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' } },
          investor_question: { type: 'string' },
        },
        required: ['claim', 'timestamp', 'verdict', 'severity', 'evidence', 'sources', 'investor_question'],
      },
    },
  },
  required: ['claims'],
};

/** chunk: "[MM:SS] Founder: …" lines. */
export async function factCheck(chunk: string): Promise<Claim[]> {
  const ai = textClient();
  const research = await ai.models.generateContent({
    model: MODELS.research,
    contents: chunk,
    config: {
      systemInstruction:
        FACT_CHECK_SYSTEM +
        '\nWrite your findings as a concise plain-text list. For each claim give its [MM:SS] timestamp, verdict, ' +
        'severity, evidence, source domains, and the investor question.',
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });
  const chunks = research.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const grounding = chunks.flatMap((c) => (c.web?.uri ? [{ title: c.web.title ?? '', uri: c.web.uri }] : []));

  const structured = await ai.models.generateContent({
    model: MODELS.fast,
    contents:
      'Convert these fact-check notes to JSON. Use source domains (e.g. sec.gov) for sources.\n' +
      `SOURCE DOMAINS: ${JSON.stringify(grounding.map((g) => g.title))}\nNOTES:\n${research.text ?? ''}`,
    config: { responseMimeType: 'application/json', responseJsonSchema: CLAIM_SCHEMA },
  });
  const claims = (JSON.parse(structured.text ?? '{"claims":[]}') as { claims: Omit<Claim, 'source_urls'>[] }).claims;
  return claims.map((c) => ({
    ...c,
    source_urls: grounding
      .filter((g) => g.title && c.sources.some((s) => g.title.includes(s) || s.includes(g.title)))
      .map((g) => g.uri),
  }));
}
