import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { haptic } from "@/lib/haptics";
import { playSound } from "@/lib/audioManager";
import { LoveYouSendAnimation } from "@/components/LoveYouSendAnimation";

/**
 * LoveYouSender — Home-screen Love-You action.
 *
 * Visuals: replaced the old multi-phase heart-rising / envelope /
 * flying timeline with a focused two-phase flow:
 *
 *   1. `idle`  — `<LoveYouSendAnimation isSending={false}/>` shows
 *      the resting glass orb with its breathing loop.
 *   2. `sending` — `isSending` flips true; the orb runs its full
 *      pulse choreography (compress → expand+flash → ripple →
 *      6 mini-heart particles → settle).  When it calls
 *      `onFinished`, we transition into `done` for ~3 s to show
 *      the "Sent! 💌" confirmation, then return to idle.
 *
 * Backend logic (`onSend`, haptics, sound) is unchanged — only
 * the visual treatment was upgraded per the brief.
 */

const CAVEAT = { fontFamily: "'Caveat', cursive" };

type Phase = "idle" | "sending" | "done";

export function LoveYouSender({
  partnerName,
  onSend,
}: {
  partnerName: string;
  onSend: () => Promise<void>;
}) {
  const [phase, setPhase] = useState<Phase>("idle");

  const handleTap = useCallback(async () => {
    if (phase !== "idle") return;
    haptic("celebration");
    playSound("heartbeatPulse");
    setPhase("sending");
    // Backend call runs in parallel with the visual animation —
    // the orb's `onFinished` is the visual completion signal, not
    // the network completion (the network is fire-and-forget so
    // the UX stays snappy).
    void onSend();
  }, [phase, onSend]);

  const handleFinished = useCallback(() => {
    haptic("success");
    setPhase("done");
    setTimeout(() => setPhase("idle"), 3200);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-blue-300/80 text-[10px] uppercase tracking-widest font-semibold">
        Love You
      </p>

      {/* Fixed-height stage so the layout never jumps as the orb
       * scales / particles spill outside the orb's own bounds. */}
      <div
        style={{
          position: "relative",
          width: 240,
          height: 240,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <AnimatePresence mode="wait">
          {phase === "done" ? (
            // ── Done state — green confirmation orb ────────────
            // Reuses the same glass capsule, just themed green
            // via the `accent` prop.  No tap action; auto-resets
            // back to idle after 3.2 s (handled in handleFinished).
            <motion.div
              key="done"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1,   opacity: 1 }}
              exit={{    scale: 1.1, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              style={{ width: 176, height: 176 }}
            >
              <LoveYouSendAnimation
                isSending={false}
                message="Sent! 💌"
                accent="var(--lg-accent-success)"
                disabled
              />
            </motion.div>
          ) : (
            // ── Idle / sending — the main orb (single instance,
            // running its own internal choreography). ──────────
            <motion.div
              key="orb"
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ width: 176, height: 176 }}
            >
              <LoveYouSendAnimation
                isSending={phase === "sending"}
                onTap={handleTap}
                onFinished={handleFinished}
                message="Love You"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p style={{ ...CAVEAT, fontSize: "1.05rem", color: "rgba(147,197,253,0.7)" }}>
        {phase === "done"
          ? `${partnerName} got your love 💌`
          : `Send ${partnerName} your love`}
      </p>
    </div>
  );
}
