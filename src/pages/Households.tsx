// Households: shared kitchens. Everyone in a household sees and updates the same food items;
// scans, photos, recipes and the daily AI allowance stay personal.
//
// Creating a household and inviting someone each need a fresh CAPTCHA (checked server-side by the
// households edge function). Accepting, declining, leaving, removing, renaming and deleting are
// plain RPCs that only act for the signed-in user.
import { ArrowLeft, ArrowRightLeft, Check, ChevronRight, Crown, House, LogOut, Mail, Pencil, Send, Trash, UserMinus, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Captcha, captchaEnabled, type CaptchaHandle } from '../components/Captcha';
import { EmptyState, ErrorNote, Field, PageHeader, Sheet, Spinner } from '../components/ui';
import { useOnline } from '../hooks/useOnline';
import {
  ApiError,
  createHousehold,
  deleteHousehold,
  errorMessage,
  householdDetails,
  inviteToHousehold,
  leaveHousehold,
  removeHouseholdMember,
  renameHousehold,
  respondToInvite,
  revokeInvite,
  type HouseholdDetails,
  type HouseholdInvite,
  type HouseholdMember,
} from '../lib/api';
import { dateOf, formatDate } from '../lib/dates';
import { plural } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { useItems } from '../state/items';
import { OWN_KITCHEN, useKitchen } from '../state/kitchen';
import { useToast } from '../state/toast';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function initials(name: string | null | undefined, email: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) return words.slice(0, 2).map((w) => [...w][0]!.toUpperCase()).join('');
  return (email[0] ?? '?').toUpperCase();
}

function Avatar({ name, email }: { name: string | null; email: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime text-sm font-extrabold text-ink" aria-hidden>
      {initials(name, email)}
    </span>
  );
}

function RoleBadge({ role }: { role: 'owner' | 'member' }) {
  return role === 'owner' ? (
    <span className="badge badge-green">
      <Crown size={12} strokeWidth={2.5} aria-hidden /> Owner
    </span>
  ) : (
    <span className="badge border border-line bg-tint text-fg-2">Member</span>
  );
}

function CaptchaUnavailable() {
  return <ErrorNote>The security check isn't available right now, so this can't be done. Please try again later.</ErrorNote>;
}

function ConfirmSheet({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      center
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy} data-autofocus>
            {busy ? <Spinner label="Working" /> : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-2 text-fg-2">{children}</div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// /households
// ---------------------------------------------------------------------------
export function Households() {
  const { households, invites, refresh, setActive, activeId } = useKitchen();
  const toast = useToast();
  const navigate = useNavigate();
  const online = useOnline();
  const [busyInvite, setBusyInvite] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function respond(invite: HouseholdInvite, accept: boolean) {
    setBusyInvite(invite.id);
    try {
      await respondToInvite(invite.id, accept);
      await refresh();
      if (accept) {
        setActive(invite.household_id);
        toast.show(`Welcome to ${invite.household_name}! You're now in its kitchen.`, { tone: 'success' });
        navigate('/');
      } else {
        toast.show(`Invite to ${invite.household_name} declined.`, { tone: 'success' });
      }
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
      await refresh();
    } finally {
      setBusyInvite(null);
    }
  }

  function open(id: string | null) {
    setActive(id);
    navigate('/');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        icon={<Users size={24} />}
        title="Households"
        subtitle="Share a kitchen with the people you live with. Everyone in a household sees the same food, and anything one of you scans or adds shows up for the others."
      />

      {invites.length > 0 && (
        <section aria-labelledby="invites-title" className="card overflow-hidden border-l-4 border-l-lime">
          <h2 id="invites-title" className="flex items-center gap-2 border-b border-line px-4 py-3 text-lg font-bold">
            <Mail size={20} aria-hidden data-anim="wiggle-once" /> {invites.length === 1 ? 'You have an invite' : `You have ${invites.length} invites`}
          </h2>
          <ul className="divide-y divide-line">
            {invites.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-bold">{inv.household_name}</p>
                  <p className="text-sm text-fg-2 [overflow-wrap:anywhere]">
                    Invited by {inv.invited_by_name ? `${inv.invited_by_name} (${inv.invited_by_email})` : (inv.invited_by_email ?? 'a member')} ·{' '}
                    {plural(inv.member_count, 'member')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="btn btn-secondary" disabled={busyInvite !== null || !online} onClick={() => void respond(inv, false)}>
                    Decline
                  </button>
                  <button type="button" className="btn btn-primary" disabled={busyInvite !== null || !online} onClick={() => void respond(inv, true)}>
                    {busyInvite === inv.id ? <Spinner label="Joining" /> : <Check size={18} aria-hidden data-anim="pop" />} Join
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="kitchens-title" className="space-y-2">
        <h2 id="kitchens-title" className="text-lg font-bold">
          Your kitchens
        </h2>
        <ul className="card divide-y divide-line overflow-hidden">
          <li className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint" aria-hidden>
              <House size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{OWN_KITCHEN}</p>
              <p className="text-sm text-fg-2">Only you</p>
            </div>
            {activeId === null ? (
              <span className="text-sm font-semibold text-fg-2">Open now</span>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(null)}>
                Open
              </button>
            )}
          </li>
          {households.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime text-ink" aria-hidden>
                <Users size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  <span className="[overflow-wrap:anywhere]">{h.name}</span>
                  {h.role === 'owner' && <RoleBadge role="owner" />}
                </p>
                <p className="text-sm text-fg-2">
                  {plural(h.member_count, 'member')} · {plural(h.item_count, 'item')}
                </p>
              </div>
              <div className="flex gap-2">
                {activeId === h.id ? (
                  <span className="self-center text-sm font-semibold text-fg-2">Open now</span>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(h.id)}>
                    Open
                  </button>
                )}
                <Link to={`/households/${h.id}`} className="btn btn-ghost btn-sm" aria-label={`Manage ${h.name}`}>
                  Manage <ChevronRight size={16} aria-hidden data-anim="nudge" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <CreateHousehold />

      <p className="text-sm text-fg-2">
        Your scans, photos, recipe ideas and daily AI allowance always stay yours. Household members see each other's names and email addresses.
      </p>
    </div>
  );
}

function CreateHousehold() {
  const { refresh } = useKitchen();
  const toast = useToast();
  const navigate = useNavigate();
  const online = useOnline();
  // The CAPTCHA only loads once a name is typed; each token works once.
  const captchaRef = useRef<CaptchaHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || !captchaToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createHousehold(trimmed, captchaToken);
      await refresh();
      toast.show(`${created.name} is ready. Invite the people you live with.`, { tone: 'success' });
      navigate(`/households/${created.id}`);
    } catch (err) {
      setError(errorMessage(err));
      // Each CAPTCHA token works once.
      setCaptchaToken(null);
      captchaRef.current?.reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="card space-y-4 p-4 sm:p-5" aria-labelledby="create-title">
      <h2 id="create-title" className="flex items-center gap-2 text-lg font-bold">
        <House size={20} aria-hidden /> Create a household
      </h2>
      <Field label="Household name" htmlFor="household-name" hint="For example “Maple Street” or “Mom's house”. Everyone you invite will see it.">
        <input
          id="household-name"
          className="input"
          maxLength={60}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Our home"
        />
      </Field>
      {trimmed && (captchaEnabled ? <Captcha ref={captchaRef} onToken={setCaptchaToken} /> : <CaptchaUnavailable />)}
      {error && <ErrorNote>{error}</ErrorNote>}
      <button type="submit" className="btn btn-primary" disabled={busy || !online || !trimmed || !captchaToken}>
        {busy ? <Spinner label="Creating" /> : <House size={18} aria-hidden data-anim="pop" />} Create household
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// /households/:id
// ---------------------------------------------------------------------------
type Confirm = { kind: 'leave' } | { kind: 'delete' } | { kind: 'move' } | { kind: 'remove'; member: HouseholdMember };

export function HouseholdPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { user, locale, timeZone } = useAuth();
  const { refresh: refreshKitchens, setActive, activeId } = useKitchen();
  const { refresh: refreshItems } = useItems();
  const toast = useToast();
  const navigate = useNavigate();
  const online = useOnline();
  const [details, setDetails] = useState<HouseholdDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownCount, setOwnCount] = useState(0);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await householdDetails(id);
      setDetails(d);
      setMissing(false);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'P0002') setMissing(true);
      else setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
    const { count } = await supabase.from('food_items').select('id', { count: 'exact', head: true }).is('household_id', null).eq('status', 'active');
    setOwnCount(count ?? 0);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading household" size={28} />
      </div>
    );
  }

  const back = (
    <Link to="/households" className="inline-flex items-center gap-1 text-sm font-semibold text-fg-2 hover:text-fg">
      <ArrowLeft size={16} aria-hidden data-anim="bounce" /> Households
    </Link>
  );

  if (missing || !details) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {back}
        {error ? (
          <ErrorNote>{error}</ErrorNote>
        ) : (
          <EmptyState icon={<Users size={40} />} title="Household not found" actions={<Link to="/households" className="btn btn-primary">Your households</Link>}>
            It may have been deleted, or you're no longer in it.
          </EmptyState>
        )}
      </div>
    );
  }

  const isOwner = details.role === 'owner';
  const owner = details.members.find((m) => m.role === 'owner');
  const heir = details.members.filter((m) => !m.is_you).sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0];
  const nameOf = (m: HouseholdMember) => m.display_name?.trim() || m.email;

  async function afterLeaving(message: string) {
    if (activeId === id) setActive(null);
    await refreshKitchens();
    toast.show(message, { tone: 'success' });
    navigate('/households');
  }

  async function runConfirm() {
    if (!confirm || !details) return;
    setBusy(true);
    try {
      if (confirm.kind === 'leave') {
        const res = await leaveHousehold(id);
        await afterLeaving(res.household_deleted ? `${details.name} was deleted.` : `You left ${details.name}.`);
      } else if (confirm.kind === 'delete') {
        await deleteHousehold(id);
        await afterLeaving(`${details.name} was deleted. Items went back to the people who added them.`);
      } else if (confirm.kind === 'remove') {
        await removeHouseholdMember(id, confirm.member.user_id);
        toast.show(`${nameOf(confirm.member)} was removed.`, { tone: 'success' });
        await Promise.all([load(), refreshKitchens()]);
      } else if (confirm.kind === 'move') {
        const { data, error: err } = await supabase
          .from('food_items')
          .update({ household_id: id })
          .is('household_id', null)
          .eq('user_id', user!.id)
          .eq('status', 'active')
          .select('id');
        if (err) throw new Error(err.message);
        toast.show(`Moved ${plural(data?.length ?? 0, 'item')} into ${details.name}.`, { tone: 'success' });
        await Promise.all([load(), refreshKitchens(), refreshItems()]);
      }
      setConfirm(null);
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await renameHousehold(id, name);
      setRenaming(false);
      await Promise.all([load(), refreshKitchens()]);
      toast.show('Name saved.', { tone: 'success' });
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {back}
      {renaming ? (
        <form onSubmit={(e) => void saveName(e)} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <Field label="Household name" htmlFor="rename" className="flex-1">
            <input id="rename" className="input" maxLength={60} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </Field>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setRenaming(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !newName.trim() || !online}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <PageHeader
          icon={<Users size={24} />}
          title={details.name}
          subtitle={isOwner ? 'You own this household.' : `Owner: ${owner ? nameOf(owner) : 'nobody yet'}`}
          actions={
            <>
              {isOwner && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setNewName(details.name);
                    setRenaming(true);
                  }}
                >
                  <Pencil size={18} aria-hidden data-anim="wiggle" /> Rename
                </button>
              )}
              {activeId === id ? (
                <Link to="/" className="btn btn-primary">
                  Go to its kitchen
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setActive(id);
                    navigate('/');
                  }}
                >
                  Open its kitchen
                </button>
              )}
            </>
          }
        />
      )}

      <section aria-labelledby="members-title" className="card overflow-hidden">
        <h2 id="members-title" className="border-b border-line px-4 py-3 text-lg font-bold">
          People <span className="font-semibold text-fg-2">({details.members.length})</span>
        </h2>
        <ul className="divide-y divide-line">
          {details.members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={m.display_name} email={m.email} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="[overflow-wrap:anywhere]">{nameOf(m)}</span>
                  {m.is_you && <span className="text-sm font-semibold text-fg-2">(you)</span>}
                  <RoleBadge role={m.role} />
                </p>
                {m.display_name?.trim() && <p className="text-sm text-fg-2 [overflow-wrap:anywhere]">{m.email}</p>}
              </div>
              {isOwner && !m.is_you && (
                <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => setConfirm({ kind: 'remove', member: m })} disabled={!online}>
                  <UserMinus size={16} aria-hidden /> Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <InviteForm householdId={id} onInvited={load} />

      {details.invites.length > 0 && (
        <section aria-labelledby="pending-title" className="card overflow-hidden">
          <h2 id="pending-title" className="border-b border-line px-4 py-3 text-lg font-bold">
            Waiting to join <span className="font-semibold text-fg-2">({details.invites.length})</span>
          </h2>
          <ul className="divide-y divide-line">
            {details.invites.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <Mail size={20} className="shrink-0 text-fg-2" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold [overflow-wrap:anywhere]">{inv.email}</p>
                  <p className="text-sm text-fg-2">
                    Invited {inv.invited_by_name ? `by ${inv.invited_by_name} ` : ''}on {formatDate(dateOf(inv.created_at, timeZone), locale)}
                  </p>
                </div>
                <RevokeButton inviteId={inv.id} email={inv.email} onDone={load} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {ownCount > 0 && (
        <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="font-bold">Share what you already have</h2>
            <p className="text-sm text-fg-2">
              Move the {plural(ownCount, 'item')} in {OWN_KITCHEN.toLowerCase()} into {details.name}.
            </p>
          </div>
          <button type="button" className="btn btn-secondary shrink-0" onClick={() => setConfirm({ kind: 'move' })} disabled={!online}>
            <ArrowRightLeft size={18} aria-hidden data-anim="nudge" /> Move my items here
          </button>
        </section>
      )}

      <section className="card space-y-3 p-4 sm:p-5">
        <h2 className="font-bold">Leave or delete</h2>
        <p className="text-sm text-fg-2">
          {isOwner
            ? 'If you leave, the person who has been here longest becomes the owner. Deleting the household sends every item back to the kitchen of the person who added it.'
            : 'If you leave, items you added stay here for everyone else.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm({ kind: 'leave' })} disabled={!online}>
            <LogOut size={18} aria-hidden data-anim="nudge" /> Leave household
          </button>
          {isOwner && (
            <button type="button" className="btn btn-danger" onClick={() => setConfirm({ kind: 'delete' })} disabled={!online}>
              <Trash size={18} aria-hidden data-anim="wiggle" /> Delete household
            </button>
          )}
        </div>
      </section>

      <ConfirmSheet
        open={confirm?.kind === 'leave'}
        title={`Leave ${details.name}?`}
        confirmLabel="Leave"
        busy={busy}
        onConfirm={() => void runConfirm()}
        onClose={() => setConfirm(null)}
      >
        <p>You'll stop seeing this kitchen. Items you added stay here for the others.</p>
        {isOwner && heir && <p>{nameOf(heir)} will become the owner.</p>}
        {!heir && <p>You're the only one here, so the household will be deleted and its items will go back to the people who added them.</p>}
      </ConfirmSheet>
      <ConfirmSheet
        open={confirm?.kind === 'delete'}
        title={`Delete ${details.name}?`}
        confirmLabel="Delete household"
        danger
        busy={busy}
        onConfirm={() => void runConfirm()}
        onClose={() => setConfirm(null)}
      >
        <p>Everyone loses access to this kitchen and pending invites are cancelled.</p>
        <p>Each item goes back to the kitchen of the person who added it. Nothing is deleted.</p>
      </ConfirmSheet>
      <ConfirmSheet
        open={confirm?.kind === 'remove'}
        title={confirm?.kind === 'remove' ? `Remove ${nameOf(confirm.member)}?` : 'Remove'}
        confirmLabel="Remove"
        danger
        busy={busy}
        onConfirm={() => void runConfirm()}
        onClose={() => setConfirm(null)}
      >
        <p>They'll stop seeing this kitchen. Items they added stay here.</p>
      </ConfirmSheet>
      <ConfirmSheet
        open={confirm?.kind === 'move'}
        title={`Move ${plural(ownCount, 'item')} into ${details.name}?`}
        confirmLabel="Move items"
        busy={busy}
        onConfirm={() => void runConfirm()}
        onClose={() => setConfirm(null)}
      >
        <p>Everyone in {details.name} will see these items and can update them or mark them used.</p>
        <p>You can move a single item back from its page.</p>
      </ConfirmSheet>
    </div>
  );
}

function InviteForm({ householdId, onInvited }: { householdId: string; onInvited: () => Promise<void> }) {
  const online = useOnline();
  // The CAPTCHA only loads once an email is typed; each token works once.
  const captchaRef = useRef<CaptchaHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const value = email.trim().toLowerCase();
  const valid = EMAIL.test(value);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !captchaToken || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await inviteToHousehold(householdId, value, captchaToken);
      await onInvited();
      setEmail('');
      setNotice(
        res.status === 'already_member'
          ? `${res.email} is already in this household.`
          : `Invite sent to ${res.email}. They'll see it when they sign in to FridgeWise with that email.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      // Each CAPTCHA token works once (the widget may already be gone, so clear the token too).
      setCaptchaToken(null);
      captchaRef.current?.reset();
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="card space-y-4 p-4 sm:p-5" aria-labelledby="invite-title">
      <h2 id="invite-title" className="flex items-center gap-2 text-lg font-bold">
        <UserPlus size={20} aria-hidden /> Invite someone
      </h2>
      <Field label="Their email" htmlFor="invite-email" hint="They need a FridgeWise account with this email. Invites expire after 30 days.">
        <input
          id="invite-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          className="input"
          maxLength={254}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setNotice(null);
          }}
          placeholder="name@example.com"
        />
      </Field>
      {value && (captchaEnabled ? <Captcha ref={captchaRef} onToken={setCaptchaToken} /> : <CaptchaUnavailable />)}
      {error && <ErrorNote>{error}</ErrorNote>}
      {notice && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-tint px-3 py-2 text-sm font-semibold">
          <Check size={18} className="mt-0.5 shrink-0" aria-hidden /> {notice}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy || !online || !valid || !captchaToken}>
        {busy ? <Spinner label="Sending" /> : <Send size={18} aria-hidden data-anim="nudge" />} Send invite
      </button>
    </form>
  );
}

function RevokeButton({ inviteId, email, onDone }: { inviteId: string; email: string; onDone: () => Promise<void> }) {
  const toast = useToast();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm shrink-0"
      disabled={busy || !online}
      aria-label={`Cancel the invite for ${email}`}
      onClick={async () => {
        setBusy(true);
        try {
          await revokeInvite(inviteId);
          toast.show(`Invite for ${email} cancelled.`, { tone: 'success' });
          await onDone();
        } catch (err) {
          toast.show(errorMessage(err), { tone: 'error' });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner label="Cancelling" /> : 'Cancel invite'}
    </button>
  );
}
