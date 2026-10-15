import { describe, expect, it } from 'vitest';
import { commandJsonSchema, productJsonSchema, receiptJsonSchema } from '../../supabase/functions/_shared/schemas';

/** Every place in a schema where one of `keywords` is used, as dotted paths. */
function find(schema: unknown, keywords: string[], path = '$'): string[] {
  if (!schema || typeof schema !== 'object') return [];
  if (Array.isArray(schema)) return schema.flatMap((s, i) => find(s, keywords, `${path}[${i}]`));
  return Object.entries(schema as Record<string, unknown>).flatMap(([key, value]) => {
    // Under "properties" the keys are field names, not keywords.
    if (key === 'properties') {
      return Object.entries(value as Record<string, unknown>).flatMap(([name, sub]) => find(sub, keywords, `${path}.${name}`));
    }
    return [...(keywords.includes(key) ? [`${path}.${key}`] : []), ...find(value, keywords, `${path}.${key}`)];
  });
}

describe('schemas sent to Gemini', () => {
  // Gemini rejected receipt scans and commands with "Request contains an invalid argument"
  // while these limits were in the schema. The code clamps confidences and Zod caps the lists.
  it.each([
    ['receipt', receiptJsonSchema],
    ['command', commandJsonSchema],
    ['product', productJsonSchema],
  ])('%s schema has no number bounds or list caps', (_name, schema) => {
    expect(find(schema, ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'maxItems', 'minItems'])).toEqual([]);
  });
});
