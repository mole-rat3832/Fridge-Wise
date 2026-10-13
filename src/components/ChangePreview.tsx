import { ArrowRight, Check, Info, Lock, Plus, Trash } from 'lucide-react';
import type { PreviewLine } from '../types/app';

const ICON = { update: ArrowRight, used: Check, tossed: Trash, create: Plus, skipped: Lock } as const;

export function ChangePreview({ lines, problems = [] }: { lines: PreviewLine[]; problems?: string[] }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {lines.map((line, i) => {
          const Icon = ICON[line.kind];
          return (
            <li
              key={i}
              className={`flex items-start gap-3 rounded-xl border border-line px-3 py-2.5 ${line.kind === 'skipped' ? 'bg-tint text-fg-2' : ''}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
              <span>{line.text}</span>
            </li>
          );
        })}
      </ul>
      {problems.length > 0 && (
        <div className="rounded-xl bg-tint px-3 py-2 text-sm text-fg-2">
          <p className="flex items-center gap-1.5 font-semibold">
            <Info size={16} aria-hidden /> Not included
          </p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-fg-2">Nothing changes until you confirm. You can undo it afterwards.</p>
    </div>
  );
}
