/**
 * FullBodyAvatar — Premium full-body animated avatar for the Home page hero.
 *
 * Each mood drives:
 *  1. Body physics  — rotation pivot + translate + scale choreography
 *  2. Overlay FX    — mood-specific emoji particles / effects
 *  3. Pedestal glow — colour-matched radial ground light
 *
 * Single-image technique: CSS transform-origin lets us pivot the flat PNG
 * at different anatomical points (hips, shoulders, feet) so the body
 * moves convincingly without needing multi-part rigging.
 */
import { motion, AnimatePresence } from "framer-motion";
import { VIBES } from "@/components/VibeCheckSection";

// ── Body animation config ──────────────────────────────────────────────────────
interface BodyAnim {
  rotate:   number[];
  y?:       number[];
  x?:       number[];
  scale?:   number[];
  origin:   string;   // CSS transform-origin (pivot point)
  duration: number;   // one full cycle in seconds
}

const BODY: Record<string, BodyAnim> = {
  // ── Energetic / Positive ──────────────────────────────────────────────────
  happy: {
    rotate: [-4, 4, -4],  y: [0, -18, -2, -16, 0],
    x: [-4, 4, -4],       scale: [1, 1.04, 0.97, 1.04, 1],
    origin: "50% 100%",   duration: 0.58,
  },
  excited: {
    rotate: [-6, 6, -6],  y: [0, -26, -4, -22, 0],
    x: [-6, 6, -6],       scale: [1, 1.07, 0.95, 1.06, 1],
    origin: "50% 100%",   duration: 0.42,
  },
  brave: {
    rotate: [-2, 2, -2],  y: [0, -9, 0],
    scale: [1, 1.05, 1],  origin: "50% 100%",   duration: 1.7,
  },
  content: {
    rotate: [-1.5, 1.5, -1.5], y: [0, -5, 0],
    origin: "50% 50%",   duration: 3.6,
  },
  // ── Romantic / Sensual ────────────────────────────────────────────────────
  romantic: {
    rotate: [-4, 4, -4],  y: [0, -6, 0],
    scale: [1, 1.03, 1],  origin: "50% 58%",  duration: 2.8,
  },
  horny: {
    // Hip-pivot thrust: rotate around 62% down = roughly the pelvis
    rotate: [-10, 10, -10], x: [-5, 5, -5], y: [0, 4, 0],
    origin: "50% 62%",   duration: 0.46,
  },
  cozy: {
    rotate: [-3, 3, -3],  y: [0, -4, 0],
    origin: "50% 50%",   duration: 3.0,
  },
  // ── Calm / Neutral ────────────────────────────────────────────────────────
  calm: {
    rotate: [-1.5, 1.5, -1.5], y: [0, -4, 0],
    origin: "50% 50%",   duration: 4.5,
  },
  // ── Angry / Aggressive ────────────────────────────────────────────────────
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
  // ── Tired / Low Energy ────────────────────────────────────────────────────
  // transform-origin at ~shoulder level (20%) = body droops forward from there
  tired: {
    rotate: [0, 7, 0],    y: [0, 9, 0],
    origin: "50% 20%",   duration: 5.0,
  },
  sleepy: {
    rotate: [0, 8, 0],    y: [0, 11, 0],
    origin: "50% 20%",   duration: 5.2,
  },
  exhausted: {
    rotate: [0, 12, 0],   y: [0, 15, 0],
    origin: "50% 20%",   duration: 5.5,
  },
  // ── Intoxicated ───────────────────────────────────────────────────────────
  high: {
    rotate: [-9, 9, -9],  x: [-9, 9, -9], y: [0, -5, 5, 0],
    origin: "50% 50%",   duration: 3.8,
  },
  drunk: {
    rotate: [-15, 18, -12, 15, -15],
    x: [-10, 13, -8, 11, -10],
    y: [0, 6, 2, 5, 0],
    origin: "50% 90%",   duration: 2.2,
  },
  hungover: {
    rotate: [3, 8, 3],    y: [4, 12, 4],
    origin: "50% 20%",   duration: 4.2,
  },
  // ── Negative Emotions ─────────────────────────────────────────────────────
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
  // ── Food Related ──────────────────────────────────────────────────────────
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

// ── Mood overlay FX ───────────────────────────────────────────────────────────
// Each returns zero or more absolutely-positioned Framer Motion elements
// layered over the avatar. `h` = container height in px.
export function MoodFX({ id, h }: { id: string | null; h: number }) {
  if (!id) return null;

  // ── Stoned / High 🚬💨 ─────────────────────────────────────────────────────
  if (id === "high") {
    return (
      <>
        {/* Cigarette at right hand — positioned ~42% down, right side */}
        <span style={{
          position: "absolute", top: h * 0.42, right: "2%",
          fontSize: "1.3rem", zIndex: 6, pointerEvents: "none",
          filter: "drop-shadow(0 0 6px rgba(100,200,100,0.6))",
          transform: "rotate(-35deg)",
        }}>🚬</span>
        {/* Four smoke puffs drifting up from cigarette tip */}
        {[
          { delay: 0,    left: "74%", size: "0.7rem" },
          { delay: 0.9,  left: "70%", size: "0.9rem" },
          { delay: 1.8,  left: "76%", size: "0.8rem" },
          { delay: 2.7,  left: "68%", size: "1.0rem" },
        ].map((s, i) => (
          <motion.span key={`smoke-${i}`}
            style={{ position: "absolute", top: h * 0.38, left: s.left,
                     fontSize: s.size, zIndex: 5, pointerEvents: "none",
                     filter: "blur(1.2px)", opacity: 0 }}
            animate={{ y: [-4, -h * 0.35, -h * 0.6], opacity: [0, 0.70, 0],
                       x: [0, i % 2 === 0 ? 10 : -8, 0], scale: [0.5, 1.2, 2.0] }}
            transition={{ duration: 3.0, repeat: Infinity, delay: s.delay, ease: "easeOut" }}
          >💨</motion.span>
        ))}
        {/* Green haze glow */}
        <div style={{
          position: "absolute", top: 0, inset: 0,
          background: "radial-gradient(ellipse at 50% 40%, rgba(74,222,128,0.12) 0%, transparent 65%)",
          pointerEvents: "none", zIndex: 1,
        }} />
      </>
    );
  }

  // ── Horny 🔥😈 ────────────────────────────────────────────────────────────
  if (id === "horny") {
    return (
      <>
        {/* Three fire emojis at crotch/hip zone */}
        {[
          { left: "30%", top: 0.60, delay: 0,    size: "1.1rem" },
          { left: "46%", top: 0.63, delay: 0.18, size: "1.3rem" },
          { left: "62%", top: 0.60, delay: 0.36, size: "1.0rem" },
        ].map((f, i) => (
          <motion.span key={`fire-${i}`}
            style={{ position: "absolute", top: h * f.top, left: f.left,
                     fontSize: f.size, zIndex: 6, pointerEvents: "none" }}
            animate={{ scale: [0.85, 1.25, 0.85], opacity: [0.7, 1.0, 0.7],
                       y: [0, -4, 0] }}
            transition={{ duration: 0.45, repeat: Infinity, delay: f.delay, ease: "easeInOut" }}
          >🔥</motion.span>
        ))}
        {/* 😈 floats above head */}
        <motion.span
          style={{ position: "absolute", top: h * -0.06, left: "50%",
                   transform: "translateX(-50%)", fontSize: "1.5rem",
                   zIndex: 6, pointerEvents: "none" }}
          animate={{ y: [0, -8, 0], rotate: [-5, 5, -5] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >😈</motion.span>
      </>
    );
  }

  // ── Happy ⚡ ───────────────────────────────────────────────────────────────
  if (id === "happy") {
    const sparks = ["⚡","✨","⭐","⚡","✨"];
    return (
      <>
        {sparks.map((s, i) => {
          const angle = (i / sparks.length) * Math.PI * 2;
          return (
            <motion.span key={`spark-${i}`}
              style={{ position: "absolute", fontSize: "0.85rem",
                       top: h * (0.1 + 0.6 * Math.random()),
                       left: i % 2 === 0 ? "-8%" : "88%",
                       zIndex: 6, pointerEvents: "none" }}
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5],
                         y: [0, -20, 0], rotate: [0, angle * 45, 0] }}
              transition={{ duration: 0.65, repeat: Infinity,
                            delay: i * 0.13, ease: "easeOut" }}
            >{s}</motion.span>
          );
        })}
      </>
    );
  }

  // ── Excited 🎉 ────────────────────────────────────────────────────────────
  if (id === "excited") {
    const confetti = ["🎉","🎊","⭐","✨","🌟","🎉"];
    return (
      <>
        {confetti.map((c, i) => (
          <motion.span key={`conf-${i}`}
            style={{ position: "absolute", fontSize: "0.90rem", zIndex: 6,
                     pointerEvents: "none",
                     top: h * (0.05 + (i % 3) * 0.25),
                     left: i % 2 === 0 ? `${-10 - i * 2}%` : `${88 + i * 2}%` }}
            animate={{ opacity: [0, 1, 0], y: [0, -28, 0],
                       rotate: [0, i % 2 === 0 ? 180 : -180, 0], scale: [0.4, 1.1, 0.4] }}
            transition={{ duration: 0.45, repeat: Infinity,
                          delay: i * 0.08, ease: "easeOut" }}
          >{c}</motion.span>
        ))}
      </>
    );
  }

  // ── Romantic 💕 ───────────────────────────────────────────────────────────
  if (id === "romantic") {
    return (
      <>
        {(["💕","💗","💖","💓"] as const).map((heart, i) => (
          <motion.span key={`heart-${i}`}
            style={{ position: "absolute", fontSize: "0.95rem", zIndex: 6,
                     pointerEvents: "none",
                     bottom: h * 0.4,
                     left: `${22 + i * 18}%` }}
            animate={{ y: [0, -h * 0.6, -h * 0.85],
                       opacity: [0, 0.90, 0], x: [0, i % 2 === 0 ? 8 : -8, 0],
                       scale: [0.6, 1.1, 1.6] }}
            transition={{ duration: 2.8, repeat: Infinity,
                          delay: i * 0.68, ease: "easeOut" }}
          >{heart}</motion.span>
        ))}
      </>
    );
  }

  // ── Sad 💧 ────────────────────────────────────────────────────────────────
  if (id === "sad") {
    return (
      <>
        {[0, 0.7, 1.4].map((delay, i) => (
          <motion.span key={`tear-${i}`}
            style={{ position: "absolute", fontSize: "0.80rem", zIndex: 6,
                     pointerEvents: "none",
                     top: h * 0.18,
                     left: i === 0 ? "30%" : i === 1 ? "52%" : "60%" }}
            animate={{ y: [0, h * 0.18, h * 0.32], opacity: [0, 0.85, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, delay, ease: "easeIn" }}
          >💧</motion.span>
        ))}
      </>
    );
  }

  // ── Tired / Sleepy / Exhausted 💤 ─────────────────────────────────────────
  if (["tired","sleepy","exhausted"].includes(id)) {
    const zs = [
      { delay: 0,    left: "64%", top: 0.05, size: "0.85rem" },
      { delay: 0.9,  left: "72%", top: 0.00, size: "1.0rem"  },
      { delay: 1.8,  left: "62%", top:-0.04, size: "1.2rem"  },
    ];
    return (
      <>
        {zs.map((z, i) => (
          <motion.span key={`zzz-${i}`}
            style={{ position: "absolute", top: h * z.top, left: z.left,
                     fontSize: z.size, zIndex: 6, pointerEvents: "none",
                     fontWeight: 700, color: "rgba(180,160,255,0.9)" }}
            animate={{ y: [0, -h * 0.18, -h * 0.30], opacity: [0, 0.85, 0],
                       scale: [0.6, 1.0, 1.4], x: [0, 8, 14] }}
            transition={{ duration: 2.5, repeat: Infinity,
                          delay: z.delay, ease: "easeOut" }}
          >z</motion.span>
        ))}
      </>
    );
  }

  // ── Angry / Pissed-off 💢 ─────────────────────────────────────────────────
  if (["angry","pissed-off"].includes(id)) {
    return (
      <>
        {[
          { side: "left:  -5%", top: 0.08, delay: 0   },
          { side: "right: -5%", top: 0.08, delay: 0.25 },
          { side: "left:  -5%", top: 0.18, delay: 0.50 },
        ].map((f, i) => (
          <motion.span key={`rage-${i}`}
            style={{ position: "absolute", top: h * f.top,
                     ...Object.fromEntries([f.side.split(":").map(s => s.trim())]),
                     fontSize: "1.1rem", zIndex: 6, pointerEvents: "none" }}
            animate={{ scale: [0.8, 1.3, 0.8], opacity: [0.5, 1.0, 0.5] }}
            transition={{ duration: 0.35, repeat: Infinity,
                          delay: f.delay, ease: "easeInOut" }}
          >💢</motion.span>
        ))}
        {/* Red heat haze */}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse at 50% 30%, rgba(220,38,38,0.14) 0%, transparent 60%)",
          pointerEvents: "none", zIndex: 1,
        }} />
      </>
    );
  }

  // ── Drunk 🍺🌀 ────────────────────────────────────────────────────────────
  if (id === "drunk") {
    return (
      <>
        {/* Beer at hand */}
        <span style={{
          position: "absolute", top: h * 0.42, right: "3%",
          fontSize: "1.2rem", zIndex: 6, pointerEvents: "none",
        }}>🍺</span>
        {/* Dizzy stars circling the head */}
        {[0, 1, 2].map(i => (
          <motion.span key={`dizzy-${i}`}
            style={{ position: "absolute", top: h * 0.05, left: "50%",
                     fontSize: "0.85rem", zIndex: 6, pointerEvents: "none",
                     transformOrigin: "center 28px" }}
            animate={{ rotate: [i * 120, i * 120 + 360] }}
            transition={{ duration: 1.8, repeat: Infinity,
                          ease: "linear", delay: i * 0.6 }}
          >⭐</motion.span>
        ))}
      </>
    );
  }

  // ── Nervous / Anxious 😰 ──────────────────────────────────────────────────
  if (["nervous","anxious"].includes(id)) {
    return (
      <>
        {[0, 0.5, 1.0].map((delay, i) => (
          <motion.span key={`sweat-${i}`}
            style={{ position: "absolute", fontSize: "0.80rem", zIndex: 6,
                     pointerEvents: "none",
                     top: h * (0.12 + i * 0.06),
                     right: i % 2 === 0 ? "6%" : "12%" }}
            animate={{ y: [0, h * 0.1, h * 0.22], opacity: [0, 0.90, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, delay, ease: "easeIn" }}
          >💦</motion.span>
        ))}
      </>
    );
  }

  // ── Scared 😱 ─────────────────────────────────────────────────────────────
  if (id === "scared") {
    return (
      <>
        {["❗","❗","❕"].map((e, i) => (
          <motion.span key={`scare-${i}`}
            style={{ position: "absolute", top: h * (0.0 - i * 0.06),
                     left: `${30 + i * 22}%`, fontSize: "1.0rem",
                     zIndex: 6, pointerEvents: "none" }}
            animate={{ opacity: [0, 1, 0], y: [0, -12, 0], scale: [0.7, 1.2, 0.7] }}
            transition={{ duration: 0.35, repeat: Infinity,
                          delay: i * 0.12, ease: "easeOut" }}
          >{e}</motion.span>
        ))}
      </>
    );
  }

  // ── Hungry / Hangry 🍔 ────────────────────────────────────────────────────
  if (["hungry","hangry"].includes(id)) {
    return (
      <>
        {["🍔","🍕","🌮"].map((food, i) => (
          <motion.span key={`food-${i}`}
            style={{ position: "absolute", fontSize: "1.0rem", zIndex: 6,
                     pointerEvents: "none",
                     top: h * (0.0 + i * 0.04),
                     left: i % 2 === 0 ? "-8%" : "88%" }}
            animate={{ opacity: [0, 1, 0], y: [0, -16, 0],
                       rotate: [0, i % 2 === 0 ? 15 : -15, 0] }}
            transition={{ duration: 1.2, repeat: Infinity,
                          delay: i * 0.40, ease: "easeOut" }}
          >{food}</motion.span>
        ))}
      </>
    );
  }

  // ── Sick 🤢 ───────────────────────────────────────────────────────────────
  if (id === "sick") {
    return (
      <motion.span
        style={{ position: "absolute", top: h * 0.12, left: "50%",
                 transform: "translateX(-50%)", fontSize: "1.5rem",
                 zIndex: 6, pointerEvents: "none" }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1.0, 0.7] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      >🤢</motion.span>
    );
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  src:    string;
  vibeId: string | null;
  name:   string;
  height?: number;   // display height in px — width is auto (aspect preserved)
}

export function FullBodyAvatar({ src, vibeId, name, height = 200 }: Props) {
  const vibe    = VIBES.find(v => v.id === vibeId) ?? null;
  const glow    = vibe?.glow     ?? "rgba(255,255,255,0.16)";
  const glowDim = vibe?.glowFaint ?? "rgba(255,255,255,0.06)";

  const anim    = BODY[vibeId ?? ""] ?? BODY.default;
  const width   = Math.round(height * 0.44); // ~1:2.27 portrait ratio

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>

      {/* Avatar stage — overflow visible so particles can escape the frame */}
      <div style={{ position: "relative", width, height, overflow: "visible" }}>

        {/* FX layer — sits behind avatar */}
        <AnimatePresence mode="wait">
          <MoodFX key={`fx-${vibeId}`} id={vibeId} h={height} />
        </AnimatePresence>

        {/* Avatar body */}
        <motion.div
          animate={{
            rotate: anim.rotate,
            y:      anim.y      ?? [0],
            x:      anim.x      ?? [0],
            scale:  anim.scale  ?? [1],
          }}
          transition={{
            duration:   anim.duration,
            repeat:     Infinity,
            ease:       "easeInOut",
            repeatType: "mirror",
          }}
          style={{
            transformOrigin: anim.origin,
            width:  "100%",
            height: "100%",
            filter: `drop-shadow(0 12px 28px rgba(0,0,0,0.65))
                     drop-shadow(0 0 18px ${glow.replace(/[\d.]+\)$/, "0.35)")})`,
          } as React.CSSProperties}
        >
          <img
            src={src}
            alt={name}
            style={{
              width:  "100%",
              height: "100%",
              objectFit:      "contain",
              objectPosition: "50% 0%",
              pointerEvents:  "none",
              userSelect:     "none",
              display:        "block",
            }}
          />
        </motion.div>

        {/* Glow pedestal — radial light on the "floor" */}
        <motion.div
          animate={{
            opacity: [0.45, 0.80, 0.45],
            scaleX:  [1, 1.22, 1],
          }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position:     "absolute",
            bottom:       -10,
            left:         "50%",
            transform:    "translateX(-50%)",
            width:        "88%",
            height:       28,
            background:   `radial-gradient(ellipse at center, ${glow} 0%, transparent 72%)`,
            filter:       "blur(6px)",
            pointerEvents: "none",
            zIndex:       -1,
          }}
        />

        {/* Mood colour ambient wash — subtle screen-space glow */}
        <motion.div
          animate={{ opacity: [0.18, 0.40, 0.18] }}
          transition={{ duration: 3.0, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position:   "absolute",
            inset:      "-20% -30%",
            background: `radial-gradient(ellipse at 50% 60%, ${glow} 0%, transparent 65%)`,
            pointerEvents: "none",
            zIndex:     -2,
          }}
        />
      </div>

      {/* Name label */}
      <span style={{
        fontFamily:    "'Quicksand', sans-serif",
        fontSize:      "0.72rem",
        fontWeight:    700,
        color:         "rgba(255,255,255,0.80)",
        letterSpacing: "0.06em",
        textShadow:    "0 1px 8px rgba(0,0,0,0.55)",
        textTransform: "uppercase",
      }}>
        {name}
      </span>
    </div>
  );
}
