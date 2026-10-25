import { Bookmark, BookmarkCheck, ChefHat, Clock, CookingPot, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CookingLoader } from '../components/ai-effects';
import { RecipeChat } from '../components/RecipeChat';
import { EmptyState, ErrorNote, FreshnessBadge, PageHeader, Sheet, Spinner } from '../components/ui';
import { useOnline } from '../hooks/useOnline';
import { prefersReducedMotion } from '../hooks/useTypewriter';
import { useUndo } from '../hooks/useUndo';
import { applyAiChanges, errorMessage, suggestRecipes, type ChatMessage } from '../lib/api';
import { formatQuantity, UNIT_LABEL } from '../lib/catalog';
import { expiryPhrase, freshness } from '../lib/dates';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { useItems } from '../state/items';
import { useKitchen } from '../state/kitchen';
import { useToast } from '../state/toast';
import type { FoodItem, ProposedOperation, Recipe, RecipeIngredient } from '../types/app';

type Choice = 'all' | 'some' | 'none';

export function Recipes() {
  const { profile, today, user } = useAuth();
  const { items, refresh } = useItems();
  const { activeId, active } = useKitchen();
  const toast = useToast();
  const undo = useUndo();
  const online = useOnline();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Recipe | null>(null);
  const [choices, setChoices] = useState<Record<string, { choice: Choice; amount: string }>>({});
  const [applying, setApplying] = useState(false);
  // Recipes that just arrived get the reveal animation; the brief they were made for is shown above them.
  const [fresh, setFresh] = useState<string[]>([]);
  const [lastBrief, setLastBrief] = useState<string | null>(null);
  const ideasRef = useRef<HTMLElement>(null);
  const scrollToIdeas = useRef(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const rdb = profile?.reminder_days_before ?? 2;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('recipes').select('*').order('saved', { ascending: false }).order('created_at', { ascending: false }).limit(30);
    setRecipes(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The soonest-expiring items drop into the pot while recipes are generated.
  const soonest = useMemo(
    () =>
      items
        .filter((i) => i.expiration_date && i.expiration_date >= today)
        .sort((a, b) => (a.expiration_date! < b.expiration_date! ? -1 : 1))
        .slice(0, 5)
        .map((i) => i.name),
    [items, today],
  );

  async function suggest(conversation: ChatMessage[], brief: string | null) {
    setSuggesting(true);
    setError(null);
    setLastBrief(brief);
    try {
      const res = await suggestRecipes({ servings: profile?.household_size ?? undefined, conversation, brief, householdId: activeId });
      setFresh(res.recipes.map((r) => r.id));
      await load();
      scrollToIdeas.current = true;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSuggesting(false);
    }
  }

  // Show the cooking animation as soon as generating starts (it sits below the chat).
  useEffect(() => {
    if (suggesting) loaderRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }, [suggesting]);

  // Once the new ideas are on screen, bring them into view.
  useEffect(() => {
    if (suggesting || !scrollToIdeas.current) return;
    scrollToIdeas.current = false;
    ideasRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [suggesting, fresh]);

  async function toggleSave(r: Recipe) {
    const { error: err } = await supabase.from('recipes').update({ saved: !r.saved }).eq('id', r.id);
    if (err) toast.show(errorMessage(err), { tone: 'error' });
    else setRecipes((list) => list.map((x) => (x.id === r.id ? { ...x, saved: !r.saved } : x)));
  }

  function openMade(r: Recipe) {
    const init: Record<string, { choice: Choice; amount: string }> = {};
    for (const id of r.uses_item_ids) if (byId.has(id)) init[id] = { choice: 'all', amount: '' };
    setChoices(init);
    setMade(r);
  }

  const madeItems: FoodItem[] = made ? made.uses_item_ids.map((id) => byId.get(id)).filter((x): x is FoodItem => Boolean(x)) : [];

  function operations(): ProposedOperation[] {
    if (!made) return [];
    const ops: ProposedOperation[] = [];
    for (const it of madeItems) {
      const c = choices[it.id];
      if (!c || c.choice === 'none') continue;
      const amount = c.choice === 'some' ? Number(c.amount) : null;
      if (c.choice === 'some' && !(amount! > 0)) continue;
      ops.push({ op: 'mark_used', item_id: it.id, amount: amount !== null && amount >= Number(it.quantity) ? null : amount, reason: `Made ${made.title}`, confidence: 1 });
    }
    return ops;
  }

  async function confirmMade() {
    if (!made) return;
    const ops = operations();
    if (ops.length === 0) {
      setMade(null);
      return;
    }
    setApplying(true);
    try {
      const res = await applyAiChanges(ops, 'ai_recipe', made.model, activeId);
      await supabase.from('recipes').update({ made_at: new Date().toISOString() }).eq('id', made.id);
      await Promise.all([refresh(), load()]);
      setMade(null);
      toast.show(`Enjoy your ${made.title}! Updated ${ops.length} item${ops.length === 1 ? '' : 's'}.`, {
        tone: 'success',
        action: res.batch_id ? { label: 'Undo', onClick: () => undo(res.batch_id!) } : undefined,
      });
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    } finally {
      setApplying(false);
    }
  }

  const saved = recipes.filter((r) => r.saved);
  const suggestions = recipes.filter((r) => !r.saved);

  // A render function (not a nested component) so React keeps each card's state between renders.
  function renderCard(r: Recipe) {
    const ingredients = (r.ingredients as unknown as RecipeIngredient[]) ?? [];
    const steps = (r.steps as unknown as string[]) ?? [];
    const reveal = fresh.indexOf(r.id);
    return (
      <article
        key={r.id}
        className={`card flex flex-col p-4 sm:p-5 ${reveal >= 0 ? 'reveal-card' : ''}`}
        style={reveal >= 0 ? ({ '--fw-delay': `${reveal * 160}ms` } as CSSProperties) : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold leading-snug">{r.title}</h3>
          <button type="button" className="btn btn-ghost btn-icon -mr-2 -mt-1" onClick={() => void toggleSave(r)} aria-pressed={r.saved} aria-label={r.saved ? 'Remove from saved' : 'Save recipe'}>
            {r.saved ? <BookmarkCheck size={20} className="animate-pop" /> : <Bookmark size={20} data-anim="pop" />}
          </button>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-2">
          {r.time_minutes && (
            <span className="inline-flex items-center gap-1">
              <Clock size={14} aria-hidden /> {r.time_minutes} min
            </span>
          )}
          {r.servings && (
            <span className="inline-flex items-center gap-1">
              <Users size={14} aria-hidden /> Serves {r.servings}
            </span>
          )}
          {r.made_at && <span>Made it</span>}
        </p>
        <h4 className="mt-4 text-sm font-bold uppercase tracking-wide text-fg-2">Ingredients</h4>
        <ul className="mt-1 space-y-1.5">
          {ingredients.map((ing, i) => {
            const it = ing.item_id ? byId.get(ing.item_id) : undefined;
            return (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span>{ing.text}</span>
                {it && <FreshnessBadge status={freshness(it.expiration_date, today, rdb)}>{expiryPhrase(it.expiration_date, today)}</FreshnessBadge>}
              </li>
            );
          })}
        </ul>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-bold uppercase tracking-wide text-fg-2">Steps</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </details>
        <div className="mt-auto pt-4">
          <button type="button" className="btn btn-primary w-full" onClick={() => openMade(r)} disabled={!online || r.uses_item_ids.every((id) => !byId.has(id))}>
            <CookingPot size={18} aria-hidden data-anim="wiggle" /> I made this
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recipes"
        subtitle={`Ideas that use the food closest to expiring${active ? ` in ${active.name}` : ''}. Tell the chef what you feel like first, or just generate.`}
        icon={<ChefHat size={24} />}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : items.length === 0 && recipes.length === 0 ? (
        <EmptyState icon={<ChefHat size={40} />} title="Add some food first" actions={<Link to="/scan" className="btn btn-primary">Scan a receipt</Link>}>
          Recipes are built from what you have, starting with what expires soonest.
        </EmptyState>
      ) : (
        <>
          {user && items.length > 0 && (
            <RecipeChat
              userId={user.id}
              items={items}
              today={today}
              servings={profile?.household_size ?? undefined}
              online={online}
              generating={suggesting}
              onGenerate={(conversation, brief) => void suggest(conversation, brief)}
            />
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          {suggesting && (
            <div ref={loaderRef} className="scroll-mt-20 lg:scroll-mt-6">
              <CookingLoader ingredients={soonest} brief={lastBrief} />
            </div>
          )}
          {!suggesting && suggestions.length > 0 && (
            <section aria-labelledby="ideas" ref={ideasRef} className="scroll-mt-20 lg:scroll-mt-6">
              <h2 id="ideas" className="mb-1 text-lg font-bold">
                Ideas for today
              </h2>
              {lastBrief && fresh.length > 0 && <p className="mb-3 text-sm text-fg-2">Based on: {lastBrief}</p>}
              {!(lastBrief && fresh.length > 0) && <div className="mb-3" />}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {suggestions.map(renderCard)}
              </div>
            </section>
          )}
          {saved.length > 0 && (
            <section aria-labelledby="saved">
              <h2 id="saved" className="mb-3 text-lg font-bold">
                Saved recipes
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {saved.map(renderCard)}
              </div>
            </section>
          )}
        </>
      )}

      <Sheet
        center
        open={made !== null}
        onClose={() => setMade(null)}
        title={made ? `You made ${made.title}` : ''}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setMade(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void confirmMade()} disabled={applying || operations().length === 0}>
              {applying ? <Spinner label="Saving" /> : 'Confirm'}
            </button>
          </>
        }
      >
        <p className="mb-3 text-fg-2">How much of each did you use? Nothing changes until you confirm, and you can undo it.</p>
        <ul className="space-y-3">
          {madeItems.map((it) => {
            const c = choices[it.id] ?? { choice: 'all', amount: '' };
            const set = (patch: Partial<typeof c>) => setChoices((m) => ({ ...m, [it.id]: { ...c, ...patch } }));
            return (
              <li key={it.id} className="rounded-xl border border-line p-3">
                <p className="font-semibold">
                  {it.name} <span className="font-normal text-fg-2">· {formatQuantity(it.quantity, it.unit)}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={`How much ${it.name}`}>
                  {(['all', 'some', 'none'] as const).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={c.choice === k} className="chip" aria-pressed={c.choice === k} onClick={() => set({ choice: k })}>
                      {k === 'all' ? 'Used it all' : k === 'some' ? 'Used some' : 'Not used'}
                    </button>
                  ))}
                </div>
                {c.choice === 'some' && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="sr-only" htmlFor={`amt-${it.id}`}>
                      Amount used
                    </label>
                    <input id={`amt-${it.id}`} className="input w-28" inputMode="decimal" value={c.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="Amount" />
                    <span className="text-fg-2">{UNIT_LABEL[it.unit]}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {made && made.uses_item_ids.length > madeItems.length && (
          <p className="mt-3 text-sm text-fg-2">Some ingredients are no longer in your kitchen and were left out.</p>
        )}
      </Sheet>
    </div>
  );
}
