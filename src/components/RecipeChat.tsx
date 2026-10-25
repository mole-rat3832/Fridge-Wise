// "Plan with the chef": a short conversation with the AI before generating recipe ideas.
// The opening message is written here (no AI request); every message the user sends is one
// AI request. The conversation lives in sessionStorage, so it survives moving between pages.
import { ChefHat, RotateCcw, Send, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTypewriter } from '../hooks/useTypewriter';
import { errorMessage, recipeChat, type ChatMessage } from '../lib/api';
import { useKitchen } from '../state/kitchen';
import type { FoodItem } from '../types/app';
import { TypingDots } from './ai-effects';
import { ErrorNote, Spinner } from './ui';

interface Message extends ChatMessage {
  id: string;
  quick?: string[];
  /** Typed out when it first appears (not when restored from storage). */
  fresh?: boolean;
}

interface Saved {
  messages: Message[];
  brief: string | null;
  ready: boolean;
}

const DEFAULT_QUICK = ['Something quick', 'Vegetarian', 'Comfort food', 'Surprise me'];

function storageKey(userId: string) {
  return `fw-recipe-chat:${userId}`;
}

function load(userId: string): Saved | null {
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    return { ...saved, messages: saved.messages.map((m) => ({ ...m, fresh: false })) };
  } catch {
    return null;
  }
}

function greeting(items: FoodItem[], today: string): Message {
  const soon = items
    .filter((i) => i.expiration_date && i.expiration_date >= today)
    .sort((a, b) => (a.expiration_date! < b.expiration_date! ? -1 : 1))
    .slice(0, 2)
    .map((i) => i.name);
  const lead =
    soon.length === 2 ? `Your ${soon[0]} and ${soon[1]} need using soon.` : soon.length === 1 ? `Your ${soon[0]} needs using soon.` : 'Let’s plan something good.';
  return {
    id: 'greeting',
    role: 'assistant',
    text: `Hi! ${lead} What are you in the mood for? Tell me about cravings, diet, allergies or how much time you have, or just tap Generate.`,
    quick: DEFAULT_QUICK,
  };
}

function Bubble({ message, onTyped }: { message: Message; onTyped: () => void }) {
  const shown = useTypewriter(message.text, message.role === 'assistant' && message.fresh === true, onTyped);
  if (message.role === 'user') {
    return (
      <li className="flex justify-end animate-rise">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-on-accent">{message.text}</p>
      </li>
    );
  }
  return (
    <li className={`flex items-end gap-2 ${message.fresh ? 'animate-rise' : ''}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime text-ink" aria-hidden>
        <ChefHat size={16} />
      </span>
      <p className="max-w-[85%] rounded-2xl rounded-bl-md bg-tint px-3.5 py-2">
        <span aria-hidden>{shown}</span>
        <span className="sr-only">{message.text}</span>
      </p>
    </li>
  );
}

export function RecipeChat({
  userId,
  items,
  today,
  servings,
  online,
  generating,
  onGenerate,
}: {
  userId: string;
  items: FoodItem[];
  today: string;
  servings?: number;
  online: boolean;
  generating: boolean;
  onGenerate: (conversation: ChatMessage[], brief: string | null) => void;
}) {
  const { activeId } = useKitchen();
  const hello = useMemo(() => greeting(items, today), [items, today]);
  const [saved] = useState(() => load(userId));
  const [messages, setMessages] = useState<Message[]>(saved?.messages ?? []);
  const [brief, setBrief] = useState<string | null>(saved?.brief ?? null);
  const [ready, setReady] = useState(saved?.ready ?? false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const log = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // The greeting is always first; it follows the current list until the user starts talking.
  const all = messages.length ? messages : [hello];
  const userTurns = messages.filter((m) => m.role === 'user').length;
  const last = all[all.length - 1];
  const quick = !busy && last.role === 'assistant' ? (last.quick ?? []) : [];

  useEffect(() => {
    try {
      if (messages.length) sessionStorage.setItem(storageKey(userId), JSON.stringify({ messages, brief, ready }));
      else sessionStorage.removeItem(storageKey(userId));
    } catch {
      // Storage can be unavailable (private mode); the chat still works for this visit.
    }
  }, [messages, brief, ready, userId]);

  function scrollDown() {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }
  useEffect(scrollDown, [all.length, busy]);

  async function send(value: string) {
    const msg = value.trim();
    if (!msg || busy || !online) return;
    const base = messages.length ? messages : [{ ...hello, fresh: false }];
    const next: Message[] = [...base, { id: crypto.randomUUID(), role: 'user', text: msg.slice(0, 300) }];
    setMessages(next);
    setText('');
    setBusy(true);
    setError(null);
    try {
      const res = await recipeChat(
        next.map(({ role, text: t }) => ({ role, text: t })),
        { servings, brief, householdId: activeId },
      );
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', text: res.reply, quick: res.quick_replies, fresh: true }]);
      setBrief(res.brief);
      setReady(res.ready);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }

  function reset() {
    setMessages([]);
    setBrief(null);
    setReady(false);
    setError(null);
    setText('');
  }

  return (
    <section aria-labelledby="chef-title" className={`card p-4 sm:p-5 ${busy ? 'ai-glow' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="chef-title" className="flex items-center gap-2 text-lg font-bold">
          <ChefHat size={20} aria-hidden /> Plan with the chef
        </h2>
        {messages.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm shrink-0 whitespace-nowrap" onClick={reset} disabled={busy || generating}>
            <RotateCcw size={16} aria-hidden data-anim="spin" /> Start over
          </button>
        )}
      </div>

      <ol ref={log} className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1" aria-live="polite" aria-label="Conversation with the chef">
        {all.map((m) => (
          <Bubble key={m.id} message={m} onTyped={scrollDown} />
        ))}
        {busy && (
          <li className="flex items-end gap-2 animate-fade-in">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime text-ink" aria-hidden>
              <ChefHat size={16} />
            </span>
            <span className="rounded-2xl rounded-bl-md bg-tint px-4 py-3">
              <TypingDots />
              <span className="sr-only">The chef is typing</span>
            </span>
          </li>
        )}
      </ol>

      {brief && (
        <p className="mt-3 rounded-xl border border-line px-3 py-2 text-sm animate-fade-in">
          <span className="font-semibold">Your request:</span> {brief}
        </p>
      )}

      {quick.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {quick.map((q, i) => (
            <button key={q} type="button" className="chip animate-pop" style={{ animationDelay: `${i * 60}ms` }} onClick={() => void send(q)} disabled={!online || generating}>
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="chef-message" className="sr-only">
          Message the chef
        </label>
        <input
          ref={input}
          id="chef-message"
          className="input flex-1"
          placeholder={userTurns ? 'Anything else?' : 'e.g. vegetarian, under 30 minutes'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          autoComplete="off"
          enterKeyHint="send"
          disabled={!online || generating}
        />
        <button type="submit" className="btn btn-secondary btn-icon" disabled={busy || !text.trim() || !online || generating} aria-label="Send">
          {busy ? <Spinner label="Sending" /> : <Send size={20} data-anim="fly" />}
        </button>
      </form>
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <button
          type="button"
          className={`btn btn-primary ${ready && !generating ? 'ready-pulse' : ''}`}
          onClick={() => onGenerate(userTurns ? all.map(({ role, text: t }) => ({ role, text: t })) : [], brief)}
          disabled={generating || busy || !online || items.length === 0}
        >
          {generating ? <Spinner label="Cooking" /> : <Sparkles size={18} aria-hidden data-anim={ready ? 'twinkle-loop' : 'pop'} />} {userTurns ? 'Generate ideas from this chat' : 'Generate 3 ideas'}
        </button>
        <p className="text-xs text-fg-2">
          {ready ? 'The chef has what it needs. ' : ''}Each message and each set of ideas uses 1 of your 60 daily AI requests.
        </p>
      </div>
    </section>
  );
}
