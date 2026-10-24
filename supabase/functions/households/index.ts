// households: the two household actions that need a CAPTCHA.
//
// POST { action: "create", name, captcha_token }                  -> { id, name, role }
// POST { action: "invite", household_id, email, captcha_token }   -> { status, email, invite_id? }
//
// 1. checks the caller's token (getUserContext),
// 2. checks the Turnstile CAPTCHA with Cloudflare (a token works once),
// 3. calls create_household / invite_to_household with the secret (service role) key, passing the
//    verified user id. Those two RPCs are closed to every other role, so the CAPTCHA cannot be
//    skipped by calling them directly. The RPCs check membership themselves.
//
// The response to an invite never says whether the email has an account. Every other household
// action (accept, decline, leave, remove, rename, delete) is a plain RPC called as the user.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { z } from 'npm:zod@4.6.7';
import { HttpError, json, readJson, serve } from '../_shared/http.ts';
import { getUserContext, readKey } from '../_shared/supabase.ts';
import { clientIp, verifyCaptcha } from '../_shared/turnstile.ts';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const token = z.string().min(1).max(2048);

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().trim().min(1).max(60), captcha_token: token }),
  z.object({
    action: z.literal('invite'),
    household_id: z.string().uuid(),
    email: z.string().trim().toLowerCase().max(254).regex(EMAIL),
    captcha_token: token,
  }),
]);

/** Database errors from the RPCs, as messages the app can show. */
function fromDatabase(error: { message: string; code?: string }): Error {
  if (error.code === '22023') return new HttpError(400, error.message, 'invalid');
  if (error.code === '42501') return new HttpError(403, error.message, 'forbidden');
  if (error.code === 'P0002') return new HttpError(404, error.message, 'not_found');
  return new Error(error.message);
}

serve(async (req) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const message = field === 'name'
      ? 'Give the household a name of 1 to 60 characters.'
      : field === 'email'
        ? 'Enter a valid email address.'
        : field === 'captcha_token'
          ? 'Please complete the CAPTCHA first.'
          : 'That request could not be read.';
    throw new HttpError(400, message, field === 'captcha_token' ? 'captcha_required' : 'bad_request');
  }
  const body = parsed.data;

  const { user } = await getUserContext(req);
  await verifyCaptcha(body.captcha_token, clientIp(req));

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  if (body.action === 'create') {
    const { data, error } = await admin.rpc('create_household', { p_user_id: user.id, p_name: body.name });
    if (error) throw fromDatabase(error);
    return json(req, data);
  }

  const { data, error } = await admin.rpc('invite_to_household', {
    p_user_id: user.id,
    p_household_id: body.household_id,
    p_email: body.email,
  });
  if (error) throw fromDatabase(error);
  return json(req, data);
});
