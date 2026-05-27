import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { PullToRefresh } from "@/components/PullToRefresh";

// ── Types ─────────────────────────────────────────────────────────
export type TimeCapsule = {
  id: string;
  tether_id: string;
  sender_id: string;
  title: string;
  message: string | null;
  media_url: string | null;
  media_type: "image" | "voice" | null;
  emotional_tag: "love" | "surprise" | "spicy" | "cozy" | "nostalgic";
  unlock_type: "date" | "together" | "inactivity";
  unlock_at: string | null;
  unlock_after_days: number | null;
  unlocked: boolean;
  unlocked_at: string | null;
  created_at: string;
};

export type CapsuleReaction = {
  id: string;
  capsule_id: string;
  user_id: string;
  reaction: "❤️" | "😭" | "🔥";
  created_at: string;
};

// ── Constants ─────────────────────────────────────────────────────
const BUCKET = "tether-images";

const TAG_CONFIG = {
  love:      { icon: "💕", label: "Love",      color: "#E53E3E", glow: "rgba(229,62,62,0.55)"   },
  surprise:  { icon: "✨", label: "Surprise",  color: "#9B5DE5", glow: "rgba(155,93,229,0.55)"  },
  spicy:     { icon: "🔥", label: "Spicy",     color: "#F97316", glow: "rgba(249,115,22,0.55)"  },
  cozy:      { icon: "🧸", label: "Cozy",      color: "#D4A017", glow: "rgba(212,160,23,0.55)"  },
  nostalgic: { icon: "🌙", label: "Nostalgic", color: "#60A5FA", glow: "rgba(96,165,250,0.55)"  },
} as const;

type TagKey = keyof typeof TAG_CONFIG;

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Now";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function isReady(c: TimeCapsule): boolean {
  if (c.unlocked) return false;
  if (c.unlock_type === "date" && c.unlock_at) return new Date(c.unlock_at) <= new Date();
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// Locked Capsule Orb Card
// ═══════════════════════════════════════════════════════════════════
function LockedCapsuleCard({
  capsule, authorName, onOpen, onOpenTogether,
}: {
  capsule: TimeCapsule;
  authorName: string;
  onOpen: () => void;
  onOpenTogether: () => void;
}) {
  const tag = TAG_CONFIG[capsule.emotional_tag];
  const ready = isReady(capsule);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      style={{
        borderRadius: 22,
        border: `1px solid ${ready ? tag.color + "80" : "rgba(255,255,255,0.10)"}`,
        background: ready
          ? `linear-gradient(135deg, ${tag.color}18 0%, rgba(14,16,28,0.95) 60%)`
          : "rgba(14,16,28,0.85)",
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Pulsing / shimmer glow */}
      <motion.div
        style={{
          position: "absolute", inset: 0, borderRadius: 22, pointerEvents: "none", zIndex: 0,
          boxShadow: `0 0 0px ${tag.glow}`,
        }}
        animate={ready ? {
          boxShadow: [
            `0 0 20px ${tag.glow}, 0 0 60px ${tag.glow}60`,
            `0 0 40px ${tag.glow}, 0 0 100px ${tag.glow}80`,
            `0 0 20px ${tag.glow}, 0 0 60px ${tag.glow}60`,
          ],
        } : {
          boxShadow: [
            `0 0 10px ${tag.glow}40`,
            `0 0 25px ${tag.glow}70`,
            `0 0 10px ${tag.glow}40`,
          ],
        }}
        transition={{ duration: ready ? 2 : 3.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Shimmer sweep for ready state */}
      {ready && (
        <motion.div
          style={{
            position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", borderRadius: 22,
            background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)",
          }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.5 }}
        />
      )}

      <div style={{ padding: "20px 20px 16px", position: "relative", zIndex: 2 }}>
        {/* Top row: orb + lock status */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          {/* Orb */}
          <motion.div
            style={{
              width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
              background: `radial-gradient(circle at 35% 30%, ${tag.color}55, ${tag.color}18)`,
              border: `1.5px solid ${tag.color}50`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.4rem",
              boxShadow: `0 0 18px ${tag.glow}`,
            }}
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          >
            {ready ? "🔓" : "🔒"}
          </motion.div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Tag chip */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: "0.75rem" }}>{tag.icon}</span>
              <span style={{
                fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", color: tag.color,
                fontFamily: "'Quicksand', sans-serif",
              }}>
                {tag.label}
              </span>
            </div>

            {/* Blurred title */}
            <div style={{
              filter: "blur(5px)", userSelect: "none", WebkitUserSelect: "none",
              fontFamily: "'Playfair Display', serif",
              color: "rgba(255,255,255,0.85)", fontSize: "1.05rem", fontWeight: 600,
              marginBottom: 4,
            }}>
              {capsule.title}
            </div>

            {/* Blurred preview */}
            {capsule.message && (
              <div style={{
                filter: "blur(7px)", userSelect: "none", WebkitUserSelect: "none",
                color: "rgba(147,197,253,0.6)", fontSize: "0.8rem",
                fontFamily: "'Caveat', cursive",
                maxHeight: 36, overflow: "hidden",
              }}>
                {capsule.message}
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "14px 0 12px" }} />

        {/* Bottom row: condition + action */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div>
            <div style={{
              color: "rgba(147,197,253,0.55)", fontSize: "0.65rem",
              fontFamily: "'Quicksand', sans-serif", fontWeight: 600,
              letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2,
            }}>
              {capsule.unlock_type === "date" ? "Unlocks" :
               capsule.unlock_type === "together" ? "Open together" : "After inactivity"}
            </div>
            <div style={{
              color: ready ? tag.color : "rgba(255,255,255,0.65)", fontSize: "0.82rem",
              fontFamily: "'Caveat', cursive", fontWeight: ready ? 700 : 400,
            }}>
              {capsule.unlock_type === "date" && capsule.unlock_at
                ? (ready ? "Ready to open ✨" : `in ${timeUntil(capsule.unlock_at)}`)
                : capsule.unlock_type === "together"
                ? "Tap together with partner"
                : capsule.unlock_after_days
                ? `After ${capsule.unlock_after_days}d of silence`
                : "When the time comes"}
            </div>
          </div>

          {/* Action button */}
          {ready ? (
            <motion.button
              onClick={onOpen}
              whileTap={{ scale: 0.88 }}
              style={{
                padding: "8px 18px", borderRadius: 20, border: "none", cursor: "pointer",
                background: `linear-gradient(135deg, ${tag.color}, ${tag.color}88)`,
                color: "white", fontFamily: "'Quicksand', sans-serif",
                fontWeight: 700, fontSize: "0.82rem",
                boxShadow: `0 4px 16px ${tag.glow}`,
              }}
            >
              Open ✨
            </motion.button>
          ) : capsule.unlock_type === "together" ? (
            <motion.button
              onClick={onOpenTogether}
              whileTap={{ scale: 0.88 }}
              style={{
                padding: "8px 14px", borderRadius: 20, border: `1px solid ${tag.color}60`,
                cursor: "pointer", background: `${tag.color}18`,
                color: tag.color, fontFamily: "'Quicksand', sans-serif",
                fontWeight: 700, fontSize: "0.78rem",
              }}
            >
              💞 Open Together
            </motion.button>
          ) : (
            <span style={{
              fontSize: "0.7rem", color: "rgba(255,255,255,0.25)",
              fontFamily: "'Quicksand', sans-serif", fontStyle: "italic",
            }}>
              From {authorName}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Unlocked Capsule Card
// ═══════════════════════════════════════════════════════════════════
function UnlockedCapsuleCard({
  capsule, authorName, myId, reactions, onReact, onEdit, onDelete,
}: {
  capsule: TimeCapsule;
  authorName: string;
  myId: string;
  reactions: CapsuleReaction[];
  onReact: (emoji: "❤️" | "😭" | "🔥") => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tag = TAG_CONFIG[capsule.emotional_tag];
  const myReaction = reactions.find(r => r.user_id === myId)?.reaction;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      style={{
        borderRadius: 22,
        border: `1px solid ${tag.color}40`,
        background: `linear-gradient(135deg, ${tag.color}12 0%, rgba(14,16,28,0.97) 70%)`,
        backdropFilter: "blur(20px)",
        overflow: "hidden",
        boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 30px ${tag.glow}30`,
      }}
    >
      <div style={{ padding: "20px 20px 16px" }}>
        {/* Top row: tag + meta */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontSize: "0.7rem", background: `${tag.color}22`, color: tag.color,
              border: `1px solid ${tag.color}40`, borderRadius: 20,
              padding: "2px 8px", fontFamily: "'Quicksand', sans-serif",
              fontWeight: 700, letterSpacing: "0.08em",
            }}>
              {tag.icon} {tag.label}
            </span>
          </div>
          <span style={{
            fontSize: "0.68rem", color: "rgba(147,197,253,0.45)",
            fontFamily: "'Quicksand', sans-serif",
          }}>
            From {authorName} · {timeAgo(capsule.unlocked_at ?? capsule.created_at)}
          </span>
        </div>

        {/* Title */}
        <h3 style={{
          fontFamily: "'Playfair Display', serif",
          color: "rgba(255,255,255,0.92)", fontSize: "1.15rem", fontWeight: 700,
          margin: "0 0 8px",
        }}>
          {capsule.title}
        </h3>

        {/* Message */}
        {capsule.message && (
          <p style={{
            fontFamily: "'Caveat', cursive",
            color: "rgba(190,220,255,0.85)", fontSize: "1.05rem",
            lineHeight: 1.5, margin: "0 0 12px",
          }}>
            {capsule.message}
          </p>
        )}

        {/* Media */}
        {capsule.media_url && capsule.media_type === "image" && (
          <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
            <img
              src={capsule.media_url}
              alt="Memory"
              style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }}
            />
          </div>
        )}

        {capsule.media_url && capsule.media_type === "voice" && (
          <div style={{
            background: "rgba(255,255,255,0.06)", borderRadius: 14,
            padding: "10px 14px", marginBottom: 12,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: "1.4rem" }}>🎙️</span>
            <audio controls src={capsule.media_url} style={{ flex: 1, height: 32 }} />
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "12px 0" }} />

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
          {(["❤️", "😭", "🔥"] as const).map(emoji => {
            const count = reactions.filter(r => r.reaction === emoji).length;
            const isMe = myReaction === emoji;
            return (
              <motion.button
                key={emoji}
                onClick={() => onReact(emoji)}
                whileTap={{ scale: 0.82 }}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer",
                  background: isMe ? `${tag.color}30` : "rgba(255,255,255,0.06)",
                  boxShadow: isMe ? `0 0 10px ${tag.glow}` : "none",
                  transition: "all 0.2s",
                }}
              >
                <span style={{ fontSize: "1rem" }}>{emoji}</span>
                {count > 0 && (
                  <span style={{
                    fontSize: "0.72rem", fontFamily: "'Quicksand', sans-serif",
                    fontWeight: 700, color: isMe ? tag.color : "rgba(255,255,255,0.45)",
                  }}>
                    {count}
                  </span>
                )}
              </motion.button>
            );
          })}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onEdit}
              style={{
                padding: "6px 10px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.7)",
                fontFamily: "'Quicksand', sans-serif",
                fontSize: "0.7rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Edit
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onDelete}
              style={{
                padding: "6px 10px",
                borderRadius: 14,
                border: "1px solid rgba(229,62,62,0.28)",
                background: "rgba(229,62,62,0.10)",
                color: "rgba(255,180,180,0.92)",
                fontFamily: "'Quicksand', sans-serif",
                fontSize: "0.7rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Delete
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function EditCapsuleModal({
  capsule,
  onClose,
  onSave,
  onDelete,
}: {
  capsule: TimeCapsule;
  onClose: () => void;
  onSave: (updated: Partial<TimeCapsule>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(capsule.title);
  const [message, setMessage] = useState(capsule.message ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(14px)",
        display: "flex",
        alignItems: "flex-end",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 32 }}
        style={{
          width: "100%",
          background: "rgba(10,12,22,0.98)",
          borderRadius: "28px 28px 0 0",
          border: "1px solid rgba(255,255,255,0.10)",
          padding: "14px 20px 24px",
          maxHeight: "90svh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, color: "white", fontFamily: "'Playfair Display', serif" }}>Edit Memory</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", fontSize: "1.4rem" }}>×</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              color: "white",
              padding: "12px 14px",
              outline: "none",
            }}
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              color: "white",
              padding: "12px 14px",
              outline: "none",
              resize: "vertical",
            }}
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({ title: title.trim(), message: message.trim() || null });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 16,
              border: "none",
              background: "linear-gradient(135deg, #C53030, #7B1313)",
              color: "white",
              fontWeight: 700,
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={async () => {
              setDeleting(true);
              try {
                await onDelete();
                onClose();
              } finally {
                setDeleting(false);
              }
            }}
            disabled={deleting}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: 16,
              border: "1px solid rgba(229,62,62,0.28)",
              background: "rgba(229,62,62,0.10)",
              color: "rgba(255,180,180,0.95)",
              fontWeight: 700,
            }}
          >
            {deleting ? "Deleting…" : "Delete Memory"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Cinematic Reveal Overlay
// ═══════════════════════════════════════════════════════════════════
function CinematicReveal({ tag, onComplete }: {
  tag: typeof TAG_CONFIG[TagKey];
  onComplete: () => void;
}) {
  useEffect(() => {
    haptic("medium");
    const t1 = setTimeout(() => haptic("heavy"), 600);
    const t2 = setTimeout(() => { haptic("medium"); onComplete(); }, 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.92)", display: "flex",
        alignItems: "center", justifyContent: "center",
        flexDirection: "column",
      }}
    >
      {/* Glow ring */}
      <motion.div
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 1.5, 1], opacity: [0, 1, 0.7] }}
        transition={{ duration: 1.8, ease: [0.2, 0.8, 0.3, 1] }}
        style={{
          position: "absolute",
          width: 280, height: 280, borderRadius: "50%",
          background: `radial-gradient(circle, ${tag.glow} 0%, transparent 70%)`,
        }}
      />
      {/* Orb */}
      <motion.div
        initial={{ scale: 0.3, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 18, delay: 0.2 }}
        style={{
          width: 100, height: 100, borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, ${tag.color}90, ${tag.color}30)`,
          border: `2px solid ${tag.color}80`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "2.8rem",
          boxShadow: `0 0 60px ${tag.glow}, 0 0 120px ${tag.glow}60`,
          zIndex: 1,
        }}
      >
        {tag.icon}
      </motion.div>
      {/* Text */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        style={{
          marginTop: 24, color: "white", zIndex: 1,
          fontFamily: "'Playfair Display', serif",
          fontSize: "1.3rem", fontWeight: 600,
          textShadow: `0 0 20px ${tag.glow}`,
        }}
      >
        A memory found you 💌
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ delay: 1 }}
        style={{
          color: "rgba(147,197,253,0.7)", marginTop: 8, zIndex: 1,
          fontFamily: "'Quicksand', sans-serif", fontSize: "0.78rem",
          letterSpacing: "0.12em", textTransform: "uppercase",
        }}
      >
        Opening...
      </motion.p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Open Together Modal
// ═══════════════════════════════════════════════════════════════════
function OpenTogetherModal({
  capsule, myId, partnerId, partnerName, tetherId,
  onUnlocked, onClose,
}: {
  capsule: TimeCapsule; myId: string; partnerId: string | null;
  partnerName: string; tetherId: string;
  onUnlocked: () => void; onClose: () => void;
}) {
  const [partnerPresent, setPartnerPresent] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const ch = supabase.channel(`capsule-together-${capsule.id}`, {
      config: { presence: { key: myId } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const keys = Object.keys(state);
      const hasPartner = partnerId ? keys.some(k => {
        const entries = state[k] as Array<{ user_id?: string }>;
        return entries.some(e => e.user_id === partnerId);
      }) : false;

      setPartnerPresent(hasPartner);
      if (hasPartner && keys.length >= 2) {
        startCountdown();
      }
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ user_id: myId, timestamp: Date.now() });
      }
    });

    channelRef.current = ch;
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      supabase.removeChannel(ch);
    };
  }, [capsule.id, myId, partnerId]);

  function startCountdown() {
    if (countdownRef.current) return;
    setCountdown(3);
    let c = 3;
    countdownRef.current = setInterval(() => {
      c--;
      haptic("light");
      if (c <= 0) {
        clearInterval(countdownRef.current!);
        doUnlock();
      } else {
        setCountdown(c);
      }
    }, 1000);
  }

  async function doUnlock() {
    await supabase.from("time_capsules")
      .update({ unlocked: true, unlocked_at: new Date().toISOString() })
      .eq("id", capsule.id);
    onUnlocked();
  }

  const tag = TAG_CONFIG[capsule.emotional_tag];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 800, background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(16px)", display: "flex", alignItems: "center",
        justifyContent: "center", flexDirection: "column", padding: 32,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{
          background: "rgba(14,16,28,0.95)", borderRadius: 28,
          border: `1px solid ${tag.color}40`,
          padding: 32, maxWidth: 340, width: "100%", textAlign: "center",
          boxShadow: `0 0 60px ${tag.glow}30`,
        }}
      >
        {/* Animated orb */}
        <motion.div
          style={{
            width: 80, height: 80, borderRadius: "50%", margin: "0 auto 20px",
            background: `radial-gradient(circle at 35% 30%, ${tag.color}60, ${tag.color}18)`,
            border: `2px solid ${tag.color}50`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "2.2rem", boxShadow: `0 0 30px ${tag.glow}`,
          }}
          animate={{ scale: partnerPresent ? [1, 1.1, 1] : [1, 1.04, 1] }}
          transition={{ duration: partnerPresent ? 1.5 : 3, repeat: Infinity }}
        >
          {countdown !== null ? countdown : "💞"}
        </motion.div>

        <h3 style={{
          fontFamily: "'Playfair Display', serif", color: "white",
          fontSize: "1.25rem", fontWeight: 700, margin: "0 0 8px",
        }}>
          Open Together
        </h3>

        <p style={{
          color: "rgba(147,197,253,0.7)", fontSize: "0.9rem",
          fontFamily: "'Caveat', cursive", margin: "0 0 24px",
        }}>
          {partnerPresent
            ? countdown !== null
              ? `Opening in ${countdown}... 💕`
              : "Both of you are here! ✨"
            : `Waiting for ${partnerName} to join...`}
        </p>

        {/* Presence indicators */}
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 24 }}>
          {[{ name: "You", present: true }, { name: partnerName, present: partnerPresent }].map(u => (
            <div key={u.name} style={{ textAlign: "center" }}>
              <motion.div
                style={{
                  width: 12, height: 12, borderRadius: "50%", margin: "0 auto 4px",
                  background: u.present ? "#22c55e" : "rgba(255,255,255,0.2)",
                  boxShadow: u.present ? "0 0 10px #22c55e" : "none",
                }}
                animate={u.present ? { opacity: [1, 0.5, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span style={{
                fontSize: "0.65rem", color: "rgba(255,255,255,0.5)",
                fontFamily: "'Quicksand', sans-serif",
              }}>
                {u.name}
              </span>
            </div>
          ))}
        </div>

        <button onClick={onClose} style={{
          padding: "10px 24px", borderRadius: 20,
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          color: "rgba(255,255,255,0.6)", cursor: "pointer",
          fontFamily: "'Quicksand', sans-serif", fontSize: "0.85rem",
        }}>
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Create Capsule Modal
// ═══════════════════════════════════════════════════════════════════
function CreateCapsuleModal({
  onClose, onCreated, tetherId, senderId,
}: {
  onClose: () => void;
  onCreated: (c: TimeCapsule) => void;
  tetherId: string;
  senderId: string;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [tag, setTag] = useState<TagKey>("love");
  const [mediaMode, setMediaMode] = useState<"none" | "image" | "voice">("none");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [unlockType, setUnlockType] = useState<"date" | "together" | "inactivity">("date");
  const [unlockAt, setUnlockAt] = useState("");
  const [unlockAfterDays, setUnlockAfterDays] = useState("7");
  const [submitting, setSubmitting] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const minDate = new Date();
  minDate.setMinutes(minDate.getMinutes() + 5);
  const minDateStr = minDate.toISOString().slice(0, 16);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      rec.start();
      recorderRef.current = rec;
      setIsRecording(true);
      haptic("light");
    } catch {
      toast({ title: "Mic access denied", variant: "destructive" });
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setIsRecording(false);
    haptic("medium");
  }

  async function submit() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      let mediaUrl: string | null = null;
      let mediaType: "image" | "voice" | null = null;

      if (mediaMode === "image" && imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `${tetherId}/capsule-${Date.now()}.${ext}`;
        const { error: ue } = await supabase.storage.from(BUCKET).upload(path, imageFile);
        if (ue) throw ue;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        mediaUrl = data.publicUrl;
        mediaType = "image";
      } else if (mediaMode === "voice" && audioBlob) {
        const path = `${tetherId}/voice-${Date.now()}.webm`;
        const { error: ue } = await supabase.storage.from(BUCKET).upload(path, audioBlob);
        if (ue) throw ue;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        mediaUrl = data.publicUrl;
        mediaType = "voice";
      }

      const payload = {
        tether_id: tetherId,
        sender_id: senderId,
        title: title.trim(),
        message: message.trim() || null,
        media_url: mediaUrl,
        media_type: mediaType,
        emotional_tag: tag,
        unlock_type: unlockType,
        unlock_at: unlockType === "date" && unlockAt ? new Date(unlockAt).toISOString() : null,
        unlock_after_days: unlockType === "inactivity" ? parseInt(unlockAfterDays) : null,
        unlocked: false,
        unlocked_at: null,
      };

      const { data, error } = await supabase.from("time_capsules").insert(payload).select().single();
      if (error) throw error;
      haptic("heavy");
      toast({ title: "Capsule sealed 💌", description: "Your memory is locked away safely." });
      onCreated(data as TimeCapsule);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
    setSubmitting(false);
  }

  const tagCfg = TAG_CONFIG[tag];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 700, background: "rgba(0,0,0,0.80)",
        backdropFilter: "blur(12px)", display: "flex", alignItems: "flex-end",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
        style={{
          width: "100%", maxHeight: "90svh",
          background: "rgba(10,12,22,0.98)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "28px 28px 0 0",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Handle */}
        <div style={{ padding: "14px 20px 0", display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.16)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
          <h3 style={{
            fontFamily: "'Playfair Display', serif", color: "white",
            fontSize: "1.15rem", fontWeight: 700, margin: 0,
          }}>
            Seal a Memory 💌
          </h3>
          <p style={{
            color: "rgba(147,197,253,0.55)", fontSize: "0.72rem",
            fontFamily: "'Quicksand', sans-serif", margin: "2px 0 0",
            letterSpacing: "0.08em",
          }}>
            Step {step} of 2 — {step === 1 ? "Content" : "Lock Condition"}
          </p>
        </div>

        {/* Scrollable body */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 20px",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          {step === 1 ? (
            <>
              {/* Title */}
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Give this memory a title..."
                maxLength={60}
                style={{
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 14, padding: "12px 14px", color: "white", fontSize: "0.95rem",
                  outline: "none", fontFamily: "'Playfair Display', serif",
                  width: "100%", boxSizing: "border-box",
                }}
              />

              {/* Message */}
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Write a message for future-you to find..."
                rows={4}
                style={{
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 14, padding: "12px 14px", color: "white", fontSize: "1rem",
                  outline: "none", fontFamily: "'Caveat', cursive", resize: "none",
                  width: "100%", boxSizing: "border-box",
                }}
              />

              {/* Emotional tag */}
              <div>
                <p style={{
                  color: "rgba(147,197,253,0.55)", fontSize: "0.65rem",
                  fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 8px",
                }}>
                  Emotional Tag
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(Object.keys(TAG_CONFIG) as TagKey[]).map(k => {
                    const t = TAG_CONFIG[k];
                    return (
                      <button
                        key={k}
                        onClick={() => setTag(k)}
                        style={{
                          padding: "6px 14px", borderRadius: 20,
                          cursor: "pointer", fontFamily: "'Quicksand', sans-serif",
                          fontWeight: 700, fontSize: "0.78rem", transition: "all 0.2s",
                          background: tag === k ? t.color + "30" : "rgba(255,255,255,0.06)",
                          color: tag === k ? t.color : "rgba(255,255,255,0.5)",
                          boxShadow: tag === k ? `0 0 12px ${t.glow}` : "none",
                          border: tag === k ? `1px solid ${t.color}60` : "1px solid transparent",
                        }}
                      >
                        {t.icon} {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Media */}
              <div>
                <p style={{
                  color: "rgba(147,197,253,0.55)", fontSize: "0.65rem",
                  fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 8px",
                }}>
                  Attach a Memory (optional)
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["none", "image", "voice"] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMediaMode(m)}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 12,
                        cursor: "pointer", fontFamily: "'Quicksand', sans-serif",
                        fontWeight: 600, fontSize: "0.78rem",
                        background: mediaMode === m ? "rgba(197,48,48,0.25)" : "rgba(255,255,255,0.06)",
                        color: mediaMode === m ? "#E53E3E" : "rgba(255,255,255,0.45)",
                        border: mediaMode === m ? "1px solid rgba(197,48,48,0.4)" : "1px solid transparent",
                      }}
                    >
                      {m === "none" ? "None" : m === "image" ? "📸 Photo" : "🎙️ Voice"}
                    </button>
                  ))}
                </div>

                {mediaMode === "image" && (
                  <div style={{ marginTop: 10 }}>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                      onChange={e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        setImageFile(f);
                        const r = new FileReader();
                        r.onload = ev => setImagePreview(ev.target?.result as string);
                        r.readAsDataURL(f);
                      }} />
                    {imagePreview ? (
                      <div style={{ borderRadius: 12, overflow: "hidden", position: "relative" }}>
                        <img src={imagePreview} style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }} />
                        <button onClick={() => { setImageFile(null); setImagePreview(null); }}
                          style={{
                            position: "absolute", top: 8, right: 8, width: 28, height: 28,
                            borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)",
                            color: "white", cursor: "pointer", fontSize: "1rem",
                          }}>
                          ×
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => fileRef.current?.click()}
                        style={{
                          width: "100%", height: 80, borderRadius: 12, border: "2px dashed rgba(255,255,255,0.15)",
                          background: "none", color: "rgba(147,197,253,0.5)", cursor: "pointer",
                          fontFamily: "'Quicksand', sans-serif", fontSize: "0.82rem",
                        }}>
                        📷 Tap to choose photo
                      </button>
                    )}
                  </div>
                )}

                {mediaMode === "voice" && (
                  <div style={{ marginTop: 10 }}>
                    {audioUrl ? (
                      <div style={{
                        background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 14px",
                        display: "flex", alignItems: "center", gap: 10,
                      }}>
                        <audio controls src={audioUrl} style={{ flex: 1, height: 32 }} />
                        <button onClick={() => { setAudioBlob(null); setAudioUrl(null); }}
                          style={{
                            width: 28, height: 28, borderRadius: "50%", border: "none",
                            background: "rgba(255,255,255,0.1)", color: "white", cursor: "pointer",
                          }}>
                          ×
                        </button>
                      </div>
                    ) : (
                      <motion.button
                        onPointerDown={startRecording}
                        onPointerUp={stopRecording}
                        onPointerLeave={stopRecording}
                        animate={isRecording ? { scale: [1, 1.05, 1] } : {}}
                        transition={{ duration: 0.8, repeat: Infinity }}
                        style={{
                          width: "100%", padding: "14px", borderRadius: 12,
                          background: isRecording ? "rgba(229,62,62,0.25)" : "rgba(255,255,255,0.06)",
                          border: isRecording ? "1px solid #E53E3E" : "1px solid rgba(255,255,255,0.1)",
                          color: isRecording ? "#E53E3E" : "rgba(147,197,253,0.6)",
                          cursor: "pointer", fontFamily: "'Quicksand', sans-serif",
                          fontWeight: 700, fontSize: "0.88rem",
                          boxShadow: isRecording ? "0 0 20px rgba(229,62,62,0.3)" : "none",
                        }}
                      >
                        {isRecording ? "🔴 Recording... Release to stop" : "🎙️ Hold to record voice note"}
                      </motion.button>
                    )}
                  </div>
                )}
              </div>

              {/* Next */}
              <motion.button
                onClick={() => { if (title.trim()) { haptic("light"); setStep(2); } }}
                disabled={!title.trim()}
                whileTap={{ scale: 0.96 }}
                style={{
                  width: "100%", padding: "13px", borderRadius: 16, border: "none",
                  background: title.trim()
                    ? `linear-gradient(135deg, ${tagCfg.color}, ${tagCfg.color}88)`
                    : "rgba(255,255,255,0.08)",
                  color: "white", fontFamily: "'Quicksand', sans-serif",
                  fontWeight: 700, fontSize: "0.95rem", cursor: title.trim() ? "pointer" : "not-allowed",
                  opacity: title.trim() ? 1 : 0.45,
                  boxShadow: title.trim() ? `0 4px 20px ${tagCfg.glow}` : "none",
                }}
              >
                Continue → Set Lock Condition
              </motion.button>
            </>
          ) : (
            <>
              {/* Unlock type */}
              <div>
                <p style={{
                  color: "rgba(147,197,253,0.55)", fontSize: "0.65rem",
                  fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
                  letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 10px",
                }}>
                  Lock Condition
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {([
                    { value: "date",       icon: "📅", label: "Specific Date",       desc: "Unlocks on a date you choose" },
                    { value: "together",   icon: "💞", label: "Open Together",        desc: "Both of you open it simultaneously" },
                    { value: "inactivity", icon: "🌙", label: "After Silence",        desc: "Unlocks after days of no activity" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setUnlockType(opt.value)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 14px", borderRadius: 14,
                        cursor: "pointer", textAlign: "left",
                        background: unlockType === opt.value ? `${tagCfg.color}22` : "rgba(255,255,255,0.05)",
                        border: unlockType === opt.value
                          ? `1px solid ${tagCfg.color}55`
                          : "1px solid rgba(255,255,255,0.08)",
                        transition: "all 0.2s",
                      }}
                    >
                      <span style={{ fontSize: "1.3rem", flexShrink: 0 }}>{opt.icon}</span>
                      <div>
                        <div style={{
                          color: unlockType === opt.value ? tagCfg.color : "rgba(255,255,255,0.8)",
                          fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: "0.88rem",
                        }}>
                          {opt.label}
                        </div>
                        <div style={{ color: "rgba(147,197,253,0.5)", fontSize: "0.72rem", fontFamily: "'Quicksand', sans-serif" }}>
                          {opt.desc}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional config */}
              {unlockType === "date" && (
                <div>
                  <p style={{
                    color: "rgba(147,197,253,0.55)", fontSize: "0.65rem",
                    fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
                    letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 8px",
                  }}>
                    Unlock Date & Time
                  </p>
                  <input
                    type="datetime-local"
                    value={unlockAt}
                    min={minDateStr}
                    onChange={e => setUnlockAt(e.target.value)}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 14, padding: "12px 14px", color: "white", fontSize: "0.95rem",
                      outline: "none", fontFamily: "'Quicksand', sans-serif",
                      colorScheme: "dark",
                    }}
                  />
                </div>
              )}

              {unlockType === "inactivity" && (
                <div>
                  <p style={{
                    color: "rgba(147,197,253,0.55)", fontSize: "0.65rem",
                    fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
                    letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 8px",
                  }}>
                    Days of Silence Before Unlock
                  </p>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={unlockAfterDays}
                    onChange={e => setUnlockAfterDays(e.target.value)}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 14, padding: "12px 14px", color: "white", fontSize: "0.95rem",
                      outline: "none", fontFamily: "'Quicksand', sans-serif",
                      colorScheme: "dark",
                    }}
                  />
                  <p style={{
                    color: "rgba(147,197,253,0.4)", fontSize: "0.7rem",
                    fontFamily: "'Quicksand', sans-serif", margin: "6px 0 0",
                  }}>
                    Capsule unlocks after {unlockAfterDays} days of no activity from either of you.
                  </p>
                </div>
              )}

              {unlockType === "together" && (
                <div style={{
                  background: "rgba(155,93,229,0.08)", border: "1px solid rgba(155,93,229,0.25)",
                  borderRadius: 14, padding: "14px 16px", textAlign: "center",
                }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: 6 }}>💞</div>
                  <p style={{
                    color: "rgba(190,220,255,0.8)", fontSize: "0.82rem",
                    fontFamily: "'Caveat', cursive", margin: 0,
                  }}>
                    Both of you need to open the capsule at the same time. You'll see each other's presence in real-time.
                  </p>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button
                  onClick={() => setStep(1)}
                  style={{
                    padding: "12px 20px", borderRadius: 14,
                    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.6)", cursor: "pointer",
                    fontFamily: "'Quicksand', sans-serif", fontWeight: 600,
                  }}
                >
                  ← Back
                </button>
                <motion.button
                  onClick={submit}
                  disabled={submitting || (unlockType === "date" && !unlockAt)}
                  whileTap={{ scale: 0.96 }}
                  style={{
                    flex: 1, padding: "13px", borderRadius: 14, border: "none",
                    background: `linear-gradient(135deg, ${tagCfg.color}, ${tagCfg.color}88)`,
                    color: "white", fontFamily: "'Quicksand', sans-serif",
                    fontWeight: 700, fontSize: "0.95rem",
                    cursor: submitting ? "not-allowed" : "pointer",
                    opacity: (unlockType === "date" && !unlockAt) ? 0.45 : 1,
                    boxShadow: `0 4px 20px ${tagCfg.glow}`,
                  }}
                >
                  {submitting ? "Sealing..." : "Seal Capsule 💌"}
                </motion.button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main CapsulesPage
// ═══════════════════════════════════════════════════════════════════
export default function CapsulesPage() {
  const { profile, partnerProfile, tether } = useAuth();
  const { toast } = useToast();

  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
  const [reactions, setReactions] = useState<Record<string, CapsuleReaction[]>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [togetherCapsule, setTogetherCapsule] = useState<TimeCapsule | null>(null);
  const [editingCapsule, setEditingCapsule] = useState<TimeCapsule | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!tether) { setLoading(false); return; }
    setLoading(true);
    const { data: caps } = await supabase
      .from("time_capsules")
      .select("*")
      .eq("tether_id", tether.id)
      .order("created_at", { ascending: false });

    if (!caps || caps.length === 0) {
      setCapsules([]);
      setReactions({});
      setLoading(false);
      return;
    }

    // Auto-unlock any time-based capsules whose time has passed
    const toUnlock = (caps as TimeCapsule[]).filter(c =>
      !c.unlocked && c.unlock_type === "date" && c.unlock_at && new Date(c.unlock_at) <= new Date()
    );
    if (toUnlock.length > 0) {
      const now = new Date().toISOString();
      await supabase.from("time_capsules")
        .update({ unlocked: true, unlocked_at: now })
        .in("id", toUnlock.map(c => c.id));
      toUnlock.forEach(c => { c.unlocked = true; c.unlocked_at = now; });
    }
    setCapsules(caps as TimeCapsule[]);

    // Fetch reactions for these capsules
    const { data: reacts } = await supabase
      .from("capsule_reactions")
      .select("*")
      .in("capsule_id", caps.map(c => c.id));

    if (reacts) {
      const map: Record<string, CapsuleReaction[]> = {};
      (reacts as CapsuleReaction[]).forEach(r => {
        if (!map[r.capsule_id]) map[r.capsule_id] = [];
        map[r.capsule_id].push(r);
      });
      setReactions(map);
    }
    setLoading(false);
  }, [tether]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!tether) return;
    const ch = supabase.channel(`capsules-rt-${tether.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "time_capsules",
        filter: `tether_id=eq.${tether.id}`,
      }, () => { fetchAll(); })
      .on("postgres_changes", {
        event: "*", schema: "public", table: "capsule_reactions",
      }, () => { fetchAll(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tether, fetchAll]);

  // ── Actions ───────────────────────────────────────────────────────
  async function openCapsule(capsule: TimeCapsule) {
    setRevealingId(capsule.id);
  }

  async function handleRevealComplete(capsule: TimeCapsule) {
    if (!capsule.unlocked) {
      await supabase.from("time_capsules")
        .update({ unlocked: true, unlocked_at: new Date().toISOString() })
        .eq("id", capsule.id);
    }
    setRevealingId(null);
    fetchAll();
  }

  async function handleReact(capsuleId: string, emoji: "❤️" | "😭" | "🔥") {
    if (!profile) return;
    const existing = reactions[capsuleId]?.find(r => r.user_id === profile.id);
    if (existing?.reaction === emoji) {
      await supabase.from("capsule_reactions").delete().eq("id", existing.id);
    } else {
      if (existing) await supabase.from("capsule_reactions").delete().eq("id", existing.id);
      await supabase.from("capsule_reactions").insert({
        capsule_id: capsuleId, user_id: profile.id, reaction: emoji,
      });
    }
    haptic("light");
    fetchAll();
  }

  async function handleSaveCapsule(updated: Partial<TimeCapsule>) {
    if (!editingCapsule) return;
    const payload = {
      title: updated.title ?? editingCapsule.title,
      message: updated.message ?? editingCapsule.message,
    };
    const { error } = await supabase
      .from("time_capsules")
      .update(payload)
      .eq("id", editingCapsule.id);
    if (error) throw error;
    setEditingCapsule(null);
    toast({ title: "Memory updated 💾" });
    fetchAll();
  }

  async function handleDeleteCapsule(capsuleId: string) {
    const { error } = await supabase.from("capsule_reactions").delete().eq("capsule_id", capsuleId);
    if (error) throw error;
    const { error: capsuleError } = await supabase.from("time_capsules").delete().eq("id", capsuleId);
    if (capsuleError) throw capsuleError;
    setEditingCapsule(null);
    toast({ title: "Memory deleted" });
    fetchAll();
  }

  function authorName(senderId: string): string {
    if (senderId === profile?.id) return profile?.full_name ?? "You";
    return partnerProfile?.full_name ?? "Partner";
  }

  const locked   = capsules.filter(c => !c.unlocked);
  const unlocked = capsules.filter(c => c.unlocked);

  const revealingCapsule = revealingId ? capsules.find(c => c.id === revealingId) : null;

  return (
    <PullToRefresh onRefresh={fetchAll}>

      {/* Header */}
      <div style={{ padding: "16px 20px 4px" }}>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          color: "rgba(255,255,255,0.92)", fontSize: "1.3rem", fontWeight: 700, margin: 0,
        }}>
          Memory Capsules
        </h2>
        <p style={{
          color: "rgba(147,197,253,0.45)", fontSize: "0.62rem",
          fontFamily: "'Quicksand', sans-serif",
          letterSpacing: "0.14em", textTransform: "uppercase", margin: "2px 0 0",
        }}>
          {locked.length} sealed · {unlocked.length} revealed
        </p>
      </div>

      {/* Content */}
      <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ fontSize: "2.5rem", marginBottom: 12 }}
            >
              💌
            </motion.div>
            <p style={{
              color: "rgba(147,197,253,0.4)", fontSize: "0.78rem",
              fontFamily: "'Quicksand', sans-serif",
            }}>
              Finding your memories...
            </p>
          </div>
        ) : capsules.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0 40px" }}>
            <motion.div
              animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              style={{ fontSize: "3.5rem", marginBottom: 16 }}
            >
              🌌
            </motion.div>
            <p style={{
              fontFamily: "'Playfair Display', serif",
              color: "rgba(255,255,255,0.65)", fontSize: "1.05rem", marginBottom: 6,
            }}>
              No memories waiting
            </p>
            <p style={{
              color: "rgba(147,197,253,0.4)", fontSize: "0.82rem",
              fontFamily: "'Caveat', cursive",
            }}>
              Seal a memory today for your future selves ✨
            </p>
          </div>
        ) : (
          <>
            {/* Locked capsules */}
            {locked.length > 0 && (
              <div>
                <p style={{
                  color: "rgba(147,197,253,0.45)", fontSize: "0.62rem",
                  fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 10px 2px",
                }}>
                  🔒 Sealed
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <AnimatePresence>
                    {locked.map(c => (
                      <LockedCapsuleCard
                        key={c.id}
                        capsule={c}
                        authorName={authorName(c.sender_id)}
                        onOpen={() => openCapsule(c)}
                        onOpenTogether={() => setTogetherCapsule(c)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Unlocked capsules */}
            {unlocked.length > 0 && (
              <div style={{ marginTop: locked.length > 0 ? 8 : 0 }}>
                <p style={{
                  color: "rgba(147,197,253,0.45)", fontSize: "0.62rem",
                  fontFamily: "'Quicksand', sans-serif", fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 10px 2px",
                }}>
                  ✨ Revealed
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <AnimatePresence>
                    {unlocked.map(c => (
                      <UnlockedCapsuleCard
                        key={c.id}
                        capsule={c}
                        authorName={authorName(c.sender_id)}
                        myId={profile?.id ?? ""}
                        reactions={reactions[c.id] ?? []}
                        onReact={emoji => handleReact(c.id, emoji)}
                        onEdit={() => setEditingCapsule(c)}
                        onDelete={async () => {
                          if (!window.confirm("Delete this memory capsule?")) return;
                          await handleDeleteCapsule(c.id);
                        }}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      {createPortal(
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ position: "fixed", bottom: 110, right: 24, zIndex: 500 }}
        >
          <motion.button
            onClick={() => { haptic("medium"); setCreating(true); }}
            whileTap={{ scaleX: 1.22, scaleY: 0.78 }}
            transition={{ type: "spring", stiffness: 700, damping: 10, mass: 0.6 }}
            style={{
              width: 58, height: 58, borderRadius: "50%",
              border: "1px solid rgba(155,93,229,0.55)",
              background: "rgba(155,93,229,0.18)",
              backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
              color: "white", fontSize: "1.7rem", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: [
                "0 0 0 1px rgba(155,93,229,0.20)",
                "0 0 20px rgba(155,93,229,0.35)",
                "0 8px 32px rgba(0,0,0,0.45)",
                "inset 0 1px 0 rgba(255,255,255,0.15)",
              ].join(", "),
            }}
          >
            +
          </motion.button>
        </motion.div>,
        document.body,
      )}

      {/* Create modal */}
      <AnimatePresence>
        {creating && tether && profile && (
          <CreateCapsuleModal
            tetherId={tether.id}
            senderId={profile.id}
            onClose={() => setCreating(false)}
            onCreated={c => {
              setCapsules(prev => [c, ...prev]);
              setCreating(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Open Together modal */}
      <AnimatePresence>
        {togetherCapsule && tether && profile && (
          <OpenTogetherModal
            capsule={togetherCapsule}
            myId={profile.id}
            partnerId={partnerProfile?.id ?? null}
            partnerName={partnerProfile?.full_name ?? "Partner"}
            tetherId={tether.id}
            onUnlocked={() => {
              setTogetherCapsule(null);
              setRevealingId(togetherCapsule.id);
            }}
            onClose={() => setTogetherCapsule(null)}
          />
        )}
      </AnimatePresence>

      {/* Cinematic reveal */}
      <AnimatePresence>
        {revealingCapsule && (
          <CinematicReveal
            tag={TAG_CONFIG[revealingCapsule.emotional_tag]}
            onComplete={() => handleRevealComplete(revealingCapsule)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editingCapsule && (
          <EditCapsuleModal
            capsule={editingCapsule}
            onClose={() => setEditingCapsule(null)}
            onSave={handleSaveCapsule}
            onDelete={() => handleDeleteCapsule(editingCapsule.id)}
          />
        )}
      </AnimatePresence>
    </PullToRefresh>
  );
}

