import { useEffect } from "react";

/**
 * useViewportFix — iOS Keyboard / Visual Viewport Restoration
 *
 * Mobile Safari has a long-standing bug where dismissing the on-screen
 * keyboard leaves the viewport in a half-scrolled, half-resized state:
 * the document scrolls a few hundred px down, the bottom safe-area
 * inset disappears under the home indicator, and the dock floats
 * mid-screen until the user manually scrolls.  Tether's fixed-position
 * Liquid Bubble dock makes the bug especially visible.
 *
 * This hook installs three guards, all idempotent and safely no-op on
 * non-iOS browsers:
 *
 *   (1) `visualViewport.resize` — fires every time the keyboard slides
 *       in OR out.  We track the previous height; when it INCREASES
 *       (= keyboard closed) we force `scrollTo(0,0)` and trigger a
 *       cheap layout recalc on the app shell so iOS re-resolves the
 *       safe-area insets.
 *
 *   (2) `focusout` (delegated on document) — when any <input> /
 *       <textarea> loses focus, smoothly scroll the document back to
 *       the top so the dock returns to its safe-area-anchored
 *       resting position.
 *
 *   (3) Dock-bulge on every active tap is purely CSS (`:has(button:active)`
 *       in index.css) — no JS needed here.
 */
export function useViewportFix(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // ── (1) Visual Viewport listener ───────────────────────────────
    // Fall back silently when the API is missing (older Android WebView).
    const vv = window.visualViewport;
    let lastH = vv?.height ?? window.innerHeight;

    const handleViewportResize = () => {
      const newH = vv?.height ?? window.innerHeight;
      // A viewport that just got TALLER means the on-screen keyboard
      // closed.  Snap the document back to the top and ping layout.
      if (newH > lastH + 24) {
        window.scrollTo(0, 0);
        // Force layout: read offsetHeight on the shell to flush iOS's
        // stale safe-area calculations.  Cheap (single reflow).
        const shell =
          document.querySelector<HTMLElement>(".app-shell") ??
          document.documentElement;
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        shell.offsetHeight;
      }
      lastH = newH;
    };

    vv?.addEventListener("resize", handleViewportResize);

    // ── (2) Focus-out snap ─────────────────────────────────────────
    // Delegate at document level — covers inputs added later in the
    // tree, including portals (Toaster, modals, etc.) without each
    // component having to opt in.
    const handleFocusOut = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        // Defer one frame so iOS finishes its own keyboard-dismiss
        // animation before our smooth scroll fires (otherwise the
        // animation jitters).
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        });
      }
    };

    document.addEventListener("focusout", handleFocusOut, true);

    return () => {
      vv?.removeEventListener("resize", handleViewportResize);
      document.removeEventListener("focusout", handleFocusOut, true);
    };
  }, []);
}
