import React from "react";
import { useGyroTilt } from "@/hooks/useGyroTilt";

/**
 * SpatialCard — wraps any card to give it physical depth.
 *
 *   • 3D tilt driven by the shared `--tilt-x` / `--tilt-y` CSS vars
 *     written by the singleton gyro source.  Smoothed with a 0.2s
 *     cubic-bezier(0.03, 0.98, 0.52, 0.99) transition.
 *   • Global Light Source: 1px rim-light (top-left) + deep-shadow
 *     border (bottom-right) baked into the box-shadow stack.
 *   • Liquid Glass shimmer overlay — a child gradient that translates
 *     INDEPENDENTLY of the card's tilt, creating a parallax glint
 *     that reads as if light were sweeping across a curved lens.
 *   • Optional environmental glow ring (`ambientGlow`).
 */
export interface SpatialCardProps {
  children: React.ReactNode;
  /** Multiplier for tilt strength (0..1). Default 1. */
  intensity?: number;
  /** Extra style merged onto the root */
  style?: React.CSSProperties;
  /** Extra className merged onto the root */
  className?: string;
  /** Optional rgba color used for an environmental glow ring */
  ambientGlow?: string;
  /** Disable the rim/deep-shadow borders (rare) */
  noRim?: boolean;
  /** Border radius — used by the rim light gradient. Default 22px. */
  radius?: number;
  /** Pass-through onClick */
  onClick?: () => void;
  /** Disable the shimmer overlay (rare) */
  noShimmer?: boolean;
}

export function SpatialCard({
  children, intensity = 1, style, className, ambientGlow, noRim,
  radius = 22, onClick, noShimmer,
}: SpatialCardProps) {
  // Mount-once subscriber to the shared gyro source — the actual
  // transform is computed in CSS via calc(var(--tilt-x) * Xdeg).
  useGyroTilt();

  const intStr = String(intensity);

  const rim = noRim ? undefined : [
    "inset 1px 1px 0 rgba(255,255,255,0.40)",   // rim light top-left
    "inset -1px -1px 0 rgba(0,0,0,0.55)",       // deep shadow bottom-right
    "0 14px 40px rgba(0,0,0,0.55)",             // global drop shadow
    ambientGlow ? `0 0 36px 6px ${ambientGlow}` : "",
  ].filter(Boolean).join(", ");

  return (
    <div
      onClick={onClick}
      className={["spatial-card", className].filter(Boolean).join(" ")}
      style={{
        ["--spatial-intensity" as string]: intStr,
        position:        "relative",
        borderRadius:    radius,
        boxShadow:       rim,
        ...style,
      }}
    >
      {children}
      {!noShimmer && <span aria-hidden className="spatial-shimmer" />}
    </div>
  );
}
