import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls, AnimatePresence } from "framer-motion";

/**
 * LoveYouSendAnimation — a "living glass heart" pulse animation
 * for the Home screen's Love-You action.  Encapsulates the entire
 * visual treatment (orb capsule, layered heart, ripple, particles,
 * resting breathing) behind a small controlled-component API:
 *
 *   <LoveYouSendAnimation
 *     isSending={busy}
 *     onFinished={() => setBusy(false)}
 *     onTap={handleTap}
 *     message="Love You"
 *   />
 *
 * The component renders an orb at all times.  When `isSending`
 * goes truthy it runs the send choreography exactly once, then
 * fires `onFinished`.  When idle it plays a subtle breathing
 * scale loop (1 ↔ 1.025 over 4 s) so the orb feels alive.
 *
 * All visual styling is driven by the existing Liquid Glass
 * tokens (`--lg-blur-strong`, `--lg-radius-xl`, `--lg-shadow-elevated`,
 * `--lg-accent-primary`) so the orb sits naturally next to the
 * dock and other glass surfaces.  CSS class names are scoped under
 * `.lyo-*` (Love You Orb) to avoid collisions.
 *
 * Reduced-motion: when the user has `prefers-reduced-motion: reduce`
 * the breathing loop is disabled and the send animation degrades
 * to a single 320 ms gentle scale (1 → 1.04 → 1) with no particles,
 * no ripple, no flash.
 */

export interface LoveYouSendAnimationProps {
  /** When true, run the send choreography once. */
  isSending: boolean;
  /** Fires after the choreography finishes (idle path AND reduced
   *  path call this). */
  onFinished?: () => void;
  /** Tap handler — wire this to your existing send logic. */
  onTap?: () => void;
  /** Caption inside the orb (e.g. "Love You"). */
  message?: string;
  /** Pixel size of the orb (default 176, matches the 11rem button). */
  size?: number;
  /** Disable taps (e.g. while the parent is in its "done" state). */
  disabled?: boolean;
  /** Override the accent color (default Tether crimson). */
  accent?: string;
}

// Six particles emitted on a slight upward bias around the orb.
// Pre-computed at module scope so the array is stable across renders.
const PARTICLE_COUNT = 6;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  // Spread the angles across the top arc, biased upward
  const t = i / (PARTICLE_COUNT - 1); // 0..1
  const angle = -Math.PI / 2 + (t - 0.5) * Math.PI * 0.9; // -126° .. -54°
  const distance = 90 + (i % 2) * 20;
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance - 12,
    delay: i * 0.045,
    rotate: (i % 2 === 0 ? -1 : 1) * (15 + i * 4),
    scale: 0.7 + (i % 3) * 0.15,
  };
});

export function LoveYouSendAnimation({
  isSending,
  onFinished,
  onTap,
  message = "Love You",
  size = 176,
  disabled = false,
  accent = "var(--lg-accent-primary)",
}: LoveYouSendAnimationProps) {
  const orbCtrl    = useAnimationControls();
  const flashCtrl  = useAnimationControls();
  const rippleCtrl = useAnimationControls();
  const heartCtrl  = useAnimationControls();
  const glowCtrl   = useAnimationControls();
  const [emitParticles, setEmitParticles] = useState(false);

  // Reduced-motion preference (stateful so we can fork the
  // choreography, ref'd so async effects read the freshest value).
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

  // ── Resting breathing loop ──────────────────────────────────────
  // Runs whenever NOT sending and reduced-motion is off.  4 s
  // cycle, ±2.5 % scale so the orb gently swells like a heartbeat
  // without distracting from the rest of the screen.
  useEffect(() => {
    if (reduced) {
      orbCtrl.set({ scale: 1 });
      return;
    }
    if (isSending) return;
    orbCtrl.start({
      scale: [1, 1.025, 1],
      transition: { duration: 4, repeat: Infinity, ease: "easeInOut" },
    });
  }, [reduced, isSending, orbCtrl]);

  // ── Send choreography ──────────────────────────────────────────
  // Fires exactly once per `isSending` rising edge.  Sequenced with
  // an async function so each step naturally awaits the previous —
  // the timeline reads top-to-bottom matching the brief.
  //
  // Edge-safety: each invocation gets a monotonic `runId`.  Async
  // steps check it before advancing — if a newer run starts (or
  // the parent unmounts), the older run aborts at its next await
  // boundary and we explicitly `.stop()` every control so no
  // half-finished tween keeps writing to the orb.  This matters
  // because the parent could flip `isSending` true → false → true
  // faster than a 1 s choreography would naturally finish.
  const runIdRef = useRef(0);
  useEffect(() => {
    if (!isSending) return;
    const myRun = ++runIdRef.current;
    const isCurrent = () => runIdRef.current === myRun;

    (async () => {
      // Reduced-motion fallback — single gentle scale, no particles,
      // no ripple, no flash.
      if (reducedRef.current) {
        await orbCtrl.start({
          scale: [1, 1.04, 1],
          transition: { duration: 0.32, ease: "easeOut" },
        });
        if (isCurrent()) onFinished?.();
        return;
      }

      // 1) Compress — orb dips slightly to absorb the press.
      await orbCtrl.start({
        scale: 0.9,
        transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
      });
      if (!isCurrent()) return;

      // 2) Burst — fire all the visual effects in PARALLEL so they
      //    feel like one synchronised beat (no awaits between them).
      flashCtrl.start({
        opacity: [0, 0.95, 0],
        transition: { duration: 0.34, times: [0, 0.25, 1], ease: "easeOut" },
      });
      rippleCtrl.start({
        scale:   [0.85, 2.10],
        opacity: [0.85, 0],
        transition: { duration: 0.42, ease: [0.20, 0, 0.45, 1] },
      });
      glowCtrl.start({
        opacity: [0.55, 1, 0.55],
        scale:   [1, 1.25, 1],
        transition: { duration: 0.5, times: [0, 0.4, 1], ease: "easeOut" },
      });
      heartCtrl.start({
        scale: [1, 1.30, 1],
        transition: { duration: 0.45, times: [0, 0.45, 1], ease: "easeOut" },
      });
      setEmitParticles(true);

      // Concurrently expand the orb past resting scale, with a
      // springy overshoot for that "just popped" feel.
      await orbCtrl.start({
        scale: 1.15,
        transition: { duration: 0.18, ease: [0.34, 1.56, 0.64, 1] },
      });
      if (!isCurrent()) return;

      // 3) Settle — spring back to resting scale.  Hand-tuned for
      //    one tiny bounce, which is what the brief calls a "soft
      //    breathing" landing.
      await orbCtrl.start({
        scale: 1,
        transition: { type: "spring", stiffness: 220, damping: 18 },
      });
      if (!isCurrent()) return;

      // 4) Cleanup — stop emitting particles and call back.  The
      //    breathing useEffect above will pick the loop back up
      //    once `isSending` flips false in the parent.
      setEmitParticles(false);
      onFinished?.();
    })();

    // On unmount or `isSending` change mid-flight, bump the run-id
    // so the in-flight async function aborts at its next await,
    // and stop every control so no stale tween keeps writing.
    return () => {
      runIdRef.current++;
      orbCtrl.stop();
      flashCtrl.stop();
      rippleCtrl.stop();
      glowCtrl.stop();
      heartCtrl.stop();
      setEmitParticles(false);
    };
  }, [isSending, orbCtrl, flashCtrl, rippleCtrl, glowCtrl, heartCtrl, onFinished]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div
      className="lyo-stage"
      style={{
        position: "relative",
        width: size,
        height: size,
        // Set the accent CSS var on the stage so all child layers
        // (glow, ripple, particles, heart) read from it.  Lets
        // callers theme a single instance without touching CSS.
        ["--lyo-accent" as never]: accent,
      }}
    >
      {/* ── Ripple ring — single expanding stroke ─────────────── */}
      <motion.div
        className="lyo-ripple"
        initial={{ opacity: 0, scale: 0.85 }}
        animate={rippleCtrl}
        aria-hidden="true"
      />

      {/* ── Heart particles — 6 mini hearts drift up + blur ──── */}
      <AnimatePresence>
        {emitParticles && PARTICLES.map((p, i) => (
          <motion.span
            key={i}
            className="lyo-particle"
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, filter: "blur(0px)", rotate: 0 }}
            animate={{
              x:       p.dx,
              y:       p.dy,
              opacity: [0, 1, 0],
              scale:   [0.4, p.scale, p.scale * 0.8],
              filter:  ["blur(0px)", "blur(0px)", "blur(4px)"],
              rotate:  p.rotate,
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.95,
              delay:    p.delay,
              ease:     [0.22, 0.61, 0.36, 1],
              times:    [0, 0.25, 1],
            }}
            aria-hidden="true"
          >
            ♥
          </motion.span>
        ))}
      </AnimatePresence>

      {/* ── The orb itself ───────────────────────────────────── */}
      <motion.button
        type="button"
        onClick={onTap}
        disabled={disabled || isSending}
        animate={orbCtrl}
        whileTap={reduced ? undefined : { scale: 0.96 }}
        className="lyo-orb liquid-refract-edge"
        aria-label={message}
        style={{ cursor: disabled || isSending ? "default" : "pointer" }}
      >
        {/* Inner soft glow core — pulses with the beat. */}
        <motion.span
          className="lyo-glow"
          initial={{ opacity: 0.55, scale: 1 }}
          animate={glowCtrl}
          aria-hidden="true"
        />

        {/* Bright flash burst — only visible at peak of pulse. */}
        <motion.span
          className="lyo-flash"
          initial={{ opacity: 0 }}
          animate={flashCtrl}
          aria-hidden="true"
        />

        {/* Specular highlight band — drifts subtly with parallax. */}
        <span className="lyo-sheen" data-lg-parallax aria-hidden="true" />

        {/* Layered heart: outer halo + outline + bright core. */}
        <motion.span className="lyo-heart" animate={heartCtrl}>
          <span className="lyo-heart-halo">♥</span>
          <span className="lyo-heart-fill">♥</span>
          <span className="lyo-heart-core">♥</span>
        </motion.span>

        {message && (
          <span className="lyo-label">{message}</span>
        )}
      </motion.button>
    </div>
  );
}
