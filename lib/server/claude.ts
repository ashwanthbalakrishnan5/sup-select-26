// Claude for structured, reasoning-heavy text work (the post-interview report). Server-only.
// Model: claude-sonnet-5-5 (override with REPORT_MODEL). Server-side refusal fallback is on ("default" routing).
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { toClaudeSchema } from '@/lib/agents/claude-schema';

let client: Anthropic | null = null;
export const claudeEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export const getClaude = () => (client ??= new Anthropic());
export { toClaudeSchema };

/** One structured JSON response from Claude. Throws on refusal / truncation so callers can fall back. */
export async function claudeJson<T>(opts: { system: string; content: string; schema: object; maxTokens?: number }): Promise<T> {
  const res = await getClaude().beta.messages.create({
    model: process.env.REPORT_MODEL ?? 'claude-sonnet-5-5',
    max_tokens: opts.maxTokens ?? 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: opts.system,
    messages: [{ role: 'user', content: opts.content }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: toClaudeSchema(opts.schema) as Record<string, unknown> } },
  });
  if (res.stop_reason === 'refusal') throw new Error('Claude declined to write this report');
  if (res.stop_reason === 'max_tokens') throw new Error('Report was cut off (max_tokens)');
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  return JSON.parse(text) as T;
}
