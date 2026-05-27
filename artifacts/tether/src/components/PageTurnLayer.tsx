import { motion, useTransform, type MotionValue } from "framer-motion";
import type { ReactNode } from "react";
import type { TurnDirection } from "@/hooks/usePageTurn";

/**
 * PageTurnLayer — visual renderer for the Scrapbook book's page
 * stack.  Composes three Z-layers:
 *
 *   z = 1  destination spread (revealed behind the flipping page)
 *   z = 2  static current spread (whichever side is NOT flipping)
 *   z = 3  the flipping page itself (rotateY around its spine edge,
 *          with a curl-gradient overlay that intensifies near 90°)
 *
 * The component is fully controlled — it doesn't own any state
 * apart from the derived `flipRotation` / `curlOpacity` motion
 * values.  Render as a child of `.scrapbook-book` (which provides
 * the perspective and pads the inner area).
 *
 * Reduced-motion: when `reduced` is true, the rotating page is
 * suppressed and a simple opacity crossfade overlays the
 * destination spread instead — preserving navigation feedback
 * without inducing motion sickness.
 */
export interface PageTurnLayerProps {
  currentLeft:  ReactNode;
  currentRight: ReactNode;
  /** Adjacent spreads — null when at book boundary. */
  nextLeft:     ReactNode | null;
  nextRight:    ReactNode | null;
  prevLeft:     ReactNode | null;
  prevRight:    ReactNode | null;
  /** From `usePageTurn`. */
  rotation:  MotionValue<number>;
  direction: TurnDirection | null;
  reduced:   boolean;
}

export function PageTurnLayer({
  currentLeft, currentRight,
  nextLeft, nextRight,
  prevLeft, prevRight,
  rotation, direction, reduced,
}: PageTurnLayerProps) {
  // Forward turn: rotation goes 0 → -180.
  // Backward turn: rotation goes 0 → +180.
  // Both map directly onto the flipping panel's rotateY.
  const flipRotation = useTransform(rotation, (r) => r);

  // Curl highlight peaks at ±90° (page is edge-on, catching the
  // most light).  sin(angle) gives a clean 0 → 1 → 0 envelope.
  const curlOpacity = useTransform(rotation, (r) =>
    Math.min(1, Math.abs(Math.sin((r * Math.PI) / 180)) * 0.85));

  // Reduced-motion crossfade: opacity tracks |angle| / 180.
  const fadeOpacity = useTransform(rotation, (r) =>
    direction ? Math.min(1, Math.abs(r) / 180) : 0);

  // Decide which adjacent spread is the destination.
  const destLeft  = direction === "next" ? nextLeft  : direction === "prev" ? prevLeft  : null;
  const destRight = direction === "next" ? nextRight : direction === "prev" ? prevRight : null;

  return (
    <>
      {/* ── Layer 1 — destination spread underneath the flip ── */}
      {direction !== null && (
        <>
          <div className="scrapbook-page scrapbook-page-left  scrapbook-flip-bg">{destLeft }</div>
          <div className="scrapbook-page scrapbook-page-right scrapbook-flip-bg">{destRight}</div>
        </>
      )}

      {/* ── Layer 2 — static current spread (non-flipping half) ── */}
      {/* Forward turn: keep LEFT static (right is flipping).
       * Backward turn: keep RIGHT static (left is flipping).
       * Idle: render BOTH static (no flip in progress). */}
      {direction !== "prev" && (
        <div className="scrapbook-page scrapbook-page-left scrapbook-flip-static">{currentLeft }</div>
      )}
      {direction !== "next" && (
        <div className="scrapbook-page scrapbook-page-right scrapbook-flip-static">{currentRight}</div>
      )}

      {/* ── Layer 3 — the flipping page (3D rotateY) ── */}
      {direction !== null && !reduced && (
        <motion.div
          className={`scrapbook-flip-page ${
            direction === "next" ? "scrapbook-flip-page--right" : "scrapbook-flip-page--left"
          }`}
          style={{ rotateY: flipRotation }}
          aria-hidden="true"
        >
          {/* Front face — the page being lifted off. */}
          <div className="scrapbook-flip-face scrapbook-flip-face--front scrapbook-page">
            {direction === "next" ? currentRight : currentLeft }
          </div>
          {/* Back face — the new page revealed underneath. */}
          <div className="scrapbook-flip-face scrapbook-flip-face--back scrapbook-page">
            {direction === "next" ? destLeft  : destRight}
          </div>
          {/* Curl overlay — bright on outer edge, shadow on spine
           * edge.  Painted on FRONT face only (so it only shows
           * while the front is facing the camera). */}
          <motion.div
            className="scrapbook-flip-curl"
            style={{ opacity: curlOpacity }}
            aria-hidden="true"
          />
        </motion.div>
      )}

      {/* ── Reduced-motion fallback — destination crossfades in ── */}
      {direction !== null && reduced && (
        <motion.div
          className="scrapbook-flip-fade"
          style={{ opacity: fadeOpacity }}
          aria-hidden="true"
        >
          <div className="scrapbook-page scrapbook-page-left ">{destLeft }</div>
          <div className="scrapbook-page scrapbook-page-right">{destRight}</div>
        </motion.div>
      )}
    </>
  );
}
