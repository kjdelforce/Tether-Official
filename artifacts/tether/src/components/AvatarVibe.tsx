import { useEffect, useRef } from "react";
import { motion, useAnimation } from "framer-motion";
import { VIBES } from "@/components/VibeCheckSection";

// ── Per-vibe animation config ─────────────────────────────────────────────────
// rotate  = Z-axis sway (left-right tilt, degrees)
// rotateY = 3D Y-axis parallax tilt (creates depth illusion, degrees)
// y       = vertical float (up-down bob, px)
// x       = horizontal drift (side-to-side, px)
// scale   = size pulse
// duration = one full cycle length in seconds
interface AnimCfg {
  rotate: number[];
  rotateY: number[];
  y: number[];
  x?: number[];
  scale?: number[];
  duration: number;
}

const VIBE_ANIMS: Record<string, AnimCfg> = {
  happy:        { rotate: [-4, 4, -4],   rotateY: [-9, 9, -9],  y: [0, -10, 0],  scale: [1, 1.05, 1],  duration: 0.65 },
  romantic:     { rotate: [-4, 4, -4],   rotateY: [-7, 7, -7],  y: [0, -7, 0],                          duration: 3.2  },
  calm:         { rotate: [-1.5,1.5,-1.5], rotateY: [-5, 5,-5], y: [0, -5, 0],                          duration: 4.5  },
  tired:        { rotate: [2, 5, 2],     rotateY: [-3, 3, -3],  y: [4, 9, 4],                            duration: 5.0  },
  cozy:         { rotate: [-2, 2, -2],   rotateY: [-5, 5, -5],  y: [0, -5, 0],                          duration: 3.2  },
  angry:        { rotate: [-7, 7, -7],   rotateY: [-5, 5, -5],  y: [0, -2, 0],   x: [-4, 4, -4],        duration: 0.22 },
  sad:          { rotate: [2, 5, 2],     rotateY: [-2, 2, -2],  y: [6, 11, 6],                           duration: 4.2  },
  high:         { rotate: [-9, 9, -9],   rotateY: [-11,11,-11], y: [0, -6, 5, 0],                        duration: 4.0  },
  horny:        { rotate: [-5, 5, -5],   rotateY: [-8, 8, -8],  y: [0, -5, 0],   scale: [1, 1.06, 1],   duration: 2.0  },
  hungry:       { rotate: [-5, 5, -5],   rotateY: [-8, 8, -8],  y: [0, -4, 0],                          duration: 0.9  },
  hangry:       { rotate: [-7, 7, -7],   rotateY: [-5, 5, -5],  y: [0, -2, 0],   x: [-4, 4, -4],        duration: 0.30 },
  sick:         { rotate: [-5, 5, -5],   rotateY: [-6, 6, -6],  y: [0, 5, 0],                            duration: 2.5  },
  nervous:      { rotate: [-3, 3, -3],   rotateY: [-4, 4, -4],  y: [0, -3, 0],   x: [-2, 2, -2],        duration: 0.16 },
  scared:       { rotate: [-4, 4, -4],   rotateY: [-5, 5, -5],  y: [0, -4, 0],   scale: [0.96, 1, 0.96],duration: 0.28 },
  "pissed-off": { rotate: [-9, 9, -9],   rotateY: [-5, 5, -5],  y: [0, -2, 0],   x: [-5, 5, -5],        duration: 0.16 },
  exhausted:    { rotate: [3, 7, 3],     rotateY: [-2, 2, -2],  y: [4, 11, 4],                           duration: 5.5  },
  sleepy:       { rotate: [2, 5, 2],     rotateY: [-3, 3, -3],  y: [2, 9, 2],                            duration: 5.2  },
  excited:      { rotate: [-7, 7, -7],   rotateY: [-10,10,-10], y: [0, -12, 0],  scale: [1, 1.08, 1],   duration: 0.38 },
  drunk:        { rotate: [-14,14,-14],  rotateY: [-13,13,-13], y: [0, 6, 0],                            duration: 2.8  },
  hungover:     { rotate: [-5, 5, -5],   rotateY: [-4, 4, -4],  y: [0, 4, 0],                            duration: 3.5  },
  anxious:      { rotate: [-3, 3, -3],   rotateY: [-4, 4, -4],  y: [0, -3, 0],   x: [-2, 2, -2],        duration: 0.18 },
  content:      { rotate: [-1.5,1.5,-1.5], rotateY: [-5,5,-5],  y: [0, -5, 0],                          duration: 3.8  },
  sore:         { rotate: [1, 3, 1],     rotateY: [-3, 3, -3],  y: [1, 5, 1],                            duration: 4.0  },
  brave:        { rotate: [-2, 2, -2],   rotateY: [-5, 5, -5],  y: [0, -6, 0],   scale: [1, 1.04, 1],   duration: 1.5  },
};
const DEFAULT_ANIM: AnimCfg = { rotate: [-2, 2, -2], rotateY: [-5, 5, -5], y: [0, -6, 0], duration: 3.0 };

// How often to blink (ms between blinks), varies by emotional state
function blinkMs(id: string | null): number {
  if (!id) return 4500;
  if (["exhausted", "sleepy", "drunk", "hungover"].includes(id)) return 1800;
  if (["tired", "sad", "sick", "sore"].includes(id))              return 2800;
  if (["happy", "excited", "romantic", "horny"].includes(id))     return 3200;
  return 4200;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface AvatarVibeProps {
  src: string;
  vibeId: string | null;
  name: string;
  size?: number;
  // Fine-tune face centering per photo (CSS objectPosition value)
  objectPosition?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AvatarVibe({
  src,
  vibeId,
  name,
  size = 88,
  objectPosition = "50% 18%",
}: AvatarVibeProps) {
  const vibe    = VIBES.find(v => v.id === vibeId) ?? null;
  const glow    = vibe?.glow     ?? "rgba(255,255,255,0.18)";
  const glowDim = vibe?.glowFaint ?? "rgba(255,255,255,0.06)";

  const animCfg    = VIBE_ANIMS[vibeId ?? ""] ?? DEFAULT_ANIM;
  const blinkCtrl  = useAnimation();
  const alive      = useRef(true);

  // ── Blink loop ────────────────────────────────────────────────────────────
  useEffect(() => {
    alive.current = true;
    const ms = blinkMs(vibeId);
    const isTired = ["tired","sleepy","exhausted","drunk","hungover"].includes(vibeId ?? "");

    async function loop() {
      while (alive.current) {
        await new Promise(r => setTimeout(r, ms + Math.random() * 2200));
        if (!alive.current) break;
        await blinkCtrl.start({ scaleY: 1, transition: { duration: 0.07, ease: "easeIn"  } });
        await blinkCtrl.start({ scaleY: 0, transition: { duration: 0.11, ease: "easeOut" } });
        // Tired moods get a slow double-blink
        if (isTired) {
          await new Promise(r => setTimeout(r, 140));
          await blinkCtrl.start({ scaleY: 1, transition: { duration: 0.10 } });
          await blinkCtrl.start({ scaleY: 0, transition: { duration: 0.14 } });
        }
      }
    }
    loop();
    return () => { alive.current = false; };
  }, [vibeId, blinkCtrl]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>

      {/* Outer glow ring — pulses with vibe colour */}
      <motion.div
        animate={{
          boxShadow: [
            `0 0 0 1.5px rgba(255,255,255,0.20), 0 0 18px 4px ${glowDim}, 0 6px 22px rgba(0,0,0,0.58)`,
            `0 0 0 2.0px rgba(255,255,255,0.35), 0 0 32px 10px ${glow},    0 6px 22px rgba(0,0,0,0.58)`,
            `0 0 0 1.5px rgba(255,255,255,0.20), 0 0 18px 4px ${glowDim}, 0 6px 22px rgba(0,0,0,0.58)`,
          ],
        }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width:              size,
          height:             size,
          borderRadius:       "50%",
          position:           "relative",
          overflow:           "hidden",
          // Liquid Glass treatment
          background:         "rgba(255,255,255,0.06)",
          backdropFilter:     "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          border:             "1.5px solid rgba(255,255,255,0.24)",
          perspective:        "600px",
        } as React.CSSProperties}
      >
        {/* Specular top-left glint — the "glass lens" highlight */}
        <div style={{
          position:   "absolute",
          top:        size * 0.08,
          left:       size * 0.12,
          width:      size * 0.22,
          height:     size * 0.13,
          borderRadius: "50%",
          background: "radial-gradient(ellipse, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)",
          pointerEvents: "none",
          zIndex:     12,
        }} />

        {/* Frosted bottom colour bleed — Liquid Glass tint */}
        <div style={{
          position:   "absolute",
          bottom:     0, left: 0, right: 0,
          height:     "30%",
          background: `linear-gradient(to top, ${glow.replace(/[\d.]+\)$/, "0.22)")}, transparent)`,
          pointerEvents: "none",
          zIndex:     9,
        }} />

        {/* Animated headshot — vibe-driven 3D float + tilt */}
        <motion.div
          animate={{
            rotate:  animCfg.rotate,
            rotateY: animCfg.rotateY,
            y:       animCfg.y,
            ...(animCfg.x     ? { x:     animCfg.x     } : {}),
            ...(animCfg.scale ? { scale: animCfg.scale } : {}),
          }}
          transition={{
            duration:   animCfg.duration,
            repeat:     Infinity,
            ease:       "easeInOut",
            repeatType: "mirror",
          }}
          style={{
            width:  "100%",
            height: "100%",
            transformStyle: "preserve-3d",
          } as React.CSSProperties}
        >
          <img
            src={src}
            alt={name}
            style={{
              width:          "132%",
              height:         "132%",
              objectFit:      "cover",
              objectPosition,
              marginTop:      "-14%",
              marginLeft:     "-16%",
              pointerEvents:  "none",
              userSelect:     "none",
              display:        "block",
            }}
          />
        </motion.div>

        {/* Blink overlay — thin band at eye level scales in then out */}
        <motion.div
          animate={blinkCtrl}
          initial={{ scaleY: 0 }}
          style={{
            position:        "absolute",
            top:             "34%",
            left:            0,
            right:           0,
            height:          "14%",
            background:      "rgba(0,0,0,0.90)",
            transformOrigin: "center",
            pointerEvents:   "none",
            zIndex:          7,
          }}
        />

        {/* Metallic inner bezel rim (inner shadow) */}
        <div style={{
          position:     "absolute",
          inset:        0,
          borderRadius: "50%",
          boxShadow:    "inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 2px 4px rgba(255,255,255,0.08)",
          pointerEvents: "none",
          zIndex:       11,
        }} />
      </motion.div>

      {/* Name label */}
      <span style={{
        fontFamily:    "'Quicksand', sans-serif",
        fontSize:      "0.70rem",
        fontWeight:    600,
        color:         "rgba(255,255,255,0.78)",
        letterSpacing: "0.05em",
        textShadow:    "0 1px 6px rgba(0,0,0,0.55)",
      }}>
        {name}
      </span>
    </div>
  );
}
