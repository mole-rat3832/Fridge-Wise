import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AiConfigError, AiOutputError, generateJson, simplifySchema } from '../../supabase/functions/_shared/gemini';

const schema = {
  type: 'object',
  properties: {
    op: { type: 'string', enum: ['a', 'b'], description: 'What to do.' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    list: { type: 'array', maxItems: 3, items: { type: 'string' } },
    // A property that happens to share its name with a schema keyword must survive.
    format: { type: 'string' },
  },
  required: ['op', 'confidence', 'list', 'format'],
};
const Out = z.object({ op: z.enum(['a', 'b']), confidence: z.number(), list: z.array(z.string()).max(3), format: z.string() });
const good = { op: 'a', confidence: 0.9, list: ['x'], format: 'f' };

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const ok = () => reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(good) }] }, finishReason: 'STOP' }] });
const invalid = () =>
  reply(400, {
    error: {
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: 'Request contains an invalid argument.',
      details: [{ fieldViolations: [{ field: 'generation_config.response_schema' }] }],
    },
  });

describe('simplifySchema', () => {
  it('drops strict keywords, folds enums into the description and keeps property names', () => {
    const s = simplifySchema(schema) as { properties: Record<string, Record<string, unknown>>; required: string[] };
    expect(s.properties.op.enum).toBeUndefined();
    expect(s.properties.op.description).toBe('What to do. One of: "a", "b".');
    expect(s.properties.confidence).toEqual({ type: 'number' });
    expect(s.properties.list).toEqual({ type: 'array', items: { type: 'string' } });
    expect(s.properties.format).toEqual({ type: 'string' });
    expect(s.required).toEqual(['op', 'confidence', 'list', 'format']);
  });
});

describe('generateJson fallbacks', () => {
  let bodies: Array<Record<string, any>>;
  beforeEach(() => {
    bodies = [];
    vi.stubGlobal('Deno', { env: { get: (k: string) => ({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-3.8-flash' })[k] } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function respond(...responses: Array<() => Response>) {
    const queue = [...responses];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return (queue.shift() ?? ok)();
      }),
    );
  }
  const run = () => generateJson({ system: 'sys', parts: [{ text: 'hi' }], jsonSchema: schema, zod: Out });

  it('uses responseFormat first and needs nothing else when it works', async () => {
    respond(ok);
    const r = await run();
    expect(r.data).toEqual(good);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].generationConfig.responseFormat.text.schema).toEqual(schema);
  });

  it('steps down through legacy and simplified schemas when Google rejects the request', async () => {
    respond(invalid, invalid, ok);
    const r = await run();
    expect(r.data).toEqual(good);
    expect(r.attempts).toBe(3);
    expect(bodies[1].generationConfig.responseJsonSchema).toEqual(schema);
    expect(bodies[1].generationConfig.thinkingConfig).toBeUndefined();
    expect(bodies[2].generationConfig.responseJsonSchema.properties.op.enum).toBeUndefined();
  });

  it('falls back to plain JSON mode with the schema in the prompt as a last resort', async () => {
    respond(invalid, invalid, invalid, ok);
    const r = await run();
    expect(r.data).toEqual(good);
    const last = bodies[3];
    expect(last.generationConfig.responseJsonSchema).toBeUndefined();
    expect(last.generationConfig.responseMimeType).toBe('application/json');
    expect(last.contents[0].parts.at(-1).text).toContain('"enum":["a","b"]');
  });

  it('keeps the more forgiving mode for the retry after an invalid answer', async () => {
    const bad = () => reply(200, { candidates: [{ content: { parts: [{ text: '{"op":"zzz"}' }] } }] });
    respond(invalid, bad, ok);
    const r = await run();
    expect(r.data).toEqual(good);
    expect(bodies[2].generationConfig.responseJsonSchema).toEqual(schema);
    expect(bodies[2].contents[0].parts.at(-1).text).toMatch(/previous answer was rejected/);
  });

  it('reports a rejected API key as a configuration problem', async () => {
    respond(() => reply(400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid. Please pass a valid API key.' } }));
    await expect(run()).rejects.toBeInstanceOf(AiConfigError);
  });

  it("includes Google's reason when every mode is rejected", async () => {
    respond(invalid, invalid, invalid, invalid);
    const err = await run().catch((e) => e);
    expect(err).toBeInstanceOf(AiOutputError);
    expect(err.message).toContain('INVALID_ARGUMENT');
    expect(err.message).toContain('generation_config.response_schema');
    expect(bodies).toHaveLength(4);
  });
});
