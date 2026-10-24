// Kitchen pickers: switch the open kitchen (your own or a household) and choose where items go.
// Only shown once the user is in at least one household; until then there is just one kitchen.
import { House, Users } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { OWN_KITCHEN, useKitchen } from '../state/kitchen';
import type { HouseholdSummary } from '../lib/api';

const OWN = 'own';

/** A native select of "My kitchen" plus every household. value null = your own kitchen. */
export function KitchenSelect({
  id,
  value,
  onChange,
  households,
  className = 'input',
  disabled,
}: {
  id?: string;
  value: string | null;
  onChange: (next: string | null) => void;
  households: HouseholdSummary[];
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select id={id} className={className} value={value ?? OWN} disabled={disabled} onChange={(e) => onChange(e.target.value === OWN ? null : e.target.value)}>
      <option value={OWN}>{OWN_KITCHEN}</option>
      {households.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name}
        </option>
      ))}
    </select>
  );
}

/** Switches the open kitchen for the whole app. `bar` is the slim row under the phone header. */
export function KitchenSwitcher({ variant = 'sidebar' }: { variant?: 'sidebar' | 'bar' }) {
  const { households, activeId, setActive } = useKitchen();
  const id = useId();
  if (households.length === 0) return null;
  if (variant === 'bar') {
    return (
      <div className="flex items-center gap-2 pt-2" data-tour="kitchen">
        <label htmlFor={id} className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-fg-2">
          {activeId ? <Users size={16} aria-hidden /> : <House size={16} aria-hidden />}
          Kitchen
        </label>
        <KitchenSelect id={id} value={activeId} onChange={setActive} households={households} className="input min-h-10 flex-1 py-1.5 text-sm font-semibold" />
        <Link to="/households" className="shrink-0 text-sm font-semibold text-fg-2 underline underline-offset-2">
          Manage
        </Link>
      </div>
    );
  }
  return (
    <div className="mb-5 px-2" data-tour="kitchen">
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-2">
        {activeId ? <Users size={14} aria-hidden /> : <House size={14} aria-hidden />}
        Kitchen
      </label>
      <KitchenSelect id={id} value={activeId} onChange={setActive} households={households} className="input font-semibold" />
    </div>
  );
}

/** "Shared with 3 people" line for page subtitles while a household kitchen is open. */
export function SharedNote() {
  const { active } = useKitchen();
  if (!active) return null;
  const others = Math.max(active.member_count - 1, 0);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-tint px-2.5 py-0.5 text-sm font-semibold text-fg">
      <Users size={14} aria-hidden />
      {active.name} · shared with {others} {others === 1 ? 'person' : 'people'}
    </span>
  );
}
