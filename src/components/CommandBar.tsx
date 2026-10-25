// "Tell FridgeWise what happened" — plain-language updates.
// ai-command proposes changes, the user confirms the preview, apply_ai_changes applies them
// in one transaction, and the toast offers Undo.
import { MessageSquareText, Mic, MicOff, Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useOnline } from '../hooks/useOnline';
import { useUndo } from '../hooks/useUndo';
import { aiCommand, applyAiChanges, errorMessage } from '../lib/api';
import { useItems } from '../state/items';
import { useKitchen } from '../state/kitchen';
import { useToast } from '../state/toast';
import type { CommandResponse } from '../types/app';
import { ChangePreview } from './ChangePreview';
import { ErrorNote, Sheet, Spinner } from './ui';

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function getRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const EXAMPLES = ['I finished the milk', 'Moved the chicken to the freezer', 'Threw out the spinach', 'I opened the yogurt today'];

export function CommandBar({ locale }: { locale: string }) {
  const online = useOnline();
  const toast = useToast();
  const { refresh } = useItems();
  const { activeId } = useKitchen();
  const undo = useUndo();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<{ request: string; question: string } | null>(null);
  const [proposal, setProposal] = useState<CommandResponse | null>(null);
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const Recognition = getRecognition();

  useEffect(() => () => recognition.current?.stop(), []);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await aiCommand(value, question ?? undefined, activeId);
      if (res.clarification) {
        setQuestion({ request: question?.request ?? value, question: res.clarification });
        setText('');
        input.current?.focus();
      } else if (res.operations.length === 0) {
        setQuestion(null);
        setError(res.problems[0] ?? "I couldn't match that to anything in your kitchen. Try naming the item.");
      } else {
        setQuestion(null);
        setProposal(res);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!proposal) return;
    setApplying(true);
    try {
      const result = await applyAiChanges(proposal.operations, 'ai_command', proposal.model, activeId);
      await refresh();
      setProposal(null);
      setText('');
      const locked = result.skipped.filter((s) => s.reason === 'locked').length;
      const n = new Set(result.applied.map((a) => a.item_id)).size;
      const msg = n === 0 ? 'Nothing needed to change.' : `Updated ${n} item${n === 1 ? '' : 's'}.${locked ? ` Kept ${locked} value${locked === 1 ? '' : 's'} you set yourself.` : ''}`;
      toast.show(msg, { tone: 'success', action: result.batch_id ? { label: 'Undo', onClick: () => undo(result.batch_id!) } : undefined });
    } catch (err) {
      toast.show(errorMessage(err), { tone: 'error' });
    } finally {
      setApplying(false);
    }
  }

  function toggleMic() {
    if (!Recognition) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = new Recognition();
    r.lang = locale;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((res) => res[0].transcript)
        .join(' ');
      setText(transcript);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }

  return (
    <section aria-labelledby="command-title" className={`card p-4 sm:p-5 ${busy ? 'ai-glow' : ''}`}>
      <h2 id="command-title" className="mb-2 flex items-center gap-2 font-bold">
        <Sparkles size={18} aria-hidden data-anim="twinkle-loop" /> Tell FridgeWise what happened
      </h2>
      {question && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-tint px-3 py-2">
          <MessageSquareText size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="font-semibold">{question.question}</p>
            <button type="button" className="mt-1 text-sm text-fg-2 underline underline-offset-2" onClick={() => setQuestion(null)}>
              Start over
            </button>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="command" className="sr-only">
          What happened to your food?
        </label>
        <input
          ref={input}
          id="command"
          className="input flex-1"
          placeholder={question ? 'Your answer…' : 'e.g. I used half the milk'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          autoComplete="off"
          enterKeyHint="send"
          disabled={!online}
        />
        {Recognition && (
          <button
            type="button"
            className={`btn btn-icon ${listening ? 'btn-primary' : 'btn-secondary'}`}
            onClick={toggleMic}
            aria-label={listening ? 'Stop listening' : 'Speak'}
            aria-pressed={listening}
            disabled={!online}
          >
            {listening ? <MicOff size={20} data-anim="pulse-loop" /> : <Mic size={20} data-anim="pop" />}
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-icon" disabled={busy || !text.trim() || !online} aria-label="Send">
          {busy ? <Spinner label="Thinking" /> : <Send size={20} data-anim="fly" />}
        </button>
      </form>
      {!online && <p className="mt-2 text-sm text-fg-2">The AI command bar needs an internet connection.</p>}
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {!question && !error && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip shrink-0" onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={proposal !== null}
        onClose={() => setProposal(null)}
        title="Confirm these changes"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setProposal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={applying} data-autofocus>
              {applying ? <Spinner label="Saving" /> : 'Confirm'}
            </button>
          </>
        }
      >
        {proposal && <ChangePreview lines={proposal.preview} problems={proposal.problems} />}
      </Sheet>
    </section>
  );
}
