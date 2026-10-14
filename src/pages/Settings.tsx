import {
  Accessibility,
  BookOpen,
  Bell,
  Check,
  CircleHelp,
  Compass,
  Settings as SettingsIcon,
  Contrast,
  Database,
  Download,
  Gauge,
  Globe,
  Info,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Sparkles,
  Square,
  SquareRoundCorner,
  Sun,
  Trash,
  Type,
  UserRound,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTour } from '../components/Tour';
import { UsageMeter } from '../components/UsageMeter';
import { ErrorNote, PageHeader, Sheet, Spinner, Toggle } from '../components/ui';
import { useOnline } from '../hooks/useOnline';
import { clearDemoData, deleteMyAccount, errorMessage, loadDemoData } from '../lib/api';
import { isDemoAccount } from '../lib/demo';
import { toCsv, downloadFile } from '../lib/csv';
import { browserTimeZone, supportedTimeZones } from '../lib/dates';
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupport, testNotification } from '../lib/push';
import { supabase } from '../lib/supabase';
import { ACCENTS, getAppearance, setAppearance, type Appearance } from '../lib/theme';
import { useAuth } from '../state/auth';
import { useItems } from '../state/items';
import { useToast } from '../state/toast';

const LOCALES = [
  ['en-US', 'English (US) · 03/04 = March 4'],
  ['en-GB', 'English (UK) · 03/04 = 3 April'],
  ['en-CA', 'English (Canada)'],
  ['en-AU', 'English (Australia)'],
  ['es-ES', 'Español'],
  ['fr-FR', 'Français'],
  ['de-DE', 'Deutsch'],
  ['ko-KR', '한국어'],
  ['ja-JP', '日本語'],
] as const;

function ChoiceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold">
        {icon}
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function Settings() {
  const { user, profile, updateProfile, signOut, timeZone } = useAuth();
  const { refresh } = useItems();
  const toast = useToast();
  const navigate = useNavigate();
  const online = useOnline();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [household, setHousehold] = useState(String(profile?.household_size ?? 1));
  const [look, setLook] = useState<Appearance>(getAppearance());
  const updateLook = (patch: Partial<Appearance>) => setLook(setAppearance(patch));
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const support = pushSupport();
  const tour = useTour();

  useEffect(() => {
    void currentSubscription().then((s) => setPushOn(Boolean(s) && Boolean(profile?.notify_push)));
  }, [profile?.notify_push]);

  async function save(patch: Parameters<typeof updateProfile>[0], message = 'Saved.') {
    try {
      await updateProfile(patch);
      toast.show(message, { tone: 'success' });
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    }
  }

  async function togglePush(next: boolean) {
    setPushBusy(true);
    setPushError(null);
    try {
      if (next) {
        await enablePush();
        await updateProfile({ notify_push: true });
        setPushOn(true);
        toast.show('Reminders are on.', { tone: 'success' });
      } else {
        await disablePush();
        await updateProfile({ notify_push: false });
        setPushOn(false);
      }
    } catch (err) {
      setPushError(errorMessage(err));
    } finally {
      setPushBusy(false);
    }
  }

  async function exportItems() {
    setBusy('export-items');
    const { data, error } = await supabase.from('food_items').select('*').order('created_at');
    setBusy(null);
    if (error) return toast.show(error.message, { tone: 'error' });
    const cols = ['name', 'brand', 'category', 'storage_location', 'quantity', 'unit', 'status', 'purchase_date', 'expiration_date', 'expiration_source', 'opened_at', 'price_cents', 'barcode', 'notes', 'consumed_at', 'wasted_at', 'created_at', 'updated_at', 'id'];
    downloadFile(`fridgewise-items-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data ?? [], cols));
  }

  async function exportHistory() {
    setBusy('export-history');
    const { data, error } = await supabase.from('ai_edit_log').select('*').order('created_at').limit(10000);
    setBusy(null);
    if (error) return toast.show(error.message, { tone: 'error' });
    const cols = ['created_at', 'source', 'action', 'field', 'old_value', 'new_value', 'confidence', 'model', 'reason', 'reverted_at', 'food_item_id', 'scan_id', 'batch_id'];
    downloadFile(`fridgewise-history-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data ?? [], cols));
  }

  async function demo(load: boolean) {
    setBusy(load ? 'demo' : 'clear-demo');
    try {
      if (load) {
        const r = await loadDemoData();
        toast.show(`Loaded ${r.active_items} demo items and ${r.history_items} history items.`, { tone: 'success' });
      } else {
        const n = await clearDemoData();
        toast.show(`Removed ${n} demo items.`, { tone: 'success' });
      }
      await refresh();
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    if (!user) return;
    setBusy('delete');
    try {
      // Storage objects must be removed through the Storage API before the account goes.
      for (;;) {
        const { data } = await supabase.storage.from('scans').list(user.id, { limit: 100 });
        if (!data || data.length === 0) break;
        const { error } = await supabase.storage.from('scans').remove(data.map((f) => `${user.id}/${f.name}`));
        if (error) throw new Error(error.message);
      }
      await disablePush().catch(() => undefined);
      await deleteMyAccount();
      try {
        localStorage.removeItem(`fw-items:${user.id}`);
      } catch {
        /* ignore */
      }
      await supabase.auth.signOut({ scope: 'local' });
      navigate('/signin', { replace: true });
    } catch (err) {
      setBusy(null);
      toast.show(errorMessage(err), { tone: 'error' });
    }
  }

  const zones = supportedTimeZones();
  const locale = profile?.locale ?? 'en-US';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Settings" icon={<SettingsIcon size={24} />} />

      <Section icon={<UserRound size={20} aria-hidden />} title="Profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-name">
              Name
            </label>
            <input id="s-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={() => name !== (profile?.display_name ?? '') && void save({ display_name: name.trim() || null })} />
          </div>
          <div>
            <label className="label" htmlFor="s-household">
              People in your household
            </label>
            <select
              id="s-household"
              className="input"
              value={household}
              onChange={(e) => {
                setHousehold(e.target.value);
                void save({ household_size: Number(e.target.value) });
              }}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section icon={<Bell size={20} aria-hidden data-anim="ring" />} title="Reminders">
        <div>
          <label className="label" htmlFor="s-days">
            Remind me before food expires
          </label>
          <select id="s-days" className="input sm:w-64" value={profile?.reminder_days_before ?? 2} onChange={(e) => void save({ reminder_days_before: Number(e.target.value) })}>
            <option value={0}>On the day it expires</option>
            {[1, 2, 3, 4, 5, 7].map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? '' : 's'} before
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-fg-2">Also sets what counts as “use soon” on your dashboard.</p>
        </div>
        <Toggle
          label="Push notifications"
          description={
            support === 'needs-install'
              ? 'On iPhone and iPad, push works only after you add FridgeWise to your Home Screen (Share → Add to Home Screen) on iOS 16.4 or later. Then open the installed app and turn this on.'
              : support === 'unsupported'
                ? "This browser doesn't support push notifications."
                : 'One grouped reminder in the morning (your time) when food is about to expire.'
          }
          checked={pushOn}
          disabled={pushBusy || support !== 'supported' || !online}
          onChange={(v) => void togglePush(v)}
        />
        {isIOS() && isStandalone() && <p className="text-sm text-fg-2">You're using the installed app, so notifications can work here.</p>}
        {pushError && <ErrorNote>{pushError}</ErrorNote>}
        {pushOn && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void testNotification().catch((e) => setPushError(errorMessage(e)))}>
            Send a test notification
          </button>
        )}
        <p className="text-sm text-fg-2">Email reminders are not available yet.</p>
      </Section>

      <Section icon={<Globe size={20} aria-hidden />} title="Region">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-tz">
              Timezone
            </label>
            <select id="s-tz" className="input" value={timeZone} onChange={(e) => void save({ timezone: e.target.value }, 'Timezone updated.')}>
              {!zones.includes(timeZone) && <option value={timeZone}>{timeZone}</option>}
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            {timeZone !== browserTimeZone() && (
              <button type="button" className="mt-1 text-sm font-semibold underline underline-offset-2" onClick={() => void save({ timezone: browserTimeZone() }, 'Timezone updated.')}>
                Use this device's timezone ({browserTimeZone()})
              </button>
            )}
          </div>
          <div>
            <label className="label" htmlFor="s-locale">
              Date format for reading labels
            </label>
            <select id="s-locale" className="input" value={locale} onChange={(e) => void save({ locale: e.target.value })}>
              {!LOCALES.some(([l]) => l === locale) && <option value={locale}>{locale}</option>}
              {LOCALES.map(([l, label]) => (
                <option key={l} value={l}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-fg-2">Used when a printed date like 03/04 could mean two things.</p>
          </div>
        </div>
      </Section>

      <Section icon={<Palette size={20} aria-hidden data-anim="wiggle" />} title="Appearance">
        <ChoiceRow label="Theme">
          {(
            [
              ['system', 'Match device', Monitor, 'pop'],
              ['light', 'Light', Sun, 'spin'],
              ['dark', 'Dark', Moon, 'wiggle'],
            ] as const
          ).map(([t, label, Icon, anim]) => (
            <button key={t} type="button" role="radio" aria-checked={look.theme === t} aria-pressed={look.theme === t} className="chip" onClick={() => updateLook({ theme: t })}>
              <Icon size={16} aria-hidden data-anim={anim} /> {label}
            </button>
          ))}
        </ChoiceRow>

        <ChoiceRow label="Accent color">
          {ACCENTS.map((a) => {
            const selected = look.accent === a.id;
            const onDark = a.id === 'steel' || a.id === 'slate';
            return (
              <button
                key={a.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={a.label}
                title={a.label}
                onClick={() => updateLook({ accent: a.id })}
                className={`relative flex h-11 w-11 items-center justify-center rounded-full border transition-transform hover:scale-110 active:scale-95 ${
                  selected ? 'border-fg ring-2 ring-fg ring-offset-2 ring-offset-surface' : 'border-line'
                }`}
                style={{ backgroundColor: isDark ? a.dark : a.light }}
              >
                {selected && <Check size={18} strokeWidth={3} className={`animate-pop ${onDark ? 'text-white' : 'text-ink'}`} aria-hidden />}
              </button>
            );
          })}
        </ChoiceRow>

        <ChoiceRow label="Text size">
          {(
            [
              ['default', 'Default', 14],
              ['large', 'Large', 17],
              ['xl', 'Extra large', 20],
            ] as const
          ).map(([t, label, size]) => (
            <button key={t} type="button" role="radio" aria-checked={look.text === t} aria-pressed={look.text === t} className="chip" onClick={() => updateLook({ text: t })}>
              <Type size={size} aria-hidden data-anim="bounce" /> {label}
            </button>
          ))}
        </ChoiceRow>

        <ChoiceRow label="Corners">
          {(
            [
              ['rounded', 'Rounded', SquareRoundCorner],
              ['square', 'Square', Square],
            ] as const
          ).map(([t, label, Icon]) => (
            <button key={t} type="button" role="radio" aria-checked={look.corners === t} aria-pressed={look.corners === t} className="chip" onClick={() => updateLook({ corners: t })}>
              <Icon size={16} aria-hidden data-anim="pop" /> {label}
            </button>
          ))}
        </ChoiceRow>

        <Toggle
          checked={look.contrast === 'high'}
          onChange={(on) => updateLook({ contrast: on ? 'high' : 'standard' })}
          label="High contrast"
          description={
            <span className="inline-flex items-center gap-1">
              <Contrast size={14} aria-hidden /> Darker text and stronger borders.
            </span>
          }
        />
        <Toggle
          checked={look.motion === 'reduce'}
          onChange={(on) => updateLook({ motion: on ? 'reduce' : 'system' })}
          label="Reduce motion"
          description={
            <span className="inline-flex items-center gap-1">
              <Accessibility size={14} aria-hidden /> Turns off animations. Your device's reduce-motion setting is always respected.
            </span>
          }
        />

        <div className="rounded-2xl border border-dashed border-line p-4" aria-label="Preview">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-fg-2">Preview</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="btn btn-primary pointer-events-none">
              <Sparkles size={18} aria-hidden data-anim="pop" /> Generate ideas
            </span>
            <span className="chip" aria-pressed="true">
              Fridge
            </span>
            <span className="badge badge-yellow">Use soon</span>
            <span className="badge badge-green">Fresh</span>
          </div>
        </div>
      </Section>

      <Section icon={<Gauge size={20} aria-hidden />} title="Daily AI limits">
        <UsageMeter />
      </Section>

      <Section icon={<CircleHelp size={20} aria-hidden data-anim="wiggle" />} title="Help">
        <div className="flex flex-wrap gap-2">
          {tour && (
            <button type="button" className="btn btn-primary" onClick={() => tour.start()}>
              <Compass size={18} aria-hidden data-anim="spin" /> Take the tour
            </button>
          )}
          <Link to="/guide" className="btn btn-secondary">
            <BookOpen size={18} aria-hidden data-anim="wiggle" /> How to use FridgeWise
          </Link>
          <Link to="/about" className="btn btn-secondary">
            <Info size={18} aria-hidden data-anim="pop" /> About FridgeWise
          </Link>
        </div>
      </Section>

      <Section icon={<Database size={20} aria-hidden />} title="Your data">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => void exportItems()} disabled={busy !== null || !online}>
            {busy === 'export-items' ? <Spinner /> : <Download size={18} aria-hidden data-anim="drop" />} Export items (CSV)
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void exportHistory()} disabled={busy !== null || !online}>
            {busy === 'export-history' ? <Spinner /> : <Download size={18} aria-hidden data-anim="drop" />} Export history (CSV)
          </button>
        </div>
        {isDemoAccount(user) && (
          <div className="rounded-xl bg-tint p-4">
            <p className="font-semibold">Demo mode</p>
            <p className="mt-1 text-sm text-fg-2">This is a demo account. Reload about 20 realistic items with mixed expiration dates, plus a few weeks of history for Stats.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={() => void demo(true)} disabled={busy !== null || !online}>
                {busy === 'demo' ? <Spinner /> : <Sparkles size={18} aria-hidden data-anim="pop" />} Load demo data
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void demo(false)} disabled={busy !== null || !online}>
                Remove demo data
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section icon={<UserRound size={20} aria-hidden />} title="Account">
        <p className="text-sm text-fg-2">Signed in as {user?.email}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
            <LogOut size={18} aria-hidden data-anim="nudge" /> Sign out
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)} disabled={!online}>
            <Trash size={18} aria-hidden data-anim="wiggle" /> Delete account
          </button>
        </div>
      </Section>

      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" disabled={deleteText !== 'DELETE' || busy === 'delete'} onClick={() => void deleteAccount()}>
              {busy === 'delete' ? <Spinner label="Deleting" /> : 'Delete forever'}
            </button>
          </>
        }
      >
        <p>This permanently deletes your account, all your food items, history, recipes, scan photos and notification settings. It can't be undone.</p>
        <p className="mt-2 text-sm text-fg-2">Tip: export your data first.</p>
        <label className="label mt-4" htmlFor="confirm-delete">
          Type DELETE to confirm
        </label>
        <input id="confirm-delete" className="input" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} autoComplete="off" autoCapitalize="characters" />
      </Sheet>
    </div>
  );
}
