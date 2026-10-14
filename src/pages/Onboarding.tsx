import { Bell, Check, Sparkles, Users } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/AppShell';
import { ErrorNote, Spinner } from '../components/ui';
import { errorMessage, loadDemoData } from '../lib/api';
import { browserTimeZone } from '../lib/dates';
import { isDemoAccount } from '../lib/demo';
import { enablePush, pushSupport } from '../lib/push';
import { useAuth } from '../state/auth';
import { useItems } from '../state/items';

export function Onboarding() {
  const { profile, updateProfile, user } = useAuth();
  const demoAccount = isDemoAccount(user);
  const { refresh } = useItems();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [household, setHousehold] = useState(profile?.household_size ?? 1);
  const [days, setDays] = useState(profile?.reminder_days_before ?? 2);
  const [pushState, setPushState] = useState<'idle' | 'on' | 'busy'>('idle');
  const [demo, setDemo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const support = pushSupport();

  async function turnOnPush() {
    setPushState('busy');
    setError(null);
    try {
      await enablePush();
      await updateProfile({ notify_push: true });
      setPushState('on');
    } catch (err) {
      setError(errorMessage(err));
      setPushState('idle');
    }
  }

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      await updateProfile({
        household_size: household,
        reminder_days_before: days,
        timezone: browserTimeZone(),
        locale: navigator.language || 'en-US',
        onboarded_at: new Date().toISOString(),
      });
      if (demoAccount && demo) await loadDemoData();
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setFinishing(false);
    }
  }

  const steps = [
    {
      icon: <Users size={28} aria-hidden />,
      title: 'Who are you shopping for?',
      body: (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Household size">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={household === n} aria-pressed={household === n} className="chip min-w-14 justify-center" onClick={() => setHousehold(n)}>
              {n === 6 ? '6+' : n}
            </button>
          ))}
          <p className="w-full text-sm text-fg-2">Recipe ideas are sized for your household.</p>
        </div>
      ),
    },
    {
      icon: <Bell size={28} aria-hidden />,
      title: 'When should we remind you?',
      body: (
        <div className="space-y-2" role="radiogroup" aria-label="Reminder timing">
          {[0, 1, 2, 3].map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={days === d}
              onClick={() => setDays(d)}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left font-semibold ${days === d ? 'border-fg bg-tint' : 'border-line'}`}
            >
              {d === 0 ? 'On the day it expires' : `${d} day${d === 1 ? '' : 's'} before`}
              {days === d && <Check size={18} aria-hidden />}
            </button>
          ))}
          <p className="text-sm text-fg-2">Times use your timezone: {browserTimeZone().replace(/_/g, ' ')}.</p>
        </div>
      ),
    },
    {
      icon: <Bell size={28} aria-hidden />,
      title: 'Turn on notifications',
      body: (
        <div className="space-y-3">
          <p className="text-fg-2">Get one reminder in the morning when food is about to expire.</p>
          {support === 'needs-install' ? (
            <p className="rounded-xl bg-tint p-3 text-sm">
              On iPhone and iPad (iOS 16.4 or later), add FridgeWise to your Home Screen first: tap Share, then “Add to Home Screen”. Open the installed app and turn on
              notifications in Settings.
            </p>
          ) : support === 'supported' ? (
            <button type="button" className="btn btn-primary" onClick={() => void turnOnPush()} disabled={pushState !== 'idle'}>
              {pushState === 'busy' ? <Spinner /> : pushState === 'on' ? <Check size={18} aria-hidden /> : <Bell size={18} aria-hidden />}
              {pushState === 'on' ? 'Notifications on' : 'Turn on notifications'}
            </button>
          ) : (
            <p className="text-sm text-fg-2">This browser doesn't support notifications.</p>
          )}
          <p className="text-sm text-fg-2">You can change this any time in Settings.</p>
        </div>
      ),
    },
    {
      icon: <Sparkles size={28} aria-hidden />,
      title: 'Ready to go',
      body: demoAccount ? (
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-leaf" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            <span>
              <span className="font-semibold">Start with demo data</span>
              <span className="block text-sm text-fg-2">About 20 sample items so you can try every feature. Remove them any time in Settings.</span>
            </span>
          </label>
        </div>
      ) : (
        <p className="text-fg-2">Scan a grocery receipt or add a few items to get started. Everything you add is private to your account.</p>
      ),
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo size={44} />
        </div>
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-fg-2">{current.icon}</span>
            <span className="text-sm font-semibold text-fg-2">
              Step {step + 1} of {steps.length}
            </span>
          </div>
          <h1 className="mb-4 text-xl font-bold">{current.title}</h1>
          {current.body}
          {error && (
            <div className="mt-4">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          <div className="mt-6 flex justify-between gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || finishing}>
              Back
            </button>
            {last ? (
              <button type="button" className="btn btn-primary" onClick={() => void finish()} disabled={finishing}>
                {finishing ? <Spinner label="Setting up" /> : 'Start using FridgeWise'}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
                {step === 2 && pushState !== 'on' ? 'Skip for now' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
