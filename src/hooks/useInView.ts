import { useEffect, useRef, useState, type RefObject } from 'react';

/** True once the element has scrolled into view (and stays true). Used to start homepage demos. */
export function useInView<T extends Element>(threshold = 0.35): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  // Without IntersectionObserver (very old browsers) everything counts as seen right away.
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen];
}

/** Animates a number toward `target` (eased, ~600 ms). Jumps straight there with reduced motion. */
export function useCountUp(target: number, run = true, duration = 700): number {
  const [value, setValue] = useState(run ? 0 : target);
  const from = useRef(value);
  useEffect(() => {
    if (!run) return;
    const reduce = document.documentElement.dataset.motion === 'reduce' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const v = begin + (target - begin) * eased;
      from.current = v;
      setValue(v);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, run, duration]);
  return value;
}
