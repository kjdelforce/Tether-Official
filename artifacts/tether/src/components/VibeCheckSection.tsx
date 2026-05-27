import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { haptic } from "@/lib/haptics";
import { playVibeSound } from "@/lib/audioManager";

// ── Vibe definitions ───────────────────────────────────────────────
export interface Vibe {
  id: string;
  label: string;
  emoji: string;
  color: string;
  glow: string;
  glowFaint: string;
  bgGradient: string;
}

export const VIBES: Vibe[] = [
  {
    id: "romantic",
    label: "Feeling Romantic",
    emoji: "💕",
    color: "#C53030",
    glow: "rgba(197,48,48,0.65)",
    glowFaint: "rgba(197,48,48,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #E53E3E, #7B1313)",
  },
  {
    id: "happy",
    label: "Happy & Energetic",
    emoji: "⚡",
    color: "#D4A017",
    glow: "rgba(236,201,75,0.65)",
    glowFaint: "rgba(236,201,75,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #ECC94B, #975A16)",
  },
  {
    id: "wonderful",
    label: "Feeling Wonderful",
    emoji: "🌟",
    color: "#0EA5E9",
    glow: "rgba(14,165,233,0.65)",
    glowFaint: "rgba(14,165,233,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #38BDF8, #0C4A6E)",
  },
  {
    id: "calm",
    label: "Feeling Calm",
    emoji: "🌊",
    color: "#3182CE",
    glow: "rgba(99,179,237,0.65)",
    glowFaint: "rgba(99,179,237,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #63B3ED, #1A365D)",
  },
  {
    id: "tired",
    label: "Tired",
    emoji: "😴",
    color: "#805AD5",
    glow: "rgba(159,122,234,0.65)",
    glowFaint: "rgba(159,122,234,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #B794F4, #44337A)",
  },
  {
    id: "cozy",
    label: "Feeling Cozy",
    emoji: "🤗",
    color: "#C05621",
    glow: "rgba(237,137,54,0.65)",
    glowFaint: "rgba(237,137,54,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #F6AD55, #7B341E)",
  },
  {
    id: "angry",
    label: "Angry",
    emoji: "🤬",
    color: "#E53E3E",
    glow: "rgba(229,62,62,0.65)",
    glowFaint: "rgba(229,62,62,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #FC8181, #9B2C2C)",
  },
  {
    id: "sad",
    label: "Sad",
    emoji: "😔",
    color: "#2B4C7E",
    glow: "rgba(43,76,126,0.65)",
    glowFaint: "rgba(43,76,126,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #4A7AB5, #1A2F50)",
  },
  {
    id: "high",
    label: "High",
    emoji: "💨",
    color: "#38A169",
    glow: "rgba(56,161,105,0.65)",
    glowFaint: "rgba(56,161,105,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #68D391, #1C4532)",
  },
  {
    id: "horny",
    label: "Horny",
    emoji: "😈",
    color: "#6B21A8",
    glow: "rgba(107,33,168,0.65)",
    glowFaint: "rgba(107,33,168,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #A855F7, #3B0764)",
  },
  {
    id: "hungry",
    label: "Feel Like Death",
    emoji: "💀",
    color: "#6B7280",
    glow: "rgba(107,114,128,0.65)",
    glowFaint: "rgba(107,114,128,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #9CA3AF, #1F2937)",
  },
  {
    id: "hangry",
    label: "Hangry",
    emoji: "😖",
    color: "#C2410C",
    glow: "rgba(194,65,12,0.65)",
    glowFaint: "rgba(194,65,12,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #EA580C, #7C2D12)",
  },
  {
    id: "sick",
    label: "Feeling Sick",
    emoji: "🤢",
    color: "#7A8C3A",
    glow: "rgba(122,140,58,0.65)",
    glowFaint: "rgba(122,140,58,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #9BAF42, #3D4A14)",
  },
  {
    id: "nervous",
    label: "Nervous",
    emoji: "😬",
    color: "#B7971A",
    glow: "rgba(183,151,26,0.65)",
    glowFaint: "rgba(183,151,26,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #D4AC1E, #6B5700)",
  },
  {
    id: "scared",
    label: "Scared",
    emoji: "😱",
    color: "#7C3AED",
    glow: "rgba(124,58,237,0.65)",
    glowFaint: "rgba(124,58,237,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #8B5CF6, #2E1065)",
  },
  {
    id: "pissed-off",
    label: "Pissed Off",
    emoji: "😡",
    color: "#DC2626",
    glow: "rgba(220,38,38,0.7)",
    glowFaint: "rgba(220,38,38,0.24)",
    bgGradient: "radial-gradient(circle at 35% 35%, #EF4444, #450A0A)",
  },
  {
    id: "exhausted",
    label: "Exhausted",
    emoji: "🥱",
    color: "#64748B",
    glow: "rgba(100,116,139,0.65)",
    glowFaint: "rgba(100,116,139,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #6B7E94, #1E2A38)",
  },
  {
    id: "sleepy",
    label: "Sleepy",
    emoji: "😴",
    color: "#818CF8",
    glow: "rgba(129,140,248,0.65)",
    glowFaint: "rgba(129,140,248,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #A5B4FC, #1E1B4B)",
  },
  {
    id: "excited",
    label: "Excited",
    emoji: "😝",
    color: "#EC4899",
    glow: "rgba(236,72,153,0.65)",
    glowFaint: "rgba(236,72,153,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #F472B6, #6B0030)",
  },
  {
    id: "drunk",
    label: "Drunk",
    emoji: "🥴",
    color: "#A855F7",
    glow: "rgba(168,85,247,0.65)",
    glowFaint: "rgba(168,85,247,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #C084FC, #3B0764)",
  },
  {
    id: "hungover",
    label: "Hungover",
    emoji: "😵",
    color: "#78716C",
    glow: "rgba(120,113,108,0.65)",
    glowFaint: "rgba(120,113,108,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #92827C, #1C1412)",
  },
  {
    id: "anxious",
    label: "Anxious",
    emoji: "😟",
    color: "#0EA5E9",
    glow: "rgba(14,165,233,0.65)",
    glowFaint: "rgba(14,165,233,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #38BDF8, #0C2D48)",
  },
  {
    id: "content",
    label: "Content",
    emoji: "😌",
    color: "#4ADE80",
    glow: "rgba(74,222,128,0.60)",
    glowFaint: "rgba(74,222,128,0.20)",
    bgGradient: "radial-gradient(circle at 35% 35%, #6EE7A0, #14532D)",
  },
  {
    id: "sore",
    label: "Sore",
    emoji: "🤕",
    color: "#BE6472",
    glow: "rgba(190,100,114,0.65)",
    glowFaint: "rgba(190,100,114,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #E08892, #6B1F2A)",
  },
  {
    id: "brave",
    label: "Brave",
    emoji: "🦁",
    color: "#0D9488",
    glow: "rgba(13,148,136,0.65)",
    glowFaint: "rgba(13,148,136,0.22)",
    bgGradient: "radial-gradient(circle at 35% 35%, #2DD4BF, #042F2E)",
  },
];

const DEFAULT_GLOW   = "rgba(255,255,255,0.12)";
const DEFAULT_FAINT  = "rgba(255,255,255,0.04)";
const DEFAULT_BG     = "radial-gradient(circle at 35% 35%, #2D3748, #1A202C)";

function getVibe(id: string | null | undefined): Vibe | null {
  return VIBES.find(v => v.id === id) ?? null;
}

// ── Fonts ──────────────────────────────────────────────────────────
const PLAYFAIR = { fontFamily: "'Playfair Display', serif" };
const QS       = { fontFamily: "'Quicksand', sans-serif" };
const CAVEAT   = { fontFamily: "'Caveat', cursive" };

// ── Avatar with glow ───────────────────────────────────────────────
function Avatar({
  name,
  vibeId,
  isMe,
  onTap,
}: {
  name: string;
  vibeId: string | null;
  isMe: boolean;
  onTap?: () => void;
}) {
  const vibe = getVibe(vibeId);
  const glow      = vibe?.glow      ?? DEFAULT_GLOW;
  const glowFaint = vibe?.glowFaint ?? DEFAULT_FAINT;
  const bg        = vibe?.bgGradient ?? DEFAULT_BG;
  const initial   = name.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col items-center gap-2" style={{ minWidth: 90 }}>
      {/* Avatar circle with animated glow */}
      <motion.button
        onClick={onTap}
        disabled={!isMe}
        style={{ background: "none", border: "none", padding: 0, cursor: isMe ? "pointer" : "default" }}
        whileTap={isMe ? { scale: 0.92 } : {}}
      >
        <div style={{ position: "relative", width: 76, height: 76 }}>
          {/* Outer glow pulse */}
          <motion.div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${glow} 0%, ${glowFaint} 55%, transparent 75%)`,
            }}
            animate={vibe ? { scale: [1, 1.12, 1], opacity: [0.8, 1, 0.8] } : { scale: 1, opacity: 0.4 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Avatar circle */}
          <div
            style={{
              position: "relative",
              width: 76,
              height: 76,
              borderRadius: "50%",
              background: bg,
              boxShadow: [
                `0 0 0 2.5px ${vibe ? vibe.color + "90" : "rgba(255,255,255,0.12)"}`,
                `0 0 18px 5px ${glow}`,
                `0 0 36px 10px ${glowFaint}`,
                "0 4px 16px rgba(0,0,0,0.4)",
              ].join(", "),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "box-shadow 0.6s ease, background 0.6s ease",
            }}
          >
            <span
              style={{
                ...PLAYFAIR,
                color: "rgba(255,255,255,0.92)",
                fontSize: "1.9rem",
                fontWeight: 700,
                lineHeight: 1,
                userSelect: "none",
              }}
            >
              {initial}
            </span>

            {/* "Tap to set" hint for own avatar when no vibe */}
            {isMe && !vibe && (
              <motion.div
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.15)",
                  border: "1.5px solid rgba(255,255,255,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.6rem",
                }}
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                ✨
              </motion.div>
            )}

            {/* Vibe emoji badge */}
            {vibe && (
              <motion.div
                key={vibe.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{
                  position: "absolute",
                  bottom: -3,
                  right: -3,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(15,20,40,0.9)",
                  border: `1.5px solid ${vibe.color}60`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                }}
              >
                {vibe.emoji}
              </motion.div>
            )}
          </div>
        </div>
      </motion.button>

      {/* Name */}
      <p style={{ ...QS, color: "rgba(255,255,255,0.8)", fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>
        {name}
      </p>

      {/* Vibe label */}
      <AnimatePresence mode="wait">
        {vibe ? (
          <motion.p
            key={vibe.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            style={{
              ...CAVEAT,
              color: vibe.color,
              fontSize: "1.1rem",
              margin: 0,
              textAlign: "center",
              lineHeight: 1.2,
              filter: `drop-shadow(0 0 6px ${vibe.glow})`,
            }}
          >
            {vibe.emoji} {vibe.label}
          </motion.p>
        ) : (
          <motion.p
            key="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              ...CAVEAT,
              color: "rgba(147,197,253,0.35)",
              fontSize: "1rem",
              margin: 0,
            }}
          >
            {isMe ? "tap to set vibe" : "no vibe set"}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Vibe picker sheet ──────────────────────────────────────────────
function VibePicker({
  currentVibe,
  onSelect,
  onClose,
}: {
  currentVibe: string | null;
  onSelect: (vibeId: string | null) => void;
  onClose: () => void;
}) {
  const sheetRef  = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sheet     = sheetRef.current;
    const scrollEl  = scrollRef.current;
    if (!sheet) return;

    // Track touch start Y so we can detect direction at the boundary
    let startY = 0;

    // ── touchstart: record start position, stop it reaching PullToRefresh ──
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      e.stopPropagation(); // block PullToRefresh from seeing this gesture
    };

    // ── touchmove: the critical handler ────────────────────────────────────
    // stopPropagation() → PullToRefresh never fires
    // preventDefault() at boundary → iOS can't chain the scroll to the page
    const onTouchMove = (e: TouchEvent) => {
      e.stopPropagation(); // always block — PullToRefresh must not fire

      const dy = e.touches[0].clientY - startY;

      if (scrollEl && scrollEl.contains(e.target as Node)) {
        // Touch is on the scrollable list
        const atTop    = scrollEl.scrollTop <= 0;
        const atBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;

        // At a boundary and trying to go further → prevent iOS scroll chain
        if ((dy > 0 && atTop) || (dy < 0 && atBottom)) {
          e.preventDefault();
        }
        // Otherwise let the browser handle native scroll (do NOT preventDefault)
      } else {
        // Touch on non-scrollable zone (handle bar, title, padding)
        // Always prevent — nothing should scroll here
        e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      e.stopPropagation();
    };

    sheet.addEventListener("touchstart", onTouchStart, { passive: true  });
    sheet.addEventListener("touchmove",  onTouchMove,  { passive: false });
    sheet.addEventListener("touchend",   onTouchEnd,   { passive: true  });

    return () => {
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove",  onTouchMove);
      sheet.removeEventListener("touchend",   onTouchEnd);
    };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Sheet */}
      <motion.div
        ref={sheetRef}
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          borderRadius: "20px 20px 0 0",
          background: "linear-gradient(160deg, rgba(26,37,64,0.97) 0%, rgba(15,21,32,0.97) 100%)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderBottom: "none",
          boxShadow: "0 -8px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)",
          padding: "20px 20px 40px",
          // GPU layer — prevents compositing issues with inner scroll on iOS
          transform: "translateZ(0)",
          willChange: "transform",
        }}
      >
        {/* Handle */}
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "rgba(255,255,255,0.2)",
            margin: "0 auto 20px",
          }}
        />

        <p style={{ ...PLAYFAIR, color: "white", fontSize: "1.15rem", fontWeight: 600, marginBottom: 16, textAlign: "center" }}>
          How are you feeling?
        </p>

        {/* Vibe options — scrollable */}
        <div style={{ position: "relative" }}>
          <div
            ref={scrollRef}
            className="vibe-picker-scroll"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              maxHeight: "52vh",
              paddingBottom: 8,
            }}
          >
          {VIBES.map(vibe => {
            const selected = currentVibe === vibe.id;
            return (
              <motion.button
                key={vibe.id}
                onClick={() => { haptic("tap"); if (!selected) playVibeSound(vibe.id); onSelect(selected ? null : vibe.id); }}
                whileTap={{ scale: 0.97 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: `1.5px solid ${selected ? vibe.color + "80" : "rgba(255,255,255,0.12)"}`,
                  background: selected
                    ? `linear-gradient(135deg, ${vibe.color}28 0%, ${vibe.color}12 100%)`
                    : "rgba(255,255,255,0.07)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  boxShadow: selected
                    ? `0 0 20px ${vibe.glow}, inset 0 1px 0 rgba(255,255,255,0.12)`
                    : "inset 0 1px 0 rgba(255,255,255,0.08)",
                  flexShrink: 0, // prevent rows from compressing
                }}
              >
                {/* Color swatch */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: vibe.bgGradient,
                    boxShadow: `0 0 12px ${vibe.glow}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.1rem",
                    flexShrink: 0,
                  }}
                >
                  {vibe.emoji}
                </div>

                <span style={{ ...QS, color: "rgba(255,255,255,0.85)", fontSize: "0.95rem", fontWeight: 600, flex: 1, textAlign: "left" }}>
                  {vibe.label}
                </span>

                {selected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{ color: vibe.color, fontSize: "1rem" }}
                  >
                    ✓
                  </motion.span>
                )}
              </motion.button>
            );
          })}

          {/* Clear option */}
          {currentVibe && (
            <button
              onClick={() => { haptic("light"); onSelect(null); }}
              style={{
                marginTop: 4,
                padding: "8px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.3)",
                fontSize: "0.8rem",
                ...QS,
              }}
            >
              Clear vibe
            </button>
          )}
          </div>

          {/* Fade-out gradient to hint there's more to scroll */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 48,
              background: "linear-gradient(to bottom, transparent 0%, rgba(15,21,32,0.9) 100%)",
              pointerEvents: "none",
            }}
          />
        </div>
      </motion.div>
    </>
  );
}

// ── Main export ────────────────────────────────────────────────────
export function VibeCheckSection({
  tetherId,
  myId,
  myName,
  partnerId,
  partnerName,
  initialMyVibe,
  initialPartnerVibe,
}: {
  tetherId: string;
  myId: string;
  myName: string;
  partnerId: string | null;
  partnerName: string;
  initialMyVibe: string | null;
  initialPartnerVibe: string | null;
}) {
  const [myVibe,      setMyVibe]      = useState<string | null>(initialMyVibe);
  const [partnerVibe, setPartnerVibe] = useState<string | null>(initialPartnerVibe);
  const [showPicker,  setShowPicker]  = useState(false);

  // ── Real-time subscription ────────────────────────────────────────
  useEffect(() => {
    if (!tetherId) return;

    const channel = supabase
      .channel(`vibes-${tetherId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `tether_id=eq.${tetherId}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; current_vibe?: string | null };
          if (updated.id === myId) {
            setMyVibe(updated.current_vibe ?? null);
          } else if (updated.id === partnerId) {
            setPartnerVibe(updated.current_vibe ?? null);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tetherId, myId, partnerId]);

  // ── Select vibe ───────────────────────────────────────────────────
  const selectVibe = useCallback(async (vibeId: string | null) => {
    setShowPicker(false);
    setMyVibe(vibeId); // optimistic
    haptic(vibeId ? "success" : "tap");

    await supabase
      .from("profiles")
      .update({ current_vibe: vibeId })
      .eq("id", myId);
  }, [myId]);

  return (
    <>
      <AnimatePresence>
        {showPicker && (
          <VibePicker
            key="picker"
            currentVibe={myVibe}
            onSelect={selectVibe}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 28,
          paddingTop: 4,
          paddingBottom: 4,
        }}
      >
        {/* My avatar */}
        <Avatar
          name={myName}
          vibeId={myVibe}
          isMe
          onTap={() => { haptic("light"); setShowPicker(v => !v); }}
        />

        {/* Link icon */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 26,
            color: "rgba(147,197,253,0.35)",
            fontSize: "1.1rem",
            userSelect: "none",
          }}
        >
          💞
        </div>

        {/* Partner avatar */}
        <Avatar
          name={partnerName}
          vibeId={partnerVibe}
          isMe={false}
        />
      </div>
    </>
  );
}
