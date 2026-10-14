// Visual effects for the moments the AI is working: cooking recipes, reading a photo, typing.
// All loops stop under prefers-reduced-motion (see index.css), and every effect is aria-hidden
// with a plain-text status next to it for screen readers.
import { useEffect, useState, type CSSProperties } from 'react';

const COOKING_STEPS = ['Checking what expires first', 'Pairing flavors', 'Balancing the plate', 'Writing the steps', 'Plating up'];

/** A pot that the user's soon-expiring items drop into, with steam, bubbles and rotating status text. */
export function CookingLoader({ ingredients, brief }: { ingredients: string[]; brief?: string | null }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => (s + 1) % COOKING_STEPS.length), 1900);
    return () => window.clearInterval(id);
  }, []);
  const chips = (ingredients.length ? ingredients : ['Tomatoes', 'Basil', 'Garlic']).slice(0, 5);

  return (
    <div className="card flex flex-col items-center gap-3 overflow-hidden px-4 py-8 text-center animate-fade-in" role="status">
      <span className="sr-only">Cooking up 3 recipe ideas{brief ? ` for: ${brief}` : ''}. This takes a few seconds.</span>
      <div className="relative h-48 w-64" aria-hidden>
        {chips.map((name, i) => (
          <span
            key={`${name}-${i}`}
            className="cook-chip motion-loop badge badge-yellow absolute left-1/2 top-10 -translate-x-1/2 shadow-sm"
            style={
              {
                animation: `fw-drop 3s ${i * 0.6}s cubic-bezier(0.5, 0, 0.75, 0) infinite both`,
                '--fw-dx': `${(i % 2 ? 1 : -1) * (28 + i * 10)}px`,
              } as CSSProperties
            }
          >
            {name}
          </span>
        ))}
        <svg viewBox="0 0 260 190" className="absolute inset-0 h-full w-full">
          {/* steam */}
          {[96, 130, 164].map((x, i) => (
            <path
              key={x}
              className="motion-loop"
              d={`M${x} 92 c -10 -12, 10 -20, 0 -32 c -10 -12, 10 -20, 0 -32`}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.35"
              strokeWidth="5"
              strokeLinecap="round"
              style={{ animation: `fw-steam 2.4s ${i * 0.5}s ease-out infinite both`, transformBox: 'fill-box', transformOrigin: 'bottom' }}
            />
          ))}
          <g className="motion-loop" style={{ animation: 'fw-wobble 2.6s ease-in-out infinite', transformBox: 'fill-box', transformOrigin: 'center bottom' }}>
            {/* handles */}
            <rect x="38" y="112" width="26" height="12" rx="6" fill="var(--color-steel)" />
            <rect x="196" y="112" width="26" height="12" rx="6" fill="var(--color-steel)" />
            {/* pot */}
            <path d="M56 104 h148 v46 a28 28 0 0 1 -28 28 h-92 a28 28 0 0 1 -28 -28 z" fill="var(--color-slate)" />
            <rect x="56" y="122" width="148" height="7" fill="var(--color-steel)" opacity="0.7" />
            {/* soup */}
            <ellipse cx="130" cy="104" rx="74" ry="13" fill="var(--color-sprout)" />
            <ellipse cx="130" cy="101" rx="60" ry="7" fill="var(--color-lime)" opacity="0.65" />
            {/* bubbles */}
            {[
              [100, 102, 0],
              [138, 100, 0.5],
              [160, 104, 1],
              [120, 106, 1.4],
            ].map(([cx, cy, d]) => (
              <circle
                key={`${cx}`}
                className="motion-loop"
                cx={cx}
                cy={cy}
                r="4"
                fill="var(--color-lime)"
                stroke="var(--color-leaf)"
                strokeWidth="1.5"
                style={{ animation: `fw-bubble 1.6s ${d}s ease-out infinite both`, transformBox: 'fill-box', transformOrigin: 'center' }}
              />
            ))}
          </g>
        </svg>
      </div>
      <p key={step} className="text-lg font-bold animate-fade-in" aria-hidden>
        {COOKING_STEPS[step]}…
      </p>
      <p className="max-w-sm text-sm text-fg-2" aria-hidden>
        {brief ? `Cooking for: ${brief}` : 'Using the food that expires soonest.'}
      </p>
    </div>
  );
}

const SPARKS: Array<[number, number, number]> = [
  [18, 22, 0],
  [72, 14, 0.4],
  [40, 48, 0.9],
  [82, 62, 1.3],
  [24, 76, 0.6],
  [60, 84, 1.1],
  [50, 30, 1.6],
];

/** Corner brackets and "found something" sparks over a photo. Put it inside an element with .scan-frame. */
export function ScanOverlay() {
  const corner = 'scan-corner';
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <span className={`${corner} left-2 top-2 rounded-tl-lg`} style={{ borderTopWidth: 3, borderLeftWidth: 3 }} />
      <span className={`${corner} right-2 top-2 rounded-tr-lg`} style={{ borderTopWidth: 3, borderRightWidth: 3 }} />
      <span className={`${corner} bottom-2 left-2 rounded-bl-lg`} style={{ borderBottomWidth: 3, borderLeftWidth: 3 }} />
      <span className={`${corner} bottom-2 right-2 rounded-br-lg`} style={{ borderBottomWidth: 3, borderRightWidth: 3 }} />
      {SPARKS.map(([x, y, d]) => (
        <span key={`${x}-${y}`} className="scan-spark" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}

export function TypingDots() {
  return (
    <span className="typing-dots text-fg-2" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}
