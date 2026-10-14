import { CircleAlert, CircleCheck, Info, Undo2, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
  action?: ToastAction;
}

interface ToastApi {
  show: (message: string, opts?: { tone?: Toast['tone']; action?: ToastAction; durationMs?: number }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastApi['show']>(
    (message, opts = {}) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone: opts.tone ?? 'info', action: opts.action }]);
      window.setTimeout(() => dismiss(id), opts.durationMs ?? (opts.action ? 10_000 : 5_000));
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg animate-toast-in ${
              t.tone === 'error' ? 'bg-expired text-white' : 'bg-ink text-white dark:bg-white dark:text-ink'
            }`}
          >
            {(() => {
              const Icon = t.tone === 'error' ? CircleAlert : t.tone === 'success' ? CircleCheck : Info;
              return <Icon size={20} className="shrink-0 animate-pop" style={{ animationDelay: '120ms' }} aria-hidden />;
            })()}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold underline underline-offset-2"
                onClick={() => {
                  dismiss(t.id);
                  void t.action!.onClick();
                }}
              >
                {t.action.label === 'Undo' && <Undo2 size={15} aria-hidden data-anim="spin" />}
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="rounded-lg p-1 opacity-80 hover:opacity-100" onClick={() => dismiss(t.id)}>
              <X size={16} data-anim="turn" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
