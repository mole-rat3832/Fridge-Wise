// Cloudflare Turnstile for Supabase Auth's built-in CAPTCHA support.
// Tokens are single-use: call reset() after every auth attempt, successful or not.
// When VITE_TURNSTILE_SITE_KEY is not set, nothing is rendered and no token is sent
// (enable CAPTCHA protection in Supabase only after adding the site key).
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { env } from '../lib/env';

export interface CaptchaHandle {
  reset: () => void;
}

export const captchaEnabled = Boolean(env.turnstileSiteKey);

export const Captcha = forwardRef<CaptchaHandle, { onToken: (token: string | null) => void }>(function Captcha({ onToken }, ref) {
  const widget = useRef<TurnstileInstance>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      onToken(null);
      widget.current?.reset();
    },
  }));

  if (!env.turnstileSiteKey) return null;
  return (
    <div className="min-h-[65px]">
      <Turnstile
        ref={widget}
        siteKey={env.turnstileSiteKey}
        onSuccess={(token) => onToken(token)}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
        options={{ theme: 'auto', size: 'flexible', refreshExpired: 'auto' }}
      />
    </div>
  );
});
