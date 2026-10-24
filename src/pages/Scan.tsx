import { Check, ChevronRight, ClipboardCheck, Package, Receipt, RefreshCw, ScanLine, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ImagePicker } from '../components/ImagePicker';
import { ScanOverlay } from '../components/ai-effects';
import { ErrorNote, PageHeader, Spinner } from '../components/ui';
import { useOnline } from '../hooks/useOnline';
import { ApiError, errorMessage, scanImage } from '../lib/api';
import { formatDateTime } from '../lib/dates';
import { compressImage } from '../lib/image';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import type { Scan, ScanType } from '../types/app';
import { useKitchen } from '../state/kitchen';

type Step = 'idle' | 'compress' | 'upload' | 'read' | 'done';

const STEPS: Array<{ key: Exclude<Step, 'idle' | 'done'>; label: string }> = [
  { key: 'compress', label: 'Preparing photo' },
  { key: 'upload', label: 'Uploading' },
  { key: 'read', label: 'Reading with AI' },
];

export function ScanPage() {
  const { user, locale, timeZone } = useAuth();
  const { active } = useKitchen();
  const navigate = useNavigate();
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const type: ScanType = params.get('type') === 'product' ? 'product' : 'receipt';
  const [step, setStep] = useState<Step>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; scanId?: string; limit?: boolean } | null>(null);
  const [recent, setRecent] = useState<Scan[]>([]);

  useEffect(() => {
    void supabase
      .from('scans')
      .select('*')
      .in('status', ['needs_review', 'failed', 'uploaded', 'processing'])
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setRecent(data ?? []));
  }, []);

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  function setType(t: ScanType) {
    setParams(t === 'receipt' ? {} : { type: t }, { replace: true });
  }

  async function process(scanId: string) {
    setStep('read');
    try {
      await scanImage(scanId);
      setStep('done');
      navigate(`/scan/${scanId}`);
    } catch (err) {
      setStep('idle');
      const limit = err instanceof ApiError && (err.code === 'daily_limit' || err.code === 'too_many_attempts');
      setError({ message: errorMessage(err), scanId, limit });
    }
  }

  async function handle(file: Blob) {
    if (!user) return;
    setError(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    try {
      setStep('compress');
      const jpeg = await compressImage(file);
      setStep('upload');
      const scanId = crypto.randomUUID();
      const path = `${user.id}/${scanId}.jpg`;
      const { error: upErr } = await supabase.storage.from('scans').upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      const { error: rowErr } = await supabase.from('scans').insert({ id: scanId, type, image_path: path, status: 'uploaded' });
      if (rowErr) {
        await supabase.storage.from('scans').remove([path]);
        throw new Error(rowErr.message);
      }
      await process(scanId);
    } catch (err) {
      setStep('idle');
      setError({ message: errorMessage(err) });
    }
  }

  const busy = step !== 'idle' && step !== 'done';
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        icon={<ScanLine size={24} data-anim="pop" />}
        title="Scan"
        subtitle={
          active
            ? `Photograph a grocery receipt or a single product. You'll review everything before it's added to ${active.name}. Your photo stays private.`
            : "Photograph a grocery receipt or a single product. You'll review everything before it's added."
        }
      />

      <div className="card space-y-5 p-4 sm:p-6">
        <div role="radiogroup" aria-label="What are you scanning?" className="grid grid-cols-2 gap-2 rounded-2xl bg-tint p-1">
          {(
            [
              { t: 'receipt', label: 'Receipt', icon: Receipt, help: 'All the items on a grocery receipt' },
              { t: 'product', label: 'Product', icon: Package, help: 'One item: name, size, printed date, barcode' },
            ] as const
          ).map(({ t, label, icon: Icon, help }) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              disabled={busy}
              onClick={() => setType(t)}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-3 text-center transition-colors ${type === t ? 'bg-surface shadow-sm' : 'text-fg-2'}`}
            >
              <span className="flex items-center gap-2 font-bold">
                <Icon size={18} aria-hidden data-anim="pop" /> {label}
              </span>
              <span className="hidden text-xs text-fg-2 sm:block">{help}</span>
            </button>
          ))}
        </div>

        {!online ? (
          <ErrorNote>Scanning needs an internet connection. You can still look through your list.</ErrorNote>
        ) : busy ? (
          <div className="flex flex-col items-center gap-5 py-4 sm:flex-row sm:items-start">
            {preview && (
              <div className={`shrink-0 border border-line ${step === 'read' ? 'scan-frame bg-ink' : 'overflow-hidden rounded-xl'}`}>
                <img src={preview} alt="Your photo" className="block max-h-56 w-auto object-contain" />
                {step === 'read' && <ScanOverlay />}
              </div>
            )}
            <ol className="w-full max-w-xs space-y-3" aria-live="polite">
              {STEPS.map((s, i) => (
                <li key={s.key} className={`flex items-center gap-3 ${i > stepIndex ? 'text-fg-2' : 'font-semibold'}`}>
                  {i < stepIndex ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-on-accent">
                      <Check size={16} aria-hidden data-anim="pop" />
                    </span>
                  ) : i === stepIndex ? (
                    <span className="flex h-7 w-7 items-center justify-center">
                      <Spinner label={s.label} />
                    </span>
                  ) : (
                    <span className="h-7 w-7 rounded-full border-2 border-line" aria-hidden />
                  )}
                  {s.label}
                </li>
              ))}
              {step === 'read' && <li className="text-sm text-fg-2">This usually takes 5–20 seconds.</li>}
            </ol>
          </div>
        ) : (
          <ImagePicker onPick={(f) => void handle(f)} disabled={busy} />
        )}

        {error && (
          <div className="space-y-3">
            <ErrorNote>{error.message}</ErrorNote>
            <div className="flex flex-wrap gap-2">
              {error.scanId && !error.limit && (
                <button type="button" className="btn btn-secondary" onClick={() => void process(error.scanId!)}>
                  <RefreshCw size={18} aria-hidden data-anim="spin" /> Try again
                </button>
              )}
              <Link to="/add" className="btn btn-secondary">
                Add items by hand
              </Link>
            </div>
          </div>
        )}

        <p className="text-sm text-fg-2">
          Tips: lay the receipt flat, fill the frame, and avoid glare. Photos are compressed on your device, stored privately, and deleted after 30 days.
        </p>
      </div>

      {recent.length > 0 && (
        <section className="card p-4 sm:p-6">
          <h2 className="mb-3 font-bold">Recent scans</h2>
          <ul className="divide-y divide-line">
            {recent.map((s) => (
              <li key={s.id}>
                <Link to={`/scan/${s.id}`} className="flex items-center gap-3 py-3">
                  {s.status === 'failed' ? <TriangleAlert size={20} className="text-danger" aria-hidden /> : <ClipboardCheck size={20} aria-hidden data-anim="pop" />}
                  <span className="flex-1">
                    <span className="block font-semibold">
                      {s.type === 'receipt' ? s.store_name || 'Receipt' : 'Product'} · {s.status === 'needs_review' ? 'Ready to review' : s.status === 'failed' ? 'Could not be read' : 'Processing'}
                    </span>
                    <span className="text-sm text-fg-2">{formatDateTime(s.created_at, locale, timeZone)}</span>
                  </span>
                  <ChevronRight size={18} aria-hidden data-anim="nudge" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
