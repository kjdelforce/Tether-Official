import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { haptic } from "@/lib/haptics";
import type { TimeCapsule } from "@/pages/CapsulesPage";

interface CapsuleWidgetProps {
  onNavigate: () => void;
}

function timeUntilShort(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Now";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  return "<1h";
}

export function CapsuleWidget({ onNavigate }: CapsuleWidgetProps) {
  const { tether } = useAuth();
  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!tether) { setLoaded(true); return; }
    supabase
      .from("time_capsules")
      .select("id, unlock_type, unlock_at, unlocked, emotional_tag, created_at")
      .eq("tether_id", tether.id)
      .eq("unlocked", false)
      .order("created_at", { ascending: true })
      .limit(10)
      .then(({ data }) => {
        setCapsules((data ?? []) as TimeCapsule[]);
        setLoaded(true);
      });
  }, [tether]);

  if (!loaded) return null;

  const locked = capsules.filter(c => !c.unlocked);
  const ready  = locked.filter(c =>
    c.unlock_type === "date" && c.unlock_at && new Date(c.unlock_at) <= new Date()
  );
  const soonest = locked.find(c => c.unlock_type === "date" && c.unlock_at && !ready.includes(c));

  const hasReady  = ready.length > 0;
  const hasLocked = locked.length > 0;

  // State: none | locked | ready
  const orbColor   = hasReady  ? "#9B5DE5"
                   : hasLocked ? "#C53030"
                   : "rgba(147,197,253,0.25)";
  const glowColor  = hasReady  ? "rgba(155,93,229,0.6)"
                   : hasLocked ? "rgba(197,48,48,0.45)"
                   : "rgba(147,197,253,0.10)";
  const label      = hasReady  ? `${ready.length > 1 ? ready.length + " capsules" : "A capsule"} ready to open ✨`
                   : hasLocked ? (soonest?.unlock_at ? `Unlocks in ${timeUntilShort(soonest.unlock_at)}` : `${locked.length} capsule${locked.length !== 1 ? "s" : ""} waiting`)
                   : "No memories waiting";

  return (
    <motion.button
      onClick={() => { haptic("light"); onNavigate(); }}
      whileTap={{ scale: 0.94 }}
      style={{
        width: "100%", background: "none", border: "none",
        cursor: "pointer", textAlign: "left", padding: 0,
      }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px", borderRadius: 16,
        background: hasReady
          ? "rgba(155,93,229,0.10)"
          : hasLocked
          ? "rgba(197,48,48,0.08)"
          : "rgba(255,255,255,0.04)",
        border: `1px solid ${hasReady ? "rgba(155,93,229,0.30)" : hasLocked ? "rgba(197,48,48,0.20)" : "rgba(255,255,255,0.07)"}`,
        backdropFilter: "blur(12px)",
      }}>
        {/* Orb */}
        <div style={{ position: "relative", width: 38, height: 38, flexShrink: 0 }}>
          {/* Outer halo */}
          {hasLocked && (
            <motion.div
              style={{
                position: "absolute", inset: -5, borderRadius: "50%",
                background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
                pointerEvents: "none",
              }}
              animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.1, 1] }}
              transition={{ duration: hasReady ? 1.8 : 3.5, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          {/* Core orb */}
          <motion.div
            style={{
              width: 38, height: 38, borderRadius: "50%",
              background: `radial-gradient(circle at 35% 30%, ${orbColor}80, ${orbColor}30)`,
              border: `1.5px solid ${orbColor}55`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1rem",
              boxShadow: hasLocked ? `0 0 14px ${glowColor}` : "none",
            }}
            animate={hasReady ? { boxShadow: [
              `0 0 10px ${glowColor}`,
              `0 0 22px ${glowColor}`,
              `0 0 10px ${glowColor}`,
            ]} : {}}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            {hasReady ? "🔓" : hasLocked ? "🔒" : "🌌"}
          </motion.div>

          {/* Shimmer sweep on ready */}
          {hasReady && (
            <motion.div
              style={{
                position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden",
                background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)",
                pointerEvents: "none",
              }}
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
            />
          )}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
            fontSize: "0.82rem", margin: 0,
            color: hasReady ? "#C4B5FD" : hasLocked ? "rgba(255,255,255,0.80)" : "rgba(147,197,253,0.40)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {label}
          </p>
          <p style={{
            fontFamily: "'Quicksand', sans-serif", fontSize: "0.67rem",
            color: "rgba(147,197,253,0.38)", margin: "1px 0 0",
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            Memory Capsules
          </p>
        </div>

        {/* Arrow */}
        {hasLocked && (
          <span style={{ color: hasReady ? "rgba(155,93,229,0.6)" : "rgba(255,255,255,0.20)", fontSize: "0.9rem" }}>
            ›
          </span>
        )}
      </div>
    </motion.button>
  );
}
