import { Clock3, ScanLine, Sparkles } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { resetTimeLabel, untilReset, useAiUsage } from '../hooks/useAiUsage';
import type { AiUsage } from '../lib/api';
import { useAuth } from '../state/auth';

function Bar({
  label,
  icon,
  used,
  limit,
  unit,
  usage,
  compact,
}: {
  label: string;
  icon: ReactNode;
  used: number;
  limit: number;
  unit: string;
  usage: AiUsage;
  compact: boolean;
}) {
  const { locale } = useAuth();
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const left = Math.max(0, limit - used);
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const fill = left === 0 ? 'bg-expired' : pct >= 80 ? 'bg-lime' : 'bg-accent';
  const resetAt = resetTimeLabel(usage, locale);

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <div className={`flex items-baseline justify-between gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        <span className="inline-flex items-center gap-1.5 font-semibold">
          {icon}
          {label}
        </span>
        <span className={left === 0 ? 'font-bold text-danger' : 'text-fg-2'}>
          {left === 0 ? 'Limit reached' : compact ? `${left} of ${limit} left` : `${used} of ${limit} used · ${left} left`}
        </span>
      </div>
      <div
        role="progressbar"
        tabIndex={0}
        aria-label={`${label} today`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={`${used} of ${limit} ${unit} used, ${left} left`}
        aria-describedby={tipId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className={`mt-1 w-full cursor-help overflow-hidden rounded-full bg-tint ring-1 ring-line/60 ring-inset ${compact ? 'h-2' : 'h-2.5'}`}
      >
        <div className={`h-full rounded-full transition-[width] duration-500 ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <div
        id={tipId}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-0 z-50 mb-2 rounded-xl ${compact ? 'w-56' : 'right-0 sm:right-auto sm:w-80'} bg-ink px-3 py-2 text-xs leading-snug text-white shadow-lg transition-opacity duration-150 dark:bg-white dark:text-ink ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="flex items-center gap-1.5 font-bold">
          <Clock3 size={14} aria-hidden /> Resets daily at {resetAt}
        </span>
        <span className="mt-0.5 block opacity-85">
          That's midnight in your timezone ({usage.timezone.replace(/_/g, ' ')}), in {untilReset(usage)}. You have {left} {unit} left today.
        </span>
      </div>
    </div>
  );
}

/** How much of today's AI allowance is left, with the reset time on hover, focus or tap. */
export function UsageMeter({ compact = false }: { compact?: boolean }) {
  const usage = useAiUsage();
  const { locale } = useAuth();
  if (!usage) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-2 w-full animate-pulse rounded-full bg-tint" />
        <div className="h-2 w-full animate-pulse rounded-full bg-tint" />
      </div>
    );
  }
  const size = compact ? 13 : 16;
  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
      {compact && (
        <p className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-fg-2">
          <Sparkles size={12} aria-hidden /> AI left today
        </p>
      )}
      <Bar
        label="Scans"
        unit="scans"
        icon={<ScanLine size={size} aria-hidden />}
        used={usage.scans_used}
        limit={usage.scans_limit}
        usage={usage}
        compact={compact}
      />
      <Bar
        label="AI requests"
        unit="AI requests"
        icon={<Sparkles size={size} aria-hidden />}
        used={usage.requests_used}
        limit={usage.requests_limit}
        usage={usage}
        compact={compact}
      />
      {!compact && (
        <p className="flex items-start gap-2 text-sm text-fg-2">
          <Clock3 size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            Limits reset daily at {resetTimeLabel(usage, locale)}, midnight in your timezone, in {untilReset(usage)}. AI requests cover plain-language updates
            and recipe chats and ideas.
          </span>
        </p>
      )}
    </div>
  );
}
