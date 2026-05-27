import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { haptic } from "@/lib/haptics";
import { PullToRefresh } from "@/components/PullToRefresh";

// ── Font tokens ─────────────────────────────────────────────────────
const PF = { fontFamily: "'Playfair Display', serif" };
const QS = { fontFamily: "'Quicksand', sans-serif" };

// ── The 12 matrix items ─────────────────────────────────────────────
const MATRIX_ITEMS = [
  { key: "massage_full_body",    label: "Massage (Full Body)",                     emoji: "💆" },
  { key: "outdoor_adventures",   label: "Outdoor Adventures",                      emoji: "🌿" },
  { key: "shower_bath_together", label: "Shower / Bath Together",                  emoji: "🛁" },
  { key: "morning_quickie",      label: "Morning Quickie",                         emoji: "🌅" },
  { key: "blindfolds_sensory",   label: "Blindfolds / Sensory Play",               emoji: "🙈" },
  { key: "video_photo_vault",    label: "Video / Photo Recording (to the Vault)",  emoji: "🎬" },
  { key: "power_play_dominance", label: "Power Play / Dominance",                  emoji: "👑" },
  { key: "music_synced_gaga",    label: "Music-Synced Play (Gaga Mode)",           emoji: "🎵" },
  { key: "toys_accessories",     label: "Toys / Accessories",                      emoji: "✨" },
  { key: "scenarios",            label: "Scenarios",                               emoji: "📖" },
  { key: "kinks_fantasies",      label: "Kinks and Fantasies",                     emoji: "🔥" },
] as const;

type ItemKey  = typeof MATRIX_ITEMS[number]["key"];
type Rating   = "yes" | "maybe" | "no";
type Ratings  = Partial<Record<ItemKey, Rating>>;

function isMatch(myR: Rating | undefined, partR: Rating | undefined): boolean {
  if (!myR || !partR) return false;
  return myR !== "no" && partR !== "no";
}

// ── Glass card style ────────────────────────────────────────────────
const NOIR_GLASS: CSSProperties = {
  background:           "rgba(255,255,255,0.04)",
  backdropFilter:       "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border:               "1px solid rgba(255,255,255,0.08)",
  boxShadow:            "0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
  borderRadius:         "1.1rem",
};

const MATCH_GLASS: CSSProperties = {
  ...NOIR_GLASS,
  border:    "1px solid rgba(255,210,60,0.45)",
  boxShadow: "0 0 24px rgba(255,200,50,0.22), 0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,210,60,0.10)",
};

// ── Rating button config ────────────────────────────────────────────
const RATING_CONFIG = {
  yes:   { label: "Yes",   color: "#00FF7F", bg: "rgba(0,255,127,0.12)",   border: "rgba(0,255,127,0.40)",   glow: "rgba(0,255,127,0.30)"  },
  maybe: { label: "Maybe", color: "#FFB300", bg: "rgba(255,179,0,0.12)",   border: "rgba(255,179,0,0.40)",   glow: "rgba(255,179,0,0.30)"  },
  no:    { label: "No",    color: "#FF3333", bg: "rgba(255,51,51,0.12)",   border: "rgba(255,51,51,0.40)",   glow: "rgba(255,51,51,0.30)"  },
} as const;

function ratingLabel(r: Rating): string {
  return r === "yes" ? "✓ Yes" : r === "maybe" ? "● Maybe" : "✕ No";
}

// ── Single rating button ────────────────────────────────────────────
function RatingBtn({
  rating, selected, onSelect,
}: { rating: Rating; selected: boolean; onSelect: () => void }) {
  const cfg = RATING_CONFIG[rating];
  return (
    <motion.button
      whileTap={{ scale: 0.90 }}
      onClick={onSelect}
      style={{
        flex: 1,
        padding: "10px 4px",
        borderRadius: "0.75rem",
        border: selected ? `1px solid ${cfg.border}` : "1px solid rgba(255,255,255,0.08)",
        background: selected ? cfg.bg : "rgba(0,0,0,0.25)",
        color: selected ? cfg.color : "rgba(255,255,255,0.60)",
        fontWeight: selected ? 700 : 500,
        fontSize: "0.72rem",
        letterSpacing: "0.04em",
        cursor: "pointer",
        transition: "all 0.2s",
        boxShadow: selected ? `0 0 14px ${cfg.glow}` : "none",
        textShadow: selected ? `0 0 8px ${cfg.glow}` : "none",
        ...QS,
      }}
    >
      {rating === "yes" ? "✓" : rating === "maybe" ? "●" : "✕"}{" "}
      {cfg.label}
    </motion.button>
  );
}

// ── Matched item card ───────────────────────────────────────────────
function MatchCard({
  item, myRating, partnerRating, partnerName, isNew,
}: {
  item: typeof MATRIX_ITEMS[number];
  myRating: Rating; partnerRating: Rating;
  partnerName: string; isNew: boolean;
}) {
  const myCfg   = RATING_CONFIG[myRating];
  const partCfg = RATING_CONFIG[partnerRating];

  return (
    <motion.div
      layout
      initial={isNew ? { opacity: 0, scale: 0.92, y: -10 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      style={MATCH_GLASS}
      className="p-4"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{item.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold leading-snug text-sm" style={PF}>{item.label}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: myCfg.bg, color: myCfg.color, border: `1px solid ${myCfg.border}`, ...QS }}>
              You: {ratingLabel(myRating)}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{ background: partCfg.bg, color: partCfg.color, border: `1px solid ${partCfg.border}`, ...QS }}>
              {partnerName}: {ratingLabel(partnerRating)}
            </span>
          </div>
        </div>
        <span className="text-yellow-400 text-base">✦</span>
      </div>
    </motion.div>
  );
}

// ── Main component ──────────────────────────────────────────────────
export default function RedLightMatrixPage() {
  const { profile, partnerProfile, tether } = useAuth();
  const myId        = profile?.id ?? "";
  const partnerId   = partnerProfile?.id ?? null;
  const partnerName = partnerProfile?.full_name ?? "Partner";

  const [myRatings,      setMyRatings]      = useState<Ratings>({});
  const [partnerRatings, setPartnerRatings] = useState<Ratings>({});
  const [flashMatch,     setFlashMatch]     = useState(false);
  const [saving,         setSaving]         = useState<ItemKey | null>(null);
  const [newMatchKeys,   setNewMatchKeys]   = useState<Set<ItemKey>>(new Set());

  const prevMatchKeysRef = useRef<Set<ItemKey>>(new Set());

  // ── Detect new matches and fire effects ──────────────────────────
  const checkNewMatches = useCallback((myR: Ratings, partR: Ratings, isFromRealtime = false) => {
    const currentMatches = new Set<ItemKey>(
      MATRIX_ITEMS
        .filter(it => isMatch(myR[it.key], partR[it.key]))
        .map(it => it.key)
    );
    const prev = prevMatchKeysRef.current;
    const fresh: ItemKey[] = [];
    currentMatches.forEach(k => { if (!prev.has(k)) fresh.push(k); });

    if (fresh.length > 0 && isFromRealtime) {
      // New match detected — celebrate!
      setFlashMatch(true);
      haptic("success");
      setTimeout(() => haptic("success"), 200);
      setTimeout(() => setFlashMatch(false), 1_200);
      setNewMatchKeys(prev => { const s = new Set(prev); fresh.forEach(k => s.add(k)); return s; });
      setTimeout(() => {
        setNewMatchKeys(prev => { const s = new Set(prev); fresh.forEach(k => s.delete(k)); return s; });
      }, 2_000);
    }

    prevMatchKeysRef.current = currentMatches;
  }, []);

  // ── Load initial ratings ─────────────────────────────────────────
  const fetchRatings = useCallback(async () => {
    if (!tether) return;
    const { data } = await supabase
      .from("kink_matrix")
      .select("user_id, item_key, rating")
      .eq("tether_id", tether.id);

    const myR: Ratings   = {};
    const partR: Ratings = {};
    (data ?? []).forEach((row: { user_id: string; item_key: string; rating: string }) => {
      if (row.user_id === myId)     myR[row.item_key   as ItemKey] = row.rating as Rating;
      if (row.user_id === partnerId) partR[row.item_key as ItemKey] = row.rating as Rating;
    });

    setMyRatings(myR);
    setPartnerRatings(partR);
    // Seed prevMatchKeys without firing animations on load
    prevMatchKeysRef.current = new Set(
      MATRIX_ITEMS
        .filter(it => isMatch(myR[it.key], partR[it.key]))
        .map(it => it.key)
    );
  }, [tether, myId, partnerId]);

  useEffect(() => { fetchRatings(); }, [fetchRatings]);

  // ── Realtime: partner updates ────────────────────────────────────
  useEffect(() => {
    if (!tether) return;
    const ch = supabase
      .channel(`kink-matrix-${tether.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "kink_matrix",
        filter: `tether_id=eq.${tether.id}`,
      }, payload => {
        const row = payload.new as { user_id: string; item_key: string; rating: string } | null;
        if (!row || row.user_id === myId) return;
        setPartnerRatings(prev => {
          const next = { ...prev, [row.item_key as ItemKey]: row.rating as Rating };
          // Use latest myRatings from closure — will be stale, so read via functional setState
          checkNewMatches(myRatings, next, true);
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tether, myId]);

  // ── Also re-check matches when myRatings change (I made the match) ──
  useEffect(() => {
    checkNewMatches(myRatings, partnerRatings, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRatings]);

  // ── Save a rating ────────────────────────────────────────────────
  const setRating = useCallback(async (key: ItemKey, rating: Rating) => {
    if (!tether) return;
    setSaving(key);

    const newMyRatings = { ...myRatings, [key]: rating };
    setMyRatings(newMyRatings);
    checkNewMatches(newMyRatings, partnerRatings, true);

    await supabase.from("kink_matrix").upsert({
      tether_id:  tether.id,
      user_id:    myId,
      item_key:   key,
      rating,
      updated_at: new Date().toISOString(),
    }, { onConflict: "tether_id,user_id,item_key" });

    setSaving(null);
    haptic("light");
  }, [tether, myId, myRatings, partnerRatings, checkNewMatches]);

  // ── Compute matches ──────────────────────────────────────────────
  const matches = MATRIX_ITEMS.filter(it => isMatch(myRatings[it.key], partnerRatings[it.key]));
  const unmatched = MATRIX_ITEMS.filter(it => !isMatch(myRatings[it.key], partnerRatings[it.key]));

  return (
    <PullToRefresh onRefresh={fetchRatings} className="relative flex flex-col h-full overscroll-none"
      style={{ background: "linear-gradient(180deg, #0A0000 0%, #050005 50%, #000000 100%)", touchAction: "pan-y" }}>

      {/* Ambient red glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-80 rounded-full blur-3xl opacity-25"
          style={{ background: "radial-gradient(circle, #C53030 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-15"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }} />
      </div>

      {/* Full-screen crimson flash on new match */}
      <AnimatePresence>
        {flashMatch && (
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 pointer-events-none z-50"
            style={{ background: "radial-gradient(ellipse at center, rgba(197,48,48,0.45) 0%, rgba(197,48,48,0.0) 70%)" }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-col gap-5 px-4 pt-4 pb-10">

        {/* Header */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <span className="text-red-500 text-xs">◈</span>
            <p className="text-white/70 text-[10px] uppercase tracking-[0.3em]" style={QS}>Red Light Matrix</p>
            <span className="text-red-500 text-xs">◈</span>
          </div>
          <p className="text-white/55 text-[9px] text-center" style={QS}>
            Choose honestly · Matches reveal automatically
          </p>
        </div>

        {/* ── Mutual Matches Section ── */}
        {matches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-3">

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-yellow-500/20" />
              <div className="flex items-center gap-1.5">
                <span className="text-yellow-400 text-[10px]">✦</span>
                <p className="text-yellow-300/70 text-[10px] uppercase tracking-widest" style={QS}>
                  Mutual Desires · {matches.length}
                </p>
                <span className="text-yellow-400 text-[10px]">✦</span>
              </div>
              <div className="h-px flex-1 bg-yellow-500/20" />
            </div>

            <AnimatePresence mode="popLayout">
              {matches.map(item => (
                <MatchCard
                  key={item.key}
                  item={item}
                  myRating={myRatings[item.key]!}
                  partnerRating={partnerRatings[item.key]!}
                  partnerName={partnerName}
                  isNew={newMatchKeys.has(item.key)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Divider between matches and items */}
        {matches.length > 0 && unmatched.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-white/6" />
            <p className="text-white/55 text-[9px] uppercase tracking-widest" style={QS}>Your Choices</p>
            <div className="h-px flex-1 bg-white/6" />
          </div>
        )}

        {/* Empty state */}
        {matches.length === 0 && Object.keys(myRatings).length === 0 && (
          <div style={NOIR_GLASS} className="p-6 flex flex-col items-center gap-3 text-center">
            <p className="text-3xl">🔴</p>
            <p className="text-white/60 text-sm font-semibold" style={PF}>Rate your interests below</p>
            <p className="text-white/65 text-xs leading-relaxed" style={QS}>
              Your choices stay private until a mutual match is found.{"\n"}Neither of you can see the other's selections.
            </p>
          </div>
        )}

        {/* ── Matrix items (unmatched only) ── */}
        <div className="flex flex-col gap-3">
          {unmatched.map(item => {
            const myR = myRatings[item.key];
            const isSaving = saving === item.key;

            return (
              <motion.div
                key={item.key}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={NOIR_GLASS}
                className="p-3.5"
              >
                {/* Item header */}
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="text-xl">{item.emoji}</span>
                  <p className="flex-1 text-white/85 text-sm font-medium leading-snug" style={PF}>
                    {item.label}
                  </p>
                  {isSaving && (
                    <div className="w-3 h-3 rounded-full border border-white/20 border-t-white/60 animate-spin" />
                  )}
                  {myR && !isSaving && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                      style={{
                        background: RATING_CONFIG[myR].bg,
                        color: RATING_CONFIG[myR].color,
                        border: `1px solid ${RATING_CONFIG[myR].border}`,
                        ...QS,
                      }}>
                      {ratingLabel(myR)}
                    </span>
                  )}
                </div>

                {/* Rating buttons */}
                <div className="flex gap-2">
                  {(["yes", "maybe", "no"] as Rating[]).map(r => (
                    <RatingBtn
                      key={r}
                      rating={r}
                      selected={myR === r}
                      onSelect={() => setRating(item.key, r)}
                    />
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Blind notice */}
        <div className="flex items-center gap-2 justify-center mt-1">
          <span className="text-white/50 text-[10px]">🔒</span>
          <p className="text-white/60 text-[9px]" style={QS}>
            Partner's choices are hidden until you both match
          </p>
          <span className="text-white/50 text-[10px]">🔒</span>
        </div>
      </div>
    </PullToRefresh>
  );
}
