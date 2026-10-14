// HTTP helpers: CORS, JSON responses and one place that turns errors into friendly messages.
import { AiBlockedError, AiBusyError, AiConfigError, AiOutputError } from './gemini.ts';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'error',
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function allowedOrigin(req: Request): string {
  // Optional ALLOWED_ORIGINS secret: comma-separated list, e.g. "https://fridgewise.netlify.app".
  const list = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return '*';
  const origin = req.headers.get('Origin') ?? '';
  return list.includes(origin) ? origin : list[0];
}

export function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'The request body must be JSON.', 'bad_request');
  }
}

/** Map any error to a response the app can show. Never echoes secrets or stack traces. */
export function errorResponse(req: Request, err: unknown): Response {
  if (err instanceof HttpError) {
    return json(req, { error: err.message, code: err.code, ...err.extra }, err.status);
  }
  if (err instanceof AiConfigError) {
    console.error('AI config:', err.message);
    return json(req, { error: 'The AI features are not set up yet. Add GEMINI_API_KEY and GEMINI_MODEL as edge function secrets.', code: 'ai_not_configured' }, 503);
  }
  if (err instanceof AiBusyError) {
    return json(req, { error: 'The AI service is busy. Please try again in a minute.', code: 'ai_busy' }, 503);
  }
  if (err instanceof AiBlockedError) {
    return json(req, { error: 'The AI could not process this request.', code: 'ai_blocked' }, 422);
  }
  if (err instanceof AiOutputError) {
    console.error('AI output:', err.message);
    return json(req, { error: 'The AI answer could not be read. Please try again.', code: 'ai_invalid_output' }, 502);
  }
  if (err instanceof DOMException && err.name === 'TimeoutError') {
    return json(req, { error: 'The AI took too long to answer. Please try again.', code: 'ai_timeout' }, 504);
  }
  console.error('Unexpected error:', err instanceof Error ? err.message : err);
  return json(req, { error: 'Something went wrong. Please try again.', code: 'internal' }, 500);
}

export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
    if (req.method !== 'POST') return json(req, { error: 'Use POST.', code: 'method_not_allowed' }, 405);
    try {
      return await handler(req);
    } catch (err) {
      return errorResponse(req, err);
    }
  });
}
