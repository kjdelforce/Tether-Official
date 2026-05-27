import { useEffect } from "react";

/**
 * Liquid-Glass parallax utility.
 *
 * Wires a single global pointermove listener that drives a tiny
 * cursor-tracked parallax (max ±3 px) on every element marked with
 * `data-lg-parallax` or the `.lg-parallax` class.  The hook writes
 * two CSS custom properties on each matched element:
 *
 *   --lg-px   horizontal offset, px (range ±3 × intensity)
 *   --lg-py   vertical offset,   px (range ±3 × intensity)
 *
 * Consumers bind these via:
 *
 *   transform: translate3d(var(--lg-px, 0px), var(--lg-py, 0px), 0);
 *
 * Per-element intensity defaults to 1.0 and can be tuned via the
 * `data-lg-parallax="0.5"` attribute (0 → static, 1 → full ±3 px).
 *
 * Performance notes:
 *   • One listener for the entire document (vs N).
 *   • Throttled via requestAnimationFrame — at most one update per
 *     paint frame regardless of how many move events fire.
 *   • Movement opposite the cursor — gives the "floating, deeper-
 *     than-cursor" parallax cue (the surface lags behind the eye).
 *
 * Accessibility:
 *   • Disabled entirely if the user has set
 *     `prefers-reduced-motion: reduce`.  No listener is attached
 *     and no custom properties are written, so the surface stays
 *     perfectly still.
 *   • Listens for changes to the media query at runtime so the
 *     behaviour updates immediately if the user toggles their OS
 *     setting without reloading the page.
 *
 * Call once at the root of the app (e.g. inside `<AppShell>`).
 * Elements added/removed from the DOM later are picked up
 * automatically because the rAF tick re-queries the selector each
 * frame the cursor moves.
 */
export function useLgParallax() {
  useEffect(() => {
    const reducedQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

    let mouseNX = 0;   // normalised cursor X, range [-1, 1]
    let mouseNY = 0;   // normalised cursor Y, range [-1, 1]
    let rafId: number | null = null;
    let pending = false;
    let attached = false;

    const tick = () => {
      pending = false;
      rafId = null;
      const els = document.querySelectorAll<HTMLElement>(
        "[data-lg-parallax], .lg-parallax",
      );
      els.forEach((el) => {
        const raw = el.dataset.lgParallax;
        const intensity = raw && !Number.isNaN(Number(raw)) ? Number(raw) : 1;
        // Opposite-direction motion (the negation): surface drifts
        // OPPOSITE the cursor for the "deeper plane" parallax cue.
        const dx = -mouseNX * 3 * intensity;
        const dy = -mouseNY * 3 * intensity;
        el.style.setProperty("--lg-px", `${dx.toFixed(2)}px`);
        el.style.setProperty("--lg-py", `${dy.toFixed(2)}px`);
      });
    };

    const onMove = (e: PointerEvent) => {
      mouseNX = (e.clientX / window.innerWidth)  * 2 - 1;
      mouseNY = (e.clientY / window.innerHeight) * 2 - 1;
      if (!pending) {
        pending = true;
        rafId = requestAnimationFrame(tick);
      }
    };

    const attach = () => {
      if (attached) return;
      window.addEventListener("pointermove", onMove, { passive: true });
      attached = true;
    };
    const detach = () => {
      if (!attached) return;
      window.removeEventListener("pointermove", onMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      pending = false;
      attached = false;
      // Reset any previously-written offsets so surfaces snap to rest.
      const els = document.querySelectorAll<HTMLElement>(
        "[data-lg-parallax], .lg-parallax",
      );
      els.forEach((el) => {
        el.style.setProperty("--lg-px", "0px");
        el.style.setProperty("--lg-py", "0px");
      });
    };

    const sync = () => {
      if (reducedQuery?.matches) detach();
      else attach();
    };

    sync();
    reducedQuery?.addEventListener?.("change", sync);

    return () => {
      reducedQuery?.removeEventListener?.("change", sync);
      detach();
    };
  }, []);
}
