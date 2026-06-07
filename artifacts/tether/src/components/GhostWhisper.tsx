import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { haptic } from "@/lib/haptics";

// ── Typography helpers ─────────────────────────────────────────────────────
const QS: React.CSSProperties  = { fontFamily: "'Quicksand', sans-serif" };
const PF: React.CSSProperties  = { fontFamily: "'Playfair Display', serif" };

// ── Evaporation constants ──────────────────────────────────────────────────
// Last N chars from the cursor are fully opaque
const VISIBLE_TAIL = 20;
// N chars before that progressively fade (smoke zone)
const FADE_WINDOW  = 16;

interface EvapChar { char: string; opacity: number; y: number }

function buildEvapStates(text: string): EvapChar[] {
  return text.split("").map((char, i) => {
    const d = text.length - 1 - i; // distance from end (0 = last char)
    if (d >= VISIBLE_TAIL + FADE_WINDOW) return { char, opacity: 0,           y: -12 };
    if (d >= VISIBLE_TAIL) {
      const t = (d - VISIBLE_TAIL) / FADE_WINDOW;
      return { char, opacity: 1 - t, y: -t * 12 };
    }
    return { char, opacity: 1, y: 0 };
  });
}

// ── Ghost Cloud Button (placed in HomePage header) ─────────────────────────
export function GhostCloudButton({ onPress }: { onPress: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={() => { haptic("light"); onPress(); }}
      style={{
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: "50%",
        width: 40,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
        flexShrink: 0,
      }}
      title="Ghost Whisper"
    >
      {/* cloud SVG — minimal, ghost-white */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
      </svg>
    </motion.button>
  );
}

// ── Compose modal ──────────────────────────────────────────────────────────
export function GhostWhisperCompose({
  tetherId,
  senderId,
  senderName,
  onClose,
}: {
  tetherId: string;
  senderId: string;
  senderName?: string;
  onClose: () => void;
}) {
  const [text,    setText]   = useState("");
  const [sending, setSending] = useState(false);
  const [sent,    setSent]   = useState(false);
  const taRef   = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Auto-size textarea to content
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [text]);

  // Focus input on open
  useEffect(() => { taRef.current?.focus(); }, []);

  const evapStates = buildEvapStates(text);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    haptic("light");
    const { error } = await supabase.from("temporary_whispers").insert({
      tether_id: tetherId,
      sender_id: senderId,
      message:   text.trim(),
    });
    if (error) { setSending(false); return; }
    setSent(true);
    haptic("success");
    import("@/lib/notifications").then(({ sendWhisperNotification }) => {
      sendWhisperNotification(tetherId, senderId, senderName).catch(() => {});
    });
    setTimeout(onClose, 1100);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,0,8,0.97)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        zIndex: 999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 28px 32px",
        // Subtle radial purple haze so it's not completely flat
        backgroundImage: "radial-gradient(ellipse 60% 50% at 50% 60%, rgba(90,60,160,0.12) 0%, transparent 100%)",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08 }}
        style={{ textAlign: "center", marginBottom: 36 }}
      >
        <motion.span
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          style={{ display: "inline-block", fontSize: "2.4rem", lineHeight: 1 }}
        >
          ☁️
        </motion.span>
        <p style={{ ...QS, color: "rgba(255,255,255,0.38)", fontSize: "0.62rem",
            letterSpacing: "0.28em", textTransform: "uppercase", marginTop: 10 }}>
          Ghost Whisper
        </p>
        <p style={{ ...QS, color: "rgba(255,255,255,0.20)", fontSize: "0.58rem", marginTop: 5 }}>
          5 seconds to read · vanishes forever · no trace
        </p>
      </motion.div>

      {/* ── Input / Sent ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{ textAlign: "center" }}
          >
            <motion.p
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ ...PF, color: "rgba(180,160,230,0.85)", fontSize: "1.2rem" }}
            >
              ✦ whispered into the void ✦
            </motion.p>
          </motion.div>
        ) : (
          <motion.div
            key="compose"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            style={{ width: "100%", maxWidth: 380 }}
          >
            {/* Evaporating text + transparent textarea stacked */}
            <div
              ref={wrapRef}
              style={{ position: "relative", width: "100%", minHeight: 160 }}
            >
              {/* Overlay: evaporating char spans (pointer-events: none) */}
              <div
                style={{
                  position: "absolute",
                  top: 0, left: 0, right: 0,
                  padding: "14px 16px",
                  fontSize: "1.22rem",
                  ...PF,
                  lineHeight: 1.65,
                  color: "white",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                  pointerEvents: "none",
                  zIndex: 2,
                  minHeight: 160,
                  overflowWrap: "break-word",
                }}
              >
                {evapStates.length === 0 && (
                  <span style={{ ...QS, color: "rgba(255,255,255,0.18)",
                      fontStyle: "italic", fontSize: "1rem" }}>
                    whisper something…
                  </span>
                )}
                {evapStates.map(({ char, opacity, y }, i) => (
                  <motion.span
                    key={i}
                    animate={{ opacity, y }}
                    transition={{ duration: 0.38, ease: "easeOut" }}
                    style={{ display: "inline", whiteSpace: "pre" }}
                  >
                    {char}
                  </motion.span>
                ))}
              </div>

              {/* Actual textarea — text transparent, caret white */}
              <textarea
                ref={taRef}
                value={text}
                onChange={e => setText(e.target.value)}
                maxLength={320}
                style={{
                  position: "relative",
                  width: "100%",
                  boxSizing: "border-box",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 16,
                  padding: "14px 16px",
                  fontSize: "1.22rem",
                  fontFamily: "'Playfair Display', serif",
                  lineHeight: 1.65,
                  color: "transparent",
                  caretColor: "rgba(200,170,255,0.90)",
                  outline: "none",
                  resize: "none",
                  zIndex: 1,
                  minHeight: 160,
                  overflowY: "hidden",
                  display: "block",
                }}
              />
            </div>

            {/* Char counter */}
            <p style={{ ...QS, color: "rgba(255,255,255,0.15)", fontSize: "0.58rem",
                textAlign: "right", marginTop: 6, letterSpacing: "0.05em" }}>
              {text.length} / 320
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Buttons ───────────────────────────────────────────────────── */}
      {!sent && (
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.18 }}
          style={{ marginTop: 24, display: "flex", gap: 12,
              width: "100%", maxWidth: 380 }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "13px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.35)",
              cursor: "pointer",
              ...QS,
              fontSize: "0.9rem",
            }}
          >
            Cancel
          </button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={send}
            disabled={!text.trim() || sending}
            style={{
              flex: 2,
              padding: "13px",
              borderRadius: 14,
              background: text.trim()
                ? "linear-gradient(135deg, rgba(100,70,180,0.88) 0%, rgba(50,30,100,0.95) 100%)"
                : "rgba(255,255,255,0.04)",
              border: text.trim()
                ? "1px solid rgba(150,110,220,0.40)"
                : "1px solid rgba(255,255,255,0.06)",
              color: text.trim()
                ? "rgba(210,185,255,0.95)"
                : "rgba(255,255,255,0.18)",
              cursor: text.trim() ? "pointer" : "default",
              fontWeight: 600,
              ...QS,
              fontSize: "0.95rem",
              letterSpacing: "0.03em",
              transition: "all 0.28s ease",
              boxShadow: text.trim()
                ? "0 4px 20px rgba(100,70,180,0.30)"
                : "none",
            }}
          >
            {sending ? "Whispering…" : "Whisper ↑"}
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Receive modal ──────────────────────────────────────────────────────────
const COUNTDOWN_SEC = 5;

export interface IncomingWhisper {
  id: string;
  message: string;
}

export function GhostWhisperReceive({
  whisper,
  onDone,
}: {
  whisper: IncomingWhisper;
  onDone: () => void;
}) {
  type Phase = "appearing" | "reading" | "shredding" | "gone";
  const [phase,     setPhase]     = useState<Phase>("appearing");
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC);
  const deletedRef = useRef(false);

  // Pre-compute stable random shred offsets (useMemo so they don't regenerate)
  const chars = useMemo(() => whisper.message.split(""), [whisper.message]);
  const shred = useMemo(() =>
    chars.map(() => ({
      x:        (Math.random() - 0.5) * 320,
      y:        Math.random() * -160 - 20,
      rotate:   (Math.random() - 0.5) * 240,
      duration: 0.50 + Math.random() * 0.35,
      delay:    Math.random() * 0.22,
    })),
  [chars]);

  // Phase: appearing → reading after short delay
  useEffect(() => {
    haptic("light");
    const t = setTimeout(() => setPhase("reading"), 600);
    return () => clearTimeout(t);
  }, []);

  // Phase: reading → countdown tick
  useEffect(() => {
    if (phase !== "reading") return;
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(id);
          setPhase("shredding");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Delete from Supabase
  const deleteWhisper = useCallback(async () => {
    if (deletedRef.current) return;
    deletedRef.current = true;
    await supabase.from("temporary_whispers").delete().eq("id", whisper.id);
  }, [whisper.id]);

  // Phase: shredding → done → call onDone
  useEffect(() => {
    if (phase !== "shredding") return;
    haptic("success");
    deleteWhisper();
    const t = setTimeout(() => {
      setPhase("gone");
      setTimeout(onDone, 350);
    }, 950);
    return () => clearTimeout(t);
  }, [phase, deleteWhisper, onDone]);

  if (phase === "gone") return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.30 }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,0,8,0.98)",
        backdropFilter: "blur(32px)",
        WebkitBackdropFilter: "blur(32px)",
        zIndex: 999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 32px",
        backgroundImage: "radial-gradient(ellipse 55% 45% at 50% 55%, rgba(90,60,160,0.14) 0%, transparent 100%)",
      }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: "center", marginBottom: 48 }}
      >
        <motion.span
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          style={{ display: "inline-block", fontSize: "2.2rem", lineHeight: 1 }}
        >
          ☁️
        </motion.span>
        <p style={{ ...QS, color: "rgba(255,255,255,0.32)", fontSize: "0.6rem",
            letterSpacing: "0.28em", textTransform: "uppercase", marginTop: 10 }}>
          A Ghost Whisper
        </p>
      </motion.div>

      {/* ── Message text (each char animated individually) ────────────── */}
      <div style={{
        textAlign: "center",
        maxWidth: 320,
        marginBottom: 52,
        position: "relative",
        lineHeight: 1.7,
      }}>
        {chars.map((char, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={
              phase === "shredding"
                ? {
                    x:       shred[i].x,
                    y:       shred[i].y,
                    rotate:  shred[i].rotate,
                    opacity: 0,
                    scale:   0.08,
                  }
                : {
                    x:       0,
                    y:       0,
                    rotate:  0,
                    opacity: 1,
                    scale:   1,
                  }
            }
            transition={
              phase === "shredding"
                ? {
                    duration: shred[i].duration,
                    delay:    shred[i].delay,
                    ease:     "easeOut",
                  }
                : {
                    duration: 0.32,
                    delay:    i * 0.028,
                    ease:     "easeOut",
                  }
            }
            style={{
              display: "inline",
              ...PF,
              fontSize: "1.50rem",
              color: "rgba(235,225,255,0.92)",
              whiteSpace: "pre",
              textShadow: "0 0 28px rgba(130,90,220,0.55)",
            }}
          >
            {char}
          </motion.span>
        ))}
      </div>

      {/* ── Countdown bar ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {(phase === "appearing" || phase === "reading") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              width: "100%",
              maxWidth: 280,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            {/* Burning progress bar */}
            <div style={{
              width: "100%",
              height: 2,
              background: "rgba(255,255,255,0.07)",
              borderRadius: 2,
              overflow: "hidden",
            }}>
              {phase === "reading" && (
                <motion.div
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: COUNTDOWN_SEC, ease: "linear" }}
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg, rgba(150,110,230,0.85) 0%, rgba(80,50,150,0.5) 100%)",
                  }}
                />
              )}
            </div>

            <p style={{
              ...QS,
              color: "rgba(255,255,255,0.22)",
              fontSize: "0.62rem",
              letterSpacing: "0.15em",
            }}>
              {phase === "appearing"
                ? "absorb this…"
                : `disappears in ${countdown}s`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shred flash overlay */}
      <AnimatePresence>
        {phase === "shredding" && (
          <motion.div
            key="shred-flash"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(110,70,200,0.18)",
              pointerEvents: "none",
              zIndex: 1001,
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
