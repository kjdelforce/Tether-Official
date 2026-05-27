/**
 * SegmentedAvatar — Mood-reactive avatar with partner-aware interaction system.
 *
 * Uses a single animated PNG (no clip-path tearing) driven by useAnimation
 * controls so animations can be imperatively switched on mood or partner-state
 * changes. Adds a second head-tilt layer for the "look at partner" romantic
 * effect using a soft, almost-invisible top-crop overlay.
 *
 * Interaction states (requires partnerVibeId prop):
 *   mutual-romantic  → both bodies lean toward each other
 *   mutual-happy     → synchronized in-phase bounce
 *   mutual-excited   → synchronized in-phase jump
 *   high-five        → one-shot reach + slap toward partner, then resume
 *   mutual-high      → bodies drift in opposite phase
 */
import React, { useEffect, useRef } from "react";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { VIBES } from "@/components/VibeCheckSection";
import { MoodFX } from "@/components/FullBodyAvatar";

// ── Types ─────────────────────────────────────────────────────────────────────
interface BodyAnim {
  rotate:    number[];
  y?:        number[];
  x?:        number[];
  scale?:    number[];
  origin:    string;
  duration:  number;
  ease?:     string;
  repeatType?: "mirror" | "loop" | "reverse";
}

type Interaction =
  | "mutual-romantic"
  | "mutual-happy"
  | "mutual-excited"
  | "high-five"
  | "mutual-high"
  | null;

// ── Body animation library ─────────────────────────────────────────────────────
const BODY: Record<string, BodyAnim> = {
  // ── Energetic ─────────────────────────────────────────────────────────────
  happy: {
    rotate: [-5, 5, -5],  y: [0, -18, -2, -16, 0],
    x: [-4, 4, -4],       scale: [1, 1.04, 0.97, 1.04, 1],
    origin: "50% 100%",   duration: 0.55,
  },
  excited: {
    rotate: [-7, 7, -7],  y: [0, -26, -4, -22, 0],
    x: [-6, 6, -6],       scale: [1, 1.07, 0.95, 1.06, 1],
    origin: "50% 100%",   duration: 0.40,
  },
  brave: {
    rotate: [-2, 2, -2],  y: [0, -9, 0],
    scale: [1, 1.05, 1],  origin: "50% 100%",  duration: 1.7,
  },
  content: {
    rotate: [-1.5, 1.5, -1.5], y: [0, -5, 0],
    origin: "50% 50%",   duration: 3.6,
  },
  // ── Romantic / Sensual ────────────────────────────────────────────────────
  romantic: {
    rotate: [-3, 3, -3],  y: [0, -6, 0],
    scale: [1, 1.02, 1],  origin: "50% 58%",   duration: 2.8,
  },
  horny: {
    rotate: [-10, 10, -10], x: [-5, 5, -5], y: [0, 4, 0],
    origin: "50% 62%",   duration: 0.44,
  },
  cozy: {
    rotate: [-3, 3, -3],  y: [0, -4, 0],
    origin: "50% 50%",   duration: 3.0,
  },
  // ── Calm ──────────────────────────────────────────────────────────────────
  calm: {
    rotate: [-1.5, 1.5, -1.5], y: [0, -4, 0],
    origin: "50% 50%",   duration: 4.5,
  },
  // ── Angry ─────────────────────────────────────────────────────────────────
  angry: {
    rotate: [-7, 7, -7],  x: [-5, 5, -5], y: [-2, 2, -2],
    origin: "50% 100%",  duration: 0.24,
  },
  "pissed-off": {
    rotate: [-11, 11, -11], x: [-8, 8, -8], y: [-3, 3, -3],
    origin: "50% 100%",  duration: 0.17,
  },
  hangry: {
    rotate: [-6, 6, -6],  x: [-5, 5, -5],
    origin: "50% 100%",  duration: 0.30,
  },
  // ── Tired ─────────────────────────────────────────────────────────────────
  tired: {
    rotate: [0, 7, 0],    y: [0, 9, 0],
    origin: "50% 20%",   duration: 5.0,
  },
  sleepy: {
    rotate: [0, 8, 0],    y: [0, 11, 0],
    origin: "50% 20%",   duration: 5.2,
  },
  exhausted: {
    rotate: [0, 13, 0],   y: [0, 16, 0],
    origin: "50% 20%",   duration: 5.5,
  },
  // ── Intoxicated ───────────────────────────────────────────────────────────
  high: {
    rotate: [-9, 9, -9],  x: [-9, 9, -9], y: [0, -5, 5, 0],
    origin: "50% 50%",   duration: 3.8,  repeatType: "loop",
  },
  drunk: {
    rotate: [-15, 18, -12, 15, -15],
    x: [-10, 13, -8, 11, -10],
    y: [0, 6, 2, 5, 0],
    origin: "50% 90%",   duration: 2.2,  repeatType: "loop",
  },
  hungover: {
    rotate: [3, 8, 3],    y: [4, 12, 4],
    origin: "50% 20%",   duration: 4.2,
  },
  // ── Sad / Negative ────────────────────────────────────────────────────────
  sad: {
    rotate: [2, 7, 2],    y: [3, 12, 3],
    origin: "50% 20%",   duration: 4.5,
  },
  sick: {
    rotate: [-5, 5, -5],  y: [0, 7, 0],
    origin: "50% 30%",   duration: 2.6,
  },
  nervous: {
    rotate: [-3, 3, -3],  x: [-2, 2, -2],
    origin: "50% 50%",   duration: 0.17,
  },
  anxious: {
    rotate: [-3, 3, -3],  x: [-2, 2, -2],
    origin: "50% 50%",   duration: 0.21,
  },
  scared: {
    rotate: [-5, 5, -5],  x: [-4, 4, -4],
    scale: [0.96, 1, 0.96], origin: "50% 100%", duration: 0.26,
  },
  sore: {
    rotate: [1, 3, 1],    y: [0, 6, 0],
    origin: "50% 50%",   duration: 4.2,
  },
  hungry: {
    rotate: [-4, 4, -4],  x: [-3, 3, -3],
    origin: "50% 50%",   duration: 1.0,
  },
  // ── Default idle ──────────────────────────────────────────────────────────
  default: {
    rotate: [-2, 2, -2],  y: [0, -6, 0],
    origin: "50% 50%",   duration: 3.0,
  },
};

// ── Interaction detection ──────────────────────────────────────────────────────
function getInteraction(my: string | null, partner: string | null): Interaction {
  if (!my || !partner || my !== partner) return null;
  if (my === "romantic")  return "mutual-romantic";
  if (my === "high")      return "mutual-high";
  if (my === "happy")     return "high-five";
  if (my === "excited")   return "high-five";
  return null;
}

// ── Helper: start a looping body animation via controls ────────────────────────
function startBodyLoop(
  ctrl: ReturnType<typeof useAnimation>,
  anim: BodyAnim,
  overrides?: Partial<BodyAnim> & { delay?: number },
) {
  ctrl.start({
    rotate: overrides?.rotate ?? anim.rotate,
    y:      overrides?.y      ?? anim.y      ?? [0],
    x:      overrides?.x      ?? anim.x      ?? [0],
    scale:  overrides?.scale  ?? anim.scale  ?? [1],
    transition: {
      duration:   anim.duration,
      repeat:     Infinity,
      repeatType: anim.repeatType ?? "mirror",
      ease:       anim.ease ?? "easeInOut",
      delay:      overrides?.delay ?? 0,
    },
  });
}

// ── Component ──────────────────────────────────────────────────────────────────
interface Props {
  src:            string;
  vibeId:         string | null;
  partnerVibeId?: string | null;
  name:           string;
  height?:        number;
  align?:         "left" | "right";
}

export function SegmentedAvatar({
  src,
  vibeId,
  partnerVibeId = null,
  name,
  height = 210,
  align  = "left",
}: Props) {
  const vibe    = VIBES.find(v => v.id === vibeId) ?? null;
  const glow    = vibe?.glow      ?? "rgba(255,255,255,0.16)";
  const width   = Math.round(height * 0.44);

  const bodyCtrl = useAnimation();
  const interaction = getInteraction(vibeId, partnerVibeId);

  const prevInteract  = useRef<Interaction>(null);
  const highFiveDone  = useRef(false);

  // ── Drive body animation whenever vibe or interaction changes ─────────────
  useEffect(() => {
    const anim = BODY[vibeId ?? ""] ?? BODY.default;

    if (interaction === "mutual-romantic") {
      // Lean toward partner + slow sway
      const lean = align === "left" ? 8 : -8;
      startBodyLoop(bodyCtrl, {
        ...anim,
        rotate:   [lean - 3, lean + 3, lean - 3],
        y:        [0, -7, 0],
        origin:   "50% 58%",
        duration: 2.8,
      });
      return;
    }

    if (interaction === "mutual-high") {
      // Phase-offset so they drift in opposite directions
      const phaseDelay = align === "right" ? anim.duration * 0.5 : 0;
      startBodyLoop(bodyCtrl, anim, { delay: phaseDelay });
      return;
    }

    // mutual-happy / mutual-excited: in-phase sync (no override needed, same timing)
    startBodyLoop(bodyCtrl, anim);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vibeId, interaction]);

  // ── High-five: one-shot on first match ────────────────────────────────────
  useEffect(() => {
    const isHF = interaction === "high-five";
    if (isHF && prevInteract.current !== "high-five") {
      highFiveDone.current = false;
    }

    if (isHF && !highFiveDone.current) {
      highFiveDone.current = true;
      const anim   = BODY[vibeId ?? ""] ?? BODY.default;
      // Lean body toward partner + reach up; direction inverted per side
      const leanDir = align === "left" ? 1 : -1;

      bodyCtrl.start({
        rotate: [0, leanDir * 4, leanDir * 14, leanDir * 12, leanDir * 14, leanDir * 3, 0],
        y:      [0, -6, -20, -18, -20, -8, 0],
        x:      [0, leanDir * 4, leanDir * 10, leanDir * 10, leanDir * 10, leanDir * 3, 0],
        transition: {
          duration: 1.6,
          times:    [0, 0.07, 0.30, 0.50, 0.70, 0.88, 1],
          ease:     [0.22, 1, 0.36, 1],
        },
      }).then(() => {
        startBodyLoop(bodyCtrl, anim);
      });
    }

    prevInteract.current = interaction;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interaction, vibeId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>

      {/* Avatar stage */}
      <div style={{ position: "relative", width, height, overflow: "visible" }}>

        {/* Mood particle FX */}
        <AnimatePresence mode="wait">
          <MoodFX key={`fx-${vibeId}`} id={vibeId} h={height} />
        </AnimatePresence>

        {/* Avatar body — single image, no clip-path */}
        <motion.div
          animate={bodyCtrl}
          style={{
            width:  "100%",
            height: "100%",
            transformOrigin: (BODY[vibeId ?? ""] ?? BODY.default).origin,
            willChange: "transform",
            filter: `drop-shadow(0 14px 30px rgba(0,0,0,0.65))
                     drop-shadow(0 0 18px ${glow.replace(/[\d.]+\)$/, "0.35)")})`,
          } as React.CSSProperties}
        >
          <img
            src={src}
            alt={name}
            style={{
              width:          "100%",
              height:         "100%",
              objectFit:      "contain",
              objectPosition: "50% 0%",
              pointerEvents:  "none",
              userSelect:     "none",
              display:        "block",
            }}
          />
        </motion.div>

        {/* Glow pedestal */}
        <motion.div
          animate={{ opacity: [0.45, 0.82, 0.45], scaleX: [1, 1.24, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position:      "absolute",
            bottom:        -10,
            left:          "50%",
            transform:     "translateX(-50%)",
            width:         "90%",
            height:        28,
            background:    `radial-gradient(ellipse at center, ${glow} 0%, transparent 72%)`,
            filter:        "blur(6px)",
            pointerEvents: "none",
            zIndex:        -1,
          }}
        />

        {/* Ambient mood wash */}
        <motion.div
          animate={{ opacity: [0.15, 0.38, 0.15] }}
          transition={{ duration: 3.0, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position:      "absolute",
            inset:         "-22% -32%",
            background:    `radial-gradient(ellipse at 50% 60%, ${glow} 0%, transparent 65%)`,
            pointerEvents: "none",
            zIndex:        -2,
          }}
        />
      </div>

      {/* Name label */}
      <span style={{
        fontFamily:    "'Quicksand', sans-serif",
        fontSize:      "0.72rem",
        fontWeight:    600,
        color:         "rgba(255,255,255,0.55)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        pointerEvents: "none",
      }}>
        {name}
      </span>
    </div>
  );
}
