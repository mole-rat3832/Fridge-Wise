import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/AppShell';
import { Captcha, captchaEnabled, type CaptchaHandle } from '../components/Captcha';
import { ErrorNote, Spinner } from '../components/ui';
import { browserTimeZone } from '../lib/dates';
import { supabase } from '../lib/supabase';

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size={48} />
        </div>
        <div className="card p-6 shadow-sm">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-fg-2">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-fg-2">{footer}</div>}
      </div>
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-12"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        minLength={8}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-fg-2"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('captcha')) return 'The security check failed or expired. Please complete it again.';
  if (m.includes('invalid login')) return 'That email and password do not match.';
  if (m.includes('email not confirmed')) return 'Please confirm your email first. Check your inbox for the link.';
  if (m.includes('already registered')) return 'An account with this email already exists. Try signing in.';
  if (m.includes('rate limit')) return 'Too many attempts. Please wait a minute and try again.';
  return message;
}


export function SignIn() {
  const navigate = useNavigate();
  const captchaRef = useRef<CaptchaHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaReady = !captchaEnabled || Boolean(captchaToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: captchaToken ?? undefined },
    });
    captchaRef.current?.reset();
    setBusy(false);
    if (err) setError(friendlyAuthError(err.message));
    else navigate('/', { replace: true });
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to see what's in your kitchen."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-semibold text-fg underline underline-offset-2">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">
              Password
            </label>
            <Link to="/forgot-password" className="mb-1 text-sm font-semibold text-fg-2 underline underline-offset-2">
              Forgot?
            </Link>
          </div>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </div>
        <Captcha ref={captchaRef} onToken={setCaptchaToken} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !captchaReady}>
          {busy ? <Spinner label="Signing in" /> : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}

export function SignUp() {
  const captchaRef = useRef<CaptchaHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaReady = !captchaEnabled || Boolean(captchaToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        captchaToken: captchaToken ?? undefined,
        data: { display_name: name.trim() || null, timezone: browserTimeZone() },
      },
    });
    captchaRef.current?.reset();
    setBusy(false);
    if (err) setError(friendlyAuthError(err.message));
    else if (data.session) navigate('/onboarding', { replace: true });
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout title="Check your email" footer={<Link to="/signin" className="font-semibold text-fg underline underline-offset-2">Back to sign in</Link>}>
        <div className="flex items-start gap-3">
          <MailCheck className="mt-0.5 shrink-0" aria-hidden />
          <p>
            We sent a confirmation link to <strong>{email}</strong>. Open it on this device to finish creating your account.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Track your food, get reminders, and waste less."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/signin" className="font-semibold text-fg underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="name">
            Your name <span className="font-normal">(optional)</span>
          </label>
          <input id="name" className="input" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
          <p className="mt-1 text-xs text-fg-2">At least 8 characters.</p>
        </div>
        <Captcha ref={captchaRef} onToken={setCaptchaToken} />
        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !captchaReady}>
          {busy ? <Spinner label="Creating account" /> : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const captchaRef = useRef<CaptchaHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaReady = !captchaEnabled || Boolean(captchaToken);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
      captchaToken: captchaToken ?? undefined,
    });
    captchaRef.current?.reset();
    setBusy(false);
    if (err) setError(friendlyAuthError(err.message));
    else setSent(true);
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={sent ? undefined : "We'll email you a link to choose a new password."}
      footer={
        <Link to="/signin" className="font-semibold text-fg underline underline-offset-2">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex items-start gap-3">
          <MailCheck className="mt-0.5 shrink-0" aria-hidden />
          <p>If an account exists for {email}, a reset link is on its way. It works once and expires after an hour.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Captcha ref={captchaRef} onToken={setCaptchaToken} />
          {error && <ErrorNote>{error}</ErrorNote>}
          <button type="submit" className="btn btn-primary w-full" disabled={busy || !captchaReady}>
            {busy ? <Spinner label="Sending" /> : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

/** Landing page of the reset email. The Supabase client exchanges the link for a session. */
export function ResetPassword({ hasSession }: { hasSession: boolean }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(friendlyAuthError(err.message));
    else navigate('/', { replace: true });
  }

  return (
    <AuthLayout title="Choose a new password">
      {hasSession ? (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="password">
              New password
            </label>
            <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" />
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button type="submit" className="btn btn-primary w-full" disabled={busy || password.length < 8}>
            {busy ? <Spinner label="Saving" /> : 'Save password'}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-fg-2">This reset link is invalid or has expired.</p>
          <Link to="/forgot-password" className="btn btn-primary w-full">
            Send a new link
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
