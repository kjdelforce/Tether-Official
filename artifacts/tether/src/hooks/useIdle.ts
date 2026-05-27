import { useEffect, useState } from "react";

/**
 * `useIdle(thresholdMs)`
 *
 * Returns `true` when the user has not interacted with the page for
 * `thresholdMs` milliseconds.  Listens to pointer, touch, key and
 * scroll events on the document.  All subscribers share the same
 * timer (one document-level listener set per subscriber, but every
 * subscriber is cheap — passive listeners + a single timeout).
 *
 * Used to drive the Avatar Idle Engine: after 10 s of no input the
 * avatar transitions into a "look around" animation toward a fresh
 * random coordinate every few seconds.
 */
export function useIdle(thresholdMs = 10_000): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;

    const arm = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setIdle(true), thresholdMs);
    };

    const wake = () => {
      setIdle(false);
      arm();
    };

    const events: (keyof DocumentEventMap)[] = [
      "pointerdown", "pointermove", "touchstart", "touchmove",
      "keydown", "wheel", "scroll",
    ];
    events.forEach(ev =>
      document.addEventListener(ev, wake, { passive: true } as AddEventListenerOptions)
    );
    arm();

    return () => {
      if (t) clearTimeout(t);
      events.forEach(ev =>
        document.removeEventListener(ev, wake)
      );
    };
  }, [thresholdMs]);

  return idle;
}
