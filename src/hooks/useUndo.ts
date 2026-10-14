import { useCallback } from 'react';
import { errorMessage, undoBatch } from '../lib/api';
import { FIELD_LABEL } from '../lib/catalog';
import { useItems } from '../state/items';
import { useToast } from '../state/toast';
import type { UndoResult } from '../types/app';

export function describeUndo(r: UndoResult): string {
  if (r.skipped.length === 0) return 'Undone.';
  const kept = r.skipped
    .slice(0, 3)
    .map((s) => (s.field ? `${FIELD_LABEL[s.field]?.toLowerCase() ?? s.field} of ${s.name}` : s.name))
    .join(', ');
  return `Undone, except ${kept}: you changed ${r.skipped.length === 1 ? 'it' : 'them'} since, so ${r.skipped.length === 1 ? 'it was' : 'they were'} left as is.`;
}

/** Undo an AI batch (or a quick used/tossed action) and report what was kept. */
export function useUndo(onDone?: () => void | Promise<void>) {
  const toast = useToast();
  const { refresh } = useItems();
  return useCallback(
    async (batchId: string) => {
      try {
        const result = await undoBatch(batchId);
        await refresh();
        await onDone?.();
        toast.show(describeUndo(result), { tone: 'success', durationMs: result.skipped.length ? 9000 : 4000 });
      } catch (err) {
        toast.show(errorMessage(err), { tone: 'error' });
      }
    },
    [refresh, toast, onDone],
  );
}
