// Adapts a shared JSON schema (also used with Gemini) to the subset Claude structured outputs accept.
// Pure: imported by the Next server and by the Supabase Compute worker bundle.

/**
 * Structured outputs don't support numeric/length/array-size constraints and require additionalProperties:false on
 * every object — strip them, keeping numeric ranges as an instruction in the description.
 */
export function toClaudeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toClaudeSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  const n = node as Record<string, unknown>;
  const range =
    n.minimum !== undefined || n.maximum !== undefined
      ? `Integer from ${n.minimum ?? '-∞'} to ${n.maximum ?? '∞'}.`
      : n.minItems !== undefined && n.minItems === n.maxItems
        ? `Exactly ${n.minItems} items.`
        : '';
  for (const [k, v] of Object.entries(node)) {
    if (['minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength', 'multipleOf'].includes(k)) continue;
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v as object).map(([p, s]) => [p, toClaudeSchema(s)])) : toClaudeSchema(v);
  }
  if (range) out.description = [out.description, range].filter(Boolean).join(' ');
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}
