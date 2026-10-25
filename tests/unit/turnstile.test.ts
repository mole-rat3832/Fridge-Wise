import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../supabase/functions/_shared/http';
import { clientIp, verifyCaptcha } from '../../supabase/functions/_shared/turnstile';

let envVars: Record<string, string>;
let calls: Array<{ url: string; form: FormData }>;

function respond(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, form: init.body as FormData });
      if (!ok) throw new TypeError('network down');
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

async function failure(promise: Promise<unknown>): Promise<HttpError> {
  const err = await promise.catch((e) => e);
  expect(err).toBeInstanceOf(HttpError);
  return err as HttpError;
}

beforeEach(() => {
  calls = [];
  envVars = { TURNSTILE_SECRET_KEY: 'secret-from-env', SUPABASE_URL: 'https://abc.supabase.co' };
  vi.stubGlobal('Deno', { env: { get: (k: string) => envVars[k] } });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('verifyCaptcha', () => {
  it('refuses to run without the secret key (fails closed)', async () => {
    delete envVars.TURNSTILE_SECRET_KEY;
    respond({ success: true });
    const err = await failure(verifyCaptcha('token', null));
    expect(err.status).toBe(503);
    expect(err.code).toBe('captcha_not_configured');
    expect(calls).toHaveLength(0);
  });

  it('asks for a CAPTCHA when the token is missing', async () => {
    respond({ success: true });
    const err = await failure(verifyCaptcha('', null));
    expect(err.code).toBe('captcha_required');
    expect(calls).toHaveLength(0);
  });

  it('passes a token Cloudflare accepts, sending the secret, token and IP', async () => {
    respond({ success: true });
    await expect(verifyCaptcha('good-token', '203.0.113.7')).resolves.toBeUndefined();
    expect(calls[0].url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(calls[0].form.get('secret')).toBe('secret-from-env');
    expect(calls[0].form.get('response')).toBe('good-token');
    expect(calls[0].form.get('remoteip')).toBe('203.0.113.7');
  });

  it('rejects a token Cloudflare refuses', async () => {
    respond({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    const err = await failure(verifyCaptcha('used-token', null));
    expect(err.status).toBe(400);
    expect(err.code).toBe('captcha_failed');
  });

  it('treats an unreachable Cloudflare as unavailable, not as a pass', async () => {
    respond({}, false);
    const err = await failure(verifyCaptcha('token', null));
    expect(err.status).toBe(503);
    expect(err.code).toBe('captcha_unavailable');
  });

  it('ignores TURNSTILE_VERIFY_URL outside a local stack', async () => {
    envVars.TURNSTILE_VERIFY_URL = 'http://evil.example/siteverify';
    respond({ success: true });
    await verifyCaptcha('token', null);
    expect(calls[0].url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
  });

  it('uses TURNSTILE_VERIFY_URL on a local stack (for the test stub)', async () => {
    envVars.SUPABASE_URL = 'http://kong:8000';
    envVars.TURNSTILE_VERIFY_URL = 'http://host.docker.internal:8787/turnstile/v0/siteverify';
    respond({ success: true });
    await verifyCaptcha('token', null);
    expect(calls[0].url).toBe('http://host.docker.internal:8787/turnstile/v0/siteverify');
  });
});

describe('clientIp', () => {
  it('takes the first forwarded address and ignores anything that is not an IP', () => {
    expect(clientIp(new Request('https://x', { headers: { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' } }))).toBe('198.51.100.4');
    expect(clientIp(new Request('https://x', { headers: { 'x-forwarded-for': '2001:db8::1' } }))).toBe('2001:db8::1');
    expect(clientIp(new Request('https://x', { headers: { 'x-forwarded-for': '<script>' } }))).toBeNull();
    expect(clientIp(new Request('https://x'))).toBeNull();
  });
});
