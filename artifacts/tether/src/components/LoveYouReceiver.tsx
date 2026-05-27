import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { haptic, hapticLoop } from "@/lib/haptics";
import { playSound } from "@/lib/audioManager";

type Phase = "landing" | "opening" | "heart-out" | "fading";

const PLAYFAIR = { fontFamily: "'Playfair Display', serif" };

export function LoveYouReceiver({
  senderName,
  onDone,
}: {
  senderName: string;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("landing");

  useEffect(() => {
    // Envelope flies in — soft land haptic
    haptic("envelope");

    // Flap opens
    const t1 = setTimeout(() => { setPhase("opening"); haptic("medium"); }, 1100);

    // Heart emerges — start heartbeat loop synced to the 1.6s animation cycle
    let stopHeartbeat: (() => void) | null = null;
    const t2 = setTimeout(() => {
      setPhase("heart-out");
      playSound("shimmer");
      stopHeartbeat = hapticLoop("heartbeat", 1600);
    }, 1800);

    // Begin fade — stop the heartbeat loop
    const t3 = setTimeout(() => {
      setPhase("fading");
      stopHeartbeat?.();
    }, 4600);

    const t4 = setTimeout(() => onDone(), 5400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      stopHeartbeat?.();
    };
  }, [onDone]);

  const flapOpen = phase === "opening" || phase === "heart-out" || phase === "fading";
  const showHeart = phase === "heart-out" || phase === "fading";

  return (
    <motion.div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(8, 14, 38, 0.93)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === "fading" ? 0 : 1 }}
      transition={{ duration: phase === "fading" ? 0.8 : 0.3 }}
    >
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>

        {/* Heart that rises out of the envelope */}
        <AnimatePresence>
          {showHeart && (
            <motion.div
              key="heart-out"
              style={{
                position: "absolute",
                bottom: "calc(100% - 20px)",
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                zIndex: 10,
              }}
              initial={{ y: 60, opacity: 0, scale: 0.3 }}
              animate={{ y: -30, opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", bounce: 0.45, duration: 0.7 }}
            >
              <motion.span
                style={{ fontSize: "5rem", lineHeight: 1 }}
                animate={{ scale: [1, 1.12, 1], rotate: [-4, 4, -4] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                ❤️
              </motion.span>
              <motion.p
                style={{
                  ...PLAYFAIR,
                  color: "white",
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  margin: 0,
                  textShadow: "0 3px 18px rgba(197,48,48,0.7), 0 1px 4px rgba(0,0,0,0.5)",
                  whiteSpace: "nowrap",
                }}
                initial={{ opacity: 0, scale: 0.65 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.28, duration: 0.4 }}
              >
                Love You ❤️
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Envelope */}
        <motion.div
          style={{ position: "relative", perspective: 600 }}
          initial={{ x: 220, y: -340, rotate: 22, scale: 0.55 }}
          animate={{ x: 0, y: 0, rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 18, duration: 0.9 }}
        >
          {/* Envelope body */}
          <div
            style={{
              width: 280,
              height: 190,
              borderRadius: 10,
              background: "linear-gradient(145deg, #fff5f5 0%, #ffe0e0 100%)",
              border: "3px solid #C53030",
              boxShadow: "0 24px 60px rgba(197,48,48,0.4), 0 8px 20px rgba(0,0,0,0.3)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Side fold lines */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: [
                  "linear-gradient(to bottom right, transparent 49.5%, rgba(197,48,48,0.09) 50.5%)",
                  "linear-gradient(to bottom left,  transparent 49.5%, rgba(197,48,48,0.09) 50.5%)",
                ].join(", "),
                backgroundSize: "50% 100%, 50% 100%",
                backgroundPosition: "left bottom, right bottom",
                backgroundRepeat: "no-repeat",
              }}
            />
            {/* From label */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                paddingTop: "44%",
                gap: 4,
              }}
            >
              <p style={{ ...PLAYFAIR, color: "#C53030", fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
                From: {senderName}
              </p>
            </div>
          </div>

          {/* Flap — rotates open */}
          <motion.div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "55%",
              transformOrigin: "top center",
              zIndex: 4,
            }}
            animate={flapOpen ? { rotateX: -168 } : { rotateX: 0 }}
            transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(165deg, #ffd0d0 0%, #ffb8b8 100%)",
                clipPath: "polygon(0% 0%, 100% 0%, 50% 100%)",
                borderBottom: "2.5px solid #C53030",
              }}
            />
          </motion.div>
        </motion.div>

        {/* Tap-to-dismiss hint */}
        <AnimatePresence>
          {phase === "heart-out" && (
            <motion.button
              onClick={() => { setPhase("fading"); setTimeout(onDone, 700); }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 1.2, duration: 0.4 }}
              style={{
                marginTop: 40,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 999,
                padding: "8px 24px",
                color: "rgba(255,255,255,0.5)",
                fontSize: "0.8rem",
                cursor: "pointer",
                fontFamily: "'Quicksand', sans-serif",
              }}
            >
              tap to close
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
