import { useEffect, useRef, useState } from 'react';

/** True when the system asks for less motion, or "Reduce motion" is on in Settings > Appearance. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return document.documentElement.dataset.motion === 'reduce' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Reveals `text` word by word, like it is being typed. Whether to animate is decided once, when
 * the component mounts (give each message its own component, keyed by id). Returns the full text
 * right away when `enabled` is false or the user prefers reduced motion. `onProgress` runs after
 * each chunk (e.g. to keep a chat scrolled to the bottom).
 */
export function useTypewriter(text: string, enabled: boolean, onProgress?: () => void): string {
  const [animate] = useState(() => enabled && !prefersReducedMotion());
  const [count, setCount] = useState(0);
  const progress = useRef(onProgress);
  useEffect(() => {
    progress.current = onProgress;
  });

  useEffect(() => {
    if (!animate) return;
    let i = 0;
    const id = window.setInterval(() => {
      // Jump to the end of the next word so text appears in natural chunks.
      const next = text.indexOf(' ', i + 1);
      i = next === -1 ? text.length : next;
      setCount(i);
      progress.current?.();
      if (i >= text.length) window.clearInterval(id);
    }, 45);
    return () => window.clearInterval(id);
  }, [text, animate]);

  return animate ? text.slice(0, count) : text;
}
