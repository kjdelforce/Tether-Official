import { useCallback, useEffect, useRef, useState } from "react";
import { animate, useMotionValue, type MotionValue } from "framer-motion";
import type React from "react";

/**
 * usePageTurn — physical page-turn state machine for the Scrapbook
 * landscape book.  Handles three input modes:
 *
 *   1. Pointer drag (left/right swipe across the book or
 *      tap-and-drag from an outer edge).
 *   2. Tap on outer corners (handled by the parent — call
 *      `turnNext()` / `turnPrev()` when the corner is clicked).
 *   3. Keyboard left/right arrow keys (registered globally while
 *      the hook is mounted).
 *
 * Visual model: the hook owns ONE motion value, `rotation`, in
 * degrees:
 *
 *     rotation ∈ (-180, 0]     → forward turn (right page flipping
 *                                  over to the left stack)
 *     rotation = 0             → at rest (no turn in progress)
 *     rotation ∈ (0, +180]     → backward turn (left page flipping
 *                                  over to the right stack)
 *
 * Direction state (`direction`) tells consumers which face of
 * which page is the active "flipping page".  When `direction` is
 * `null`, no flip is happening — render the static spread only.
 *
 * On release, the hook decides whether to commit the turn or
 * snap back, based on a combination of distance ratio (>= 35 %)
 * and release velocity (|v| > 0.4 px/ms), then animates the
 * rotation to either ±180 (commit) or 0 (cancel) using a spring
 * that lands in ~ 350-600 ms — the brief's target window.
 *
 * Reduced-motion: when the user has `prefers-reduced-motion: reduce`,
 * the hook still mutates state but skips the spring (sets the final
 * rotation instantly).  Consumers should also check the returned
 * `reduced` flag to decide whether to render the 3D curl or fall
 * back to a crossfade.
 */
export type TurnDirection = "next" | "prev";

export interface UsePageTurnOptions {
  /** Total number of two-page spreads in the book. */
  totalSpreads: number;
  /** Index of the spread currently visible.  Single source of truth. */
  spreadIndex: number;
  /** Called when a turn commits — parent should advance state by ±1. */
  onSpreadChange: (next: number) => void;
  /** Approximate book width in px — used to map drag → angle.
   *  Defaults to 800. */
  bookWidth?: number;
}

export interface UsePageTurnReturn {
  rotation: MotionValue<number>;
  direction: TurnDirection | null;
  phase: "idle" | "dragging" | "settling";
  isAnimating: boolean;
  reduced: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp:   (e: React.PointerEvent) => void;
  turnNext: () => void;
  turnPrev: () => void;
}

export function usePageTurn(opts: UsePageTurnOptions): UsePageTurnReturn {
  const { totalSpreads, spreadIndex, onSpreadChange, bookWidth = 800 } = opts;

  const rotation = useMotionValue(0);
  const [direction, setDirection] = useState<TurnDirection | null>(null);
  const [phase, setPhase] = useState<"idle" | "dragging" | "settling">("idle");
  const [isAnimating, setIsAnimating] = useState(false);

  const dragStart = useRef({ x: 0, t: 0 });

  // Reduced-motion preference — both stateful (so consumers can
  // re-render the curl vs crossfade fork) and ref'd (so the
  // animate() callbacks read the freshest value without stale
  // closure issues).
  const reducedRef = useRef(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const sync = () => { reducedRef.current = mq.matches; setReduced(mq.matches); };
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  /**
   * Drive the rotation to `target` (0, -180, or +180).  When the
   * spring completes, run `onDone` synchronously so the parent can
   * advance the spread index AND we can reset the rotation back to
   * 0 in the same paint frame (no visible snap).
   */
  const settleTo = useCallback((target: number, onDone?: () => void) => {
    setPhase("settling");
    setIsAnimating(true);
    if (reducedRef.current) {
      // Reduced-motion path — drive a short linear tween so the
      // PageTurnLayer's crossfade fallback (which keys off
      // `direction !== null` AND tracks |rotation| / 180) has a
      // visible window to animate.  Without this the direction
      // would clear synchronously and users with reduced-motion
      // would see an instant snap with no transition feedback.
      animate(rotation, target, {
        duration: 0.25,
        ease: "easeInOut",
        onComplete: () => {
          onDone?.();
          setIsAnimating(false);
          setPhase("idle");
          setDirection(null);
        },
      });
      return;
    }
    animate(rotation, target, {
      type: "spring",
      stiffness: 220,
      damping: 28,
      mass: 0.9,
      onComplete: () => {
        onDone?.();
        setIsAnimating(false);
        setPhase("idle");
        setDirection(null);
      },
    });
  }, [rotation]);

  const turnNext = useCallback(() => {
    if (isAnimating || spreadIndex + 1 >= totalSpreads) return;
    setDirection("next");
    rotation.set(0);
    settleTo(-180, () => { onSpreadChange(spreadIndex + 1); rotation.set(0); });
  }, [isAnimating, spreadIndex, totalSpreads, settleTo, onSpreadChange, rotation]);

  const turnPrev = useCallback(() => {
    if (isAnimating || spreadIndex <= 0) return;
    setDirection("prev");
    rotation.set(0);
    settleTo(180, () => { onSpreadChange(spreadIndex - 1); rotation.set(0); });
  }, [isAnimating, spreadIndex, settleTo, onSpreadChange, rotation]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isAnimating) return;
    // Only react to primary pointer (button = 0) or touch.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStart.current = { x: e.clientX, t: performance.now() };
    setPhase("dragging");
    // Direction is decided once dx exceeds a tiny threshold in
    // pointermove — leave it null at start so a tap with no drag
    // doesn't accidentally engage a turn.
    setDirection(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [isAnimating]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (phase !== "dragging") return;
    const dx = e.clientX - dragStart.current.x;
    if (Math.abs(dx) < 4) return;   // tap-tolerance dead-zone

    // Decide direction from drag sign on first qualifying move.
    let dir: TurnDirection | null = direction;
    if (!dir) {
      dir = dx < 0 ? "next" : "prev";
      // Reject if the user can't go that way.
      if (dir === "next" && spreadIndex + 1 >= totalSpreads) return;
      if (dir === "prev" && spreadIndex <= 0) return;
      setDirection(dir);
    }

    // Map drag distance to angle, then **clamp to direction**.
    // Without this clamp a user who reverses their drag mid-turn
    // could push the angle to the opposite sign (e.g. dragging
    // right while `direction === "next"`), which would flicker
    // the wrong destination spread under the flip and snap to an
    // unintended target on release.  Locking the sign keeps the
    // motion physical: once you've started turning a page, you
    // can ease it back toward zero but you can't accidentally
    // flip the *other* page until you release and start a new
    // gesture.
    const ratio = Math.max(-1, Math.min(1, dx / bookWidth));
    let angle = ratio * 180;
    if (direction === "next") angle = Math.min(0, angle);
    if (direction === "prev") angle = Math.max(0, angle);
    rotation.set(angle);
  }, [phase, direction, rotation, bookWidth, spreadIndex, totalSpreads]);

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    if (phase !== "dragging") return;
    const angle = rotation.get();
    const dx = angle * (bookWidth / 180);
    const dt = Math.max(1, performance.now() - dragStart.current.t);
    const v = dx / dt; // px/ms
    const distRatio = Math.abs(angle) / 180;
    const fastEnough = Math.abs(v) > 0.4;

    if (direction === "next") {
      const commit = (distRatio > 0.35 || (fastEnough && v < 0));
      settleTo(commit ? -180 : 0, commit
        ? () => { onSpreadChange(spreadIndex + 1); rotation.set(0); }
        : undefined);
    } else if (direction === "prev") {
      const commit = (distRatio > 0.35 || (fastEnough && v > 0));
      settleTo(commit ?  180 : 0, commit
        ? () => { onSpreadChange(spreadIndex - 1); rotation.set(0); }
        : undefined);
    } else {
      setPhase("idle");
    }
  }, [phase, direction, rotation, bookWidth, settleTo, spreadIndex, onSpreadChange]);

  // Keyboard navigation — left/right arrow keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore if focus is in an input/textarea (lets users type
      // notes without triggering page turns).
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") { e.preventDefault(); turnNext(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); turnPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turnNext, turnPrev]);

  return {
    rotation, direction, phase, isAnimating, reduced,
    onPointerDown, onPointerMove, onPointerUp,
    turnNext, turnPrev,
  };
}
