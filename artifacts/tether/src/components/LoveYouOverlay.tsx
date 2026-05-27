import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { haptic, hapticLoop } from "@/lib/haptics";
import { playSound } from "@/lib/audioManager";

/**
 * LoveYouOverlay — full-screen cinematic reveal for an incoming
 * Love-You.  Sequence:
 *
 *   incoming → inflate → pulsing → dismissed
 *
 *   1. INCOMING  — small light point near the bottom dock travels
 *                  along a curved path to screen center, scaling
 *                  0 → 0.6 with a soft trailing streak.
 *   2. INFLATE   — point inflates into the Liquid Glass heart orb
 *                  with an inner liquid-ripple and quick scale-up.
 *   3. PULSING   — orb breathes (1 → 1.05 → 1, 900 ms loop).  Copy
 *                  ("Love from {sender}" + optional message + CTA)
 *                  fades in.  6–10 mini hearts orbit the orb for
 *                  ~1.6 s then fade.
 *   4. DISMISSED — fades the whole overlay; calls onDismiss().
 *
 * Reuses the `.lyo-*` orb styling from LoveYouSendAnimation so
 * the visual identity is consistent across send/receive flows.
 *
 * Reduced-motion: the path/particles/inflate are replaced by a
 * single fade-in + a one-shot 1 → 1.04 → 1 bump on the orb.
 *
 * A11y: role="dialog", aria-modal, aria-labelledby; the hidden
 * live region announces "New Love You from {name}"; primary CTA
 * receives focus on mount; Escape key dismisses.
 */

export interface LoveYouOverlayProps {
  /** Display name of the partner who sent the message. */
  senderName: string;
  /** Optional message body to render under the orb. */
  message?: string;
  /** Fired when the user dismisses (tap orb / CTA / Escape). */
  onDismiss: () => void;
}

type Phase = "incoming" | "inflate" | "pulsing" | "dismissed";

// Orbiting particle configuration — 8 mini hearts evenly spaced
// around a 130 px circle.  Pre-computed at module scope so the
// array is stable across renders.
const ORBIT_COUNT = 8;
const ORBIT_RADIUS = 130;
const ORBITERS = Array.from({ length: ORBIT_COUNT }, (_, i) => {
  const angle = (i / ORBIT_COUNT) * Math.PI * 2;
  return {
    x: Math.cos(angle) * ORBIT_RADIUS,
    y: Math.sin(angle) * ORBIT_RADIUS,
    scale: 0.45 + (i % 3) * 0.12,
    delay: i * 0.05,
  };
});

const PLAYFAIR  = { fontFamily: "'Playfair Display', serif" } as const;
const QUICKSAND = { fontFamily: "'Quicksand', sans-serif" } as const;

export function LoveYouOverlay({ senderName, message, onDismiss }: LoveYouOverlayProps) {
  const [phase, setPhase] = useState<Phase>("incoming");
  const orbCtrl = useAnimationControls();
  const ctaRef  = useRef<HTMLButtonElement | null>(null);

  // Reduced-motion preference (read once on mount; this overlay
  // mounts/unmounts per message so re-evaluating mid-flight isn't
  // worth the complexity).
  const reducedRef = useRef(false);
  useEffect(() => {
    reducedRef.current =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  // ── Phase machine ──────────────────────────────────────────────
  // Schedules the timeline as cancellable timeouts.  Reduced-motion
  // collapses the whole sequence to "pulsing" instantly.
  useEffect(() => {
    const reduced = reducedRef.current;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let stopHeartbeat: (() => void) | null = null;

    if (reduced) {
      // Skip the path & inflate; jump straight to a single bump
      // on the orb and the resting state.
      setPhase("pulsing");
      orbCtrl.start({
        scale: [1, 1.04, 1],
        transition: { duration: 0.4, ease: "easeOut" },
      });
      haptic("medium");
    } else {
      // 0 ms: incoming travel begins.  Initial haptic = "envelope"
      // so it matches the previous receiver experience.
      haptic("envelope");
      // 900 ms: orb arrives → inflate phase, sound + medium haptic.
      timeouts.push(setTimeout(() => {
        setPhase("inflate");
        playSound("shimmer");
        haptic("medium");
      }, 900));
      // 1300 ms: pulsing begins.  Start the heartbeat loop so the
      // user *feels* the heart, synced to the visual breathing.
      timeouts.push(setTimeout(() => {
        setPhase("pulsing");
        stopHeartbeat = hapticLoop("heartbeat", 1800);
        // Heartbeat-shaped breathing on the orb itself.
        orbCtrl.start({
          scale: [1, 1.05, 1],
          transition: { duration: 0.95, repeat: Infinity, ease: "easeInOut" },
        });
        // Move focus to the CTA for keyboard / screen reader users
        // (only after pulsing — earlier would steal the entry).
        ctaRef.current?.focus({ preventScroll: true });
      }, 1300));
    }

    return () => {
      timeouts.forEach(clearTimeout);
      stopHeartbeat?.();
      orbCtrl.stop();
    };
  }, [orbCtrl]);

  // ── Dismiss logic ──────────────────────────────────────────────
  // Plays a quick fade then calls onDismiss.  Idempotent across
  // multiple taps; cleanup-safe across unmount during the fade
  // (the timer is tracked + cleared, and a mounted-ref gates the
  // callback so a late firing can't invoke a stale onDismiss).
  //
  // Escape closure-safety: the latest `onDismiss` is held in a
  // ref so the once-attached keydown listener always reads the
  // freshest prop without rebinding.
  const dismissingRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);
  useEffect(() => () => {
    mountedRef.current = false;
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  function handleDismiss() {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    setPhase("dismissed");
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      if (mountedRef.current) onDismissRef.current?.();
    }, 420);
  }

  // Escape key dismissal — listener bound once, reads latest
  // handleDismiss via the refs above (so no stale-closure risk).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleDismiss is a stable closure over refs, so deliberately
    // omitted from deps to avoid re-binding the listener.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showOrb = phase === "inflate" || phase === "pulsing";
  const showCopy = phase === "pulsing";

  return (
    <motion.div
      className="lyov-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lyov-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === "dismissed" ? 0 : 1 }}
      transition={{ duration: phase === "dismissed" ? 0.4 : 0.32, ease: "easeOut" }}
    >
      {/* Hidden live region — screen readers will pick this up
       * regardless of focus order. */}
      <span className="sr-only" aria-live="polite">
        New Love You from {senderName}
      </span>

      {/* ── Travelling light point + trail (incoming phase) ──── */}
      <AnimatePresence>
        {phase === "incoming" && (
          <motion.div
            key="travel"
            className="lyov-travel"
            // Three keyframes describe the curved path: launch
            // slightly off-axis at the bottom, drift inward at
            // mid-rise, settle at center.  Combined with the
            // bezier ease this reads as a soft curved arc.
            initial={{ x: 32,  y: 220, scale: 0,    opacity: 0 }}
            animate={{
              x:       [32, -18, 0],
              y:       [220, 100, 0],
              scale:   [0, 0.45, 0.6],
              opacity: [0, 1, 1],
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{
              duration: 0.9,
              times:    [0, 0.55, 1],
              ease:     [0.25, 0.46, 0.45, 0.94],
            }}
            aria-hidden="true"
          >
            <span className="lyov-spark" />
            <span className="lyov-trail" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Heart orb (inflate + pulsing) ─────────────────────── */}
      <AnimatePresence>
        {showOrb && (
          <motion.div
            key="orb"
            className="lyov-orb-wrap"
            // Inflate: scale-up from the travelling point's final
            // scale (0.6) past 1.0 with a small overshoot, then
            // settle.  Opacity rises in lockstep.
            initial={{ scale: reducedRef.current ? 1 : 0.6, opacity: reducedRef.current ? 0 : 0.65 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{    scale: 0.96, opacity: 0 }}
            transition={{
              type:      "spring",
              stiffness: reducedRef.current ? 200 : 260,
              damping:   reducedRef.current ? 30  : 18,
              mass:      0.9,
            }}
          >
            {/* Outer ripple — fires once on inflate to sell the
             * "liquid forms" cue.  Static markup; the CSS
             * keyframe runs on mount only. */}
            <span className="lyov-form-ripple" aria-hidden="true" />

            {/* Tappable orb (re-uses .lyo-* classes from the
             * sender component for visual consistency).  We wrap
             * in `.lyo-stage` to inherit the accent CSS var. */}
            <div className="lyo-stage" style={{ width: 220, height: 220 }}>
              {/* Orbiting particles — full circle for one revolution
               * then fade.  We rotate the WRAPPER and position
               * each child at a fixed offset, so 8 transforms
               * become 1 rotation + 8 translates. */}
              {showCopy && !reducedRef.current && (
                <motion.div
                  className="lyov-orbit"
                  initial={{ rotate: 0, opacity: 0 }}
                  animate={{ rotate: 360, opacity: [0, 1, 1, 0] }}
                  transition={{
                    rotate:  { duration: 1.8, ease: "linear" },
                    opacity: { duration: 1.8, times: [0, 0.15, 0.7, 1] },
                  }}
                  aria-hidden="true"
                >
                  {ORBITERS.map((o, i) => (
                    <span
                      key={i}
                      className="lyov-orbiter"
                      style={{
                        transform: `translate(${o.x}px, ${o.y}px) scale(${o.scale})`,
                      }}
                    >
                      ♥
                    </span>
                  ))}
                </motion.div>
              )}

              <motion.button
                type="button"
                className="lyo-orb liquid-refract-edge lyov-orb"
                animate={orbCtrl}
                onClick={handleDismiss}
                aria-label={`Open Love You from ${senderName}`}
              >
                <span className="lyo-glow" aria-hidden="true" />
                <span className="lyo-sheen" aria-hidden="true" />
                <span className="lyo-heart">
                  <span className="lyo-heart-halo">♥</span>
                  <span className="lyo-heart-fill">♥</span>
                  <span className="lyo-heart-core">♥</span>
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Copy + CTA (pulsing only) ─────────────────────────── */}
      <AnimatePresence>
        {showCopy && (
          <motion.div
            key="copy"
            className="lyov-copy"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{    opacity: 0, y: 8 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: reducedRef.current ? 0.1 : 0.15 }}
          >
            <p id="lyov-title" className="lyov-title" style={PLAYFAIR}>
              Love from {senderName}
            </p>
            {message && (
              <p className="lyov-message" style={QUICKSAND}>
                {message}
              </p>
            )}
            <button
              ref={ctaRef}
              type="button"
              className="lyov-cta"
              onClick={handleDismiss}
              style={QUICKSAND}
            >
              Open in Love You
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
