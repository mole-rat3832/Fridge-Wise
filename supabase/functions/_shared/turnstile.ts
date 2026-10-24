// Server-side Cloudflare Turnstile check for actions that need a CAPTCHA (creating a household,
// inviting someone). Supabase Auth checks the sign-in CAPTCHA itself; these tokens are checked here.
//
// TURNSTILE_SECRET_KEY is an edge function secret: the same Turnstile secret key that is entered in
// Supabase Auth's bot protection settings. Without it, the actions refuse to run (fail closed).
import { HttpError } from './http.ts';

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** The verify URL. TURNSTILE_VERIFY_URL (a local stub) is only honoured on a local Supabase stack. */
function verifyUrl(): string {
  const override = Deno.env.get('TURNSTILE_VERIFY_URL')?.trim();
  const local = /^http:\/\/(kong|localhost|127\.0\.0\.1|host\.docker\.internal)(:\d+)?(\/|$)/.test(Deno.env.get('SUPABASE_URL') ?? '');
  return override && local ? override : SITEVERIFY;
}

/** The visitor's IP from the proxy headers, passed to Turnstile as an extra signal. */
export function clientIp(req: Request): string | null {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  return /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : null;
}

export async function verifyCaptcha(token: string, remoteIp: string | null): Promise<void> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')?.trim();
  if (!secret) {
    console.error('Households: TURNSTILE_SECRET_KEY is not set, so CAPTCHA-protected actions are refused.');
    throw new HttpError(503, 'Households are not set up yet. Please try again later.', 'captcha_not_configured');
  }
  if (!token || token.length > 2048) {
    throw new HttpError(400, 'Please complete the CAPTCHA first.', 'captcha_required');
  }

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);

  let result: { success?: boolean; 'error-codes'?: string[] };
  try {
    const res = await fetch(verifyUrl(), { method: 'POST', body: form, signal: AbortSignal.timeout(10_000) });
    result = await res.json();
  } catch (err) {
    console.error('Turnstile check failed:', err instanceof Error ? err.message : String(err));
    throw new HttpError(503, 'The CAPTCHA could not be checked right now. Please try again.', 'captcha_unavailable');
  }
  if (result.success !== true) {
    console.warn('Turnstile rejected a token:', (result['error-codes'] ?? []).join(', ') || 'no reason given');
    throw new HttpError(400, 'The CAPTCHA expired or did not pass. Please complete it again.', 'captcha_failed');
  }
}
