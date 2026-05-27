import { useMemo } from "react";
import { motion } from "framer-motion";
import { VIBES } from "./VibeCheckSection";

// ── Speed categories ───────────────────────────────────────────────────────
const SPICY = new Set(["romantic", "angry", "horny", "pissed-off"]);
const WARM  = new Set(["happy", "cozy", "hungry", "hangry", "nervous", "scared", "brave"]);
// Everything else → CHILL  (calm, tired, sad, high, sick, exhausted, sleepy, sore, …)

function getSpeed(id: string): number {
  if (SPICY.has(id)) return 2.0;
  if (WARM.has(id))  return 3.8;
  return 6.5;
}

// ── TetherAura ─────────────────────────────────────────────────────────────
// Renders a 2 px glowing border that travels around the app-shell perimeter,
// reflecting the partner's current vibe in color + speed.
// Must be placed as a *direct child* of a `position: relative` container.
export function TetherAura({ vibeId }: { vibeId: string | null }) {
  const vibe = useMemo(
    () => (vibeId ? (VIBES.find(v => v.id === vibeId) ?? null) : null),
    [vibeId],
  );

  // No vibe set → no aura (caller handles AnimatePresence)
  if (!vibe) return null;

  const { color, glow } = vibe;
  const speed  = getSpeed(vibe.id);
  const isWarm = WARM.has(vibe.id);

  // Conic-gradient: bright "comet" spot (about 22% of perimeter) on transparent field
  const gradient = [
    "conic-gradient(",
    "from 0deg,",
    "transparent 0%,",
    "transparent 36%,",
    `${color}55 41%,`,
    `${color}   47%,`,
    "#ffffff      50%,",
    `${color}   53%,`,
    `${color}55 59%,`,
    "transparent 64%,",
    "transparent 100%",
    ")",
  ].join(" ");

  // ── Shared mask that carves out a 2 px ring from the container ──────────
  // Two linear-gradient masks combined with "exclude" (Firefox) / "xor" (WebKit)
  // show only the outer 2 px ring of the element.
  const maskShared = {
    // WebKit (Chrome, Safari, iOS)
    WebkitMask:            "linear-gradient(#fff, #fff), linear-gradient(#fff, #fff)",
    WebkitMaskSize:        "100% 100%, calc(100% - 4px) calc(100% - 4px)",
    WebkitMaskPosition:    "0 0, 2px 2px",
    WebkitMaskRepeat:      "no-repeat",
    WebkitMaskComposite:   "xor",
    // Firefox
    mask:                  "linear-gradient(#fff, #fff), linear-gradient(#fff, #fff)",
    maskSize:              "100% 100%, calc(100% - 4px) calc(100% - 4px)",
    maskPosition:          "0 0, 2px 2px",
    maskRepeat:            "no-repeat",
    maskComposite:         "exclude",
  } as React.CSSProperties;

  return (
    <>
      {/* ── Traveling conic-gradient border ──────────────────────── */}
      {/* filter: drop-shadow is applied AFTER the mask, so it glows  */}
      {/* around the 2 px ring → OLED bloom bleeding onto black pixels */}
      <motion.div
        style={{
          position:      "absolute",
          inset:         0,
          pointerEvents: "none",
          zIndex:        9997,
          overflow:      "hidden",
          ...maskShared,
          filter: [
            `drop-shadow(0 0  5px ${glow})`,
            `drop-shadow(0 0 14px ${color}70)`,
            `drop-shadow(0 0 28px ${color}38)`,
          ].join(" "),
        }}
        // Warm vibes breathe in opacity
        animate={{ opacity: isWarm ? [0.72, 1.0, 0.72] : 1 }}
        transition={
          isWarm
            ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
            : {}
        }
      >
        {/* Rotating gradient — 200 % square centered so corners are always covered */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{
            duration:   speed,
            repeat:     Infinity,
            ease:       "linear",
            repeatType: "loop",
          }}
          style={{
            position:   "absolute",
            width:      "200%",
            height:     "200%",
            top:        "-50%",
            left:       "-50%",
            background: gradient,
            willChange: "transform",
            // Explicit GPU layer — prevents repaint on rotation
            transform:  "translateZ(0)",
          }}
        />
      </motion.div>

      {/* ── Static ambient glow (always-on halo around the ring) ──── */}
      <div
        style={{
          position:      "absolute",
          inset:         0,
          pointerEvents: "none",
          zIndex:        9996,
          boxShadow: [
            `inset 0 0 0 1.5px ${color}42`,
            `inset 0 0 20px 2px  ${color}1a`,
            `inset 0 0 48px 8px  ${color}0c`,
          ].join(", "),
        }}
      />
    </>
  );
}
