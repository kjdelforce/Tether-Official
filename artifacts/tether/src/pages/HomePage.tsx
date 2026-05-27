import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useIdle } from "@/hooks/useIdle";
import { haptic } from "@/lib/haptics";
import { sendLoveYouNotification } from "@/lib/notifications";
import { LoveYouSender } from "@/components/LoveYouSender";
import { LoveYouOverlay } from "@/components/LoveYouOverlay";
import { useUnreadLoveYou } from "@/hooks/useUnreadLoveYou";
import { DailyConnectionCard } from "@/components/DailyConnectionCard";
import { VibeCheckSection } from "@/components/VibeCheckSection";
import { usePartnerPresence } from "@/lib/usePartnerPresence";
import { PullToRefresh } from "@/components/PullToRefresh";
import { LivingSkyHeader } from "@/components/LivingSkyHeader";
import {
  GhostCloudButton,
  GhostWhisperCompose,
  GhostWhisperReceive,
  type IncomingWhisper,
} from "@/components/GhostWhisper";
import { CapsuleWidget } from "@/components/CapsuleWidget";
import {
  isKyle,
  postNaughtyQuestion,
  getActiveNaughtyQuestion,
  getNaughtyAnswers,
  submitNaughtyAnswer,
  timeRemaining,
  type NaughtyQuestion,
  type NaughtyAnswer,
} from "@/lib/naughtyBox";
import { EditableText } from "@/components/EditableText";
import { SpatialCard } from "@/components/SpatialCard";
import { SensorSyncIcon } from "@/components/SensorSyncIcon";

// ── Dates ─────────────────────────────────────────────────────────
const ANNIVERSARY     = new Date("2025-04-07");
const NATHAN_BIRTHDAY = new Date("1985-03-16");
const KYLE_BIRTHDAY   = new Date("1995-01-07");

// ── Daily quotes (rotate by day-of-month) ─────────────────────────
const QUOTES = [
  "You are my favorite person.",
  "Every day with you is my best day.",
  "Home is wherever you are.",
  "You make ordinary moments extraordinary.",
  "I love you more than yesterday, less than tomorrow.",
  "You are my greatest adventure.",
  "With you, everything feels right.",
  "You are my calm in every storm.",
  "Choosing you — every single day.",
  "You had me from the very beginning.",
  "My heart found its home in you.",
  "You are enough. You are everything.",
  "I fall for you, again and again.",
  "You are the best thing that's ever happened to me.",
  "Forever isn't long enough with you.",
  "You are my reason to smile today.",
  "Being with you is my favorite feeling.",
  "You are the love I didn't know I needed.",
  "I am so lucky to be yours.",
  "Every moment with you is a gift.",
  "You are my sunshine on cloudy days.",
  "My love for you grows every single day.",
  "You are the person I want beside me always.",
  "Thank you for being exactly who you are.",
  "You are irreplaceable — wholly, completely.",
  "My favorite sound is your laugh.",
  "You make this life so much sweeter.",
  "With you, I am home.",
  "You are so deeply loved.",
  "I'd choose you in every lifetime.",
  "You are my person. Always.",
];

// ── Helpers ────────────────────────────────────────────────────────
function getNextOccurrence(date: Date): Date {
  const now = new Date();
  const next = new Date(date);
  next.setFullYear(now.getFullYear());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return next;
}

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function daysTogether(since: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const s = new Date(since);
  s.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function isBirthdayMonth(month: number): boolean {
  return new Date().getMonth() + 1 === month;
}

function todayQuote(): string {
  const day = new Date().getDate();
  return QUOTES[day % QUOTES.length];
}

// ── Avatar Totem — single 3D glass sphere with idle physics ───────
// Always-on: subtle breathe (scale) + periodic blink (Y squash).
// Idle Engine: after 10 s of no input, the totem shifts toward a
// fresh random {x, y, yaw} target every ~3 s — a believable "looking
// around the card" idle, replacing the previous always-on yaw loop
// that read as a metronome.  Glass-sphere "Lens" overlay sits on
// top; environmental aura colour-bleeds onto neighbours.
function AvatarTotem({
  initial, grad, rim, vibeGlow, delay = 0,
}: {
  initial: string;
  grad:    string;
  rim:     string;
  vibeGlow:string;
  delay?:  number;
}) {
  const isIdle = useIdle(10_000);
  const [look, setLook] = useState({ x: 0, y: 0, ry: 0, rx: 0 });

  // While idle, pick a fresh random "look-at" target every ~3 s.
  // Coordinates stay within ±5px / ±10° so the head/torso shift is
  // subtle, never theatrical.  When the user wakes the page we
  // immediately recentre.
  useEffect(() => {
    if (!isIdle) {
      setLook({ x: 0, y: 0, ry: 0, rx: 0 });
      return;
    }
    const pick = () => setLook({
      x:  (Math.random() - 0.5) * 10,
      y:  (Math.random() - 0.5) * 8,
      ry: (Math.random() - 0.5) * 18,
      rx: (Math.random() - 0.5) * 10,
    });
    pick();
    const id = setInterval(pick, 3000 + Math.random() * 1200);
    return () => clearInterval(id);
  }, [isIdle]);

  return (
    <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
      {/* Environmental glow — the totem casts coloured light onto neighbouring surfaces */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.55, 0.95, 0.55], scale: [1, 1.18, 1] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut", delay }}
        style={{
          position: "absolute",
          inset:    -22,
          borderRadius: "50%",
          background:   `radial-gradient(circle at 50% 50%, ${vibeGlow} 0%, transparent 70%)`,
          filter:       "blur(14px)",
          pointerEvents:"none",
          zIndex:       0,
        }}
      />

      {/* Always-on breathe + blink wrapper */}
      <motion.div
        animate={{ scale: [1, 1.03, 1] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut", delay }}
        style={{
          width: 44, height: 44, position: "relative",
          transformStyle: "preserve-3d",
          transformPerspective: 600,
        }}
      >
       {/* Idle "look-around" layer — random shift + yaw, only when idle */}
       <motion.div
        animate={{ x: look.x, y: look.y, rotateY: look.ry, rotateX: look.rx }}
        transition={{ type: "spring", stiffness: 40, damping: 14, mass: 0.9 }}
        style={{
          width: "100%", height: "100%", position: "relative",
          transformStyle: "preserve-3d",
        }}
       >
        {/* Sphere body */}
        <div
          style={{
            width: "100%", height: "100%", borderRadius: "50%",
            background: grad,
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
            userSelect: "none",
            border: `1.5px solid ${rim}`,
            boxShadow: [
              `inset 1px 1px 0 rgba(255,255,255,0.55)`,
              `inset -1px -1px 0 rgba(0,0,0,0.55)`,
              `0 6px 20px rgba(0,0,0,0.55)`,
              `0 0 18px 4px ${vibeGlow}`,
            ].join(", "),
          } as React.CSSProperties}
        >
          {/* Initial */}
          <span style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700, fontSize: "1.15rem",
            color: "white", position: "relative", zIndex: 1,
            textShadow: "0 1px 4px rgba(0,0,0,0.55)",
          }}>
            {initial}
          </span>

          {/* Blink — eyelid sweep across the sphere face every ~5s */}
          <motion.div
            aria-hidden
            animate={{ scaleY: [0, 0, 1, 0], opacity: [0, 0, 0.55, 0] }}
            transition={{
              duration: 0.55, repeat: Infinity, repeatDelay: 4.5 + delay,
              times: [0, 0.45, 0.55, 1], ease: "easeInOut",
            }}
            style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.0) 60%)",
              transformOrigin: "top",
              pointerEvents: "none", zIndex: 2,
            }}
          />

          {/* Glass lens overlay — characteristic specular arc + bottom sheen
           * making it read as if encased in a clear glass sphere. */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: [
              "radial-gradient(ellipse 70% 35% at 38% 22%, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0) 65%),",
              "radial-gradient(ellipse 50% 22% at 60% 88%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%)",
            ].join(" "),
            pointerEvents: "none", zIndex: 3,
          }} />
        </div>
       </motion.div>
      </motion.div>
    </div>
  );
}

function ProfileSpheres() {
  const spheres = [
    {
      initial: "K",
      grad: "radial-gradient(circle at 32% 28%, rgba(229,62,62,0.65) 0%, rgba(123,19,19,0.85) 55%, rgba(80,10,10,1) 100%)",
      rim:  "rgba(229,62,62,0.80)",
      glow: "rgba(229,62,62,0.55)",
    },
    {
      initial: "N",
      grad: "radial-gradient(circle at 32% 28%, rgba(59,130,246,0.65) 0%, rgba(30,58,138,0.85) 55%, rgba(15,30,80,1) 100%)",
      rim:  "rgba(59,130,246,0.75)",
      glow: "rgba(59,130,246,0.50)",
    },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 10 }}>
      {spheres.map(({ initial, grad, rim, glow }, i) => (
        <AvatarTotem
          key={initial}
          initial={initial}
          grad={grad}
          rim={rim}
          vibeGlow={glow}
          delay={i * 0.7}
        />
      ))}
    </div>
  );
}

// ── Countdown Card ─────────────────────────────────────────────────
function CountdownCard({
  label, date, emoji, birthdayMonth,
}: {
  label: string; date: Date; emoji: string;
  birthdayMonth?: number;
}) {
  const next = getNextOccurrence(date);
  const days = daysUntil(next);
  const showSparkle = birthdayMonth !== undefined && isBirthdayMonth(birthdayMonth);

  return (
    <div
      className="glass-countdown rounded-2xl p-4 text-center relative overflow-hidden w-full"
      style={showSparkle ? {
        border: "1px solid rgba(255, 180, 0, 0.4)",
        boxShadow: "0 0 18px rgba(255,180,0,0.18), 0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
      } : undefined}
    >
      {showSparkle && (
        <>
          <span className="absolute top-1.5 right-2 text-xs animate-sparkle-float" style={{ animationDelay: "0s" }}>✨</span>
          <span className="absolute top-3 left-2 text-[10px] animate-sparkle-float" style={{ animationDelay: "0.7s" }}>⭐</span>
          <span className="absolute bottom-2 right-3 text-[10px] animate-sparkle-float" style={{ animationDelay: "1.2s" }}>✨</span>
        </>
      )}

      <div className="text-2xl mb-1">{emoji}</div>
      <div className="text-3xl font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
        {days === 0 ? "Today!" : days}
      </div>
      <div style={{ letterSpacing: "1px", textTransform: "uppercase" }} className="text-blue-200 text-[10px] mt-0.5">
        {days === 0 ? "🎉" : "days away"}
      </div>
      <div className="text-blue-100 text-sm font-medium mt-2 tracking-wide">{label}</div>
      <div style={{ letterSpacing: "1px", textTransform: "uppercase" }} className="text-blue-300 text-[10px] mt-0.5">
        {next.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </div>

      {showSparkle && (
        <div className="text-[10px] text-yellow-300/80 mt-1.5 font-medium tracking-wide uppercase" style={{ letterSpacing: "1px" }}>
          🎂 Birthday Month!
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function HomePage({ together: togetherProp, onNavigateToCapsules }: { together?: number; onNavigateToCapsules?: () => void }) {
  const { profile, partnerProfile, tether, reload } = useAuth();
  const { toast } = useToast();

  // ── Ghost Whisper state
  const [composeOpen,     setComposeOpen]     = useState(false);
  const [incomingWhisper, setIncomingWhisper] = useState<IncomingWhisper | null>(null);

  // Check for a pending whisper from partner on mount
  useEffect(() => {
    if (!tether || !profile) return;
    supabase
      .from("temporary_whispers")
      .select("id, message")
      .eq("tether_id", tether.id)
      .neq("sender_id", profile.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setIncomingWhisper(data[0] as IncomingWhisper);
      });
  }, [tether, profile]);

  // Realtime: listen for new whispers from partner
  useEffect(() => {
    if (!tether || !profile) return;
    const channel = supabase
      .channel("ghost-whispers-" + tether.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "temporary_whispers",
          filter: `tether_id=eq.${tether.id}` },
        (payload) => {
          const row = payload.new as { id: string; message: string; sender_id: string };
          if (row.sender_id !== profile.id) {
            setIncomingWhisper({ id: row.id, message: row.message });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tether, profile]);

  // Unread love message from partner → triggers cinematic overlay.
  // The hook owns the Supabase polling + realtime subscription and
  // the read-mark mutation, so this page stays declarative.
  const { unreadId: pendingLoveId, dismiss: dismissReceiver } = useUnreadLoveYou({
    tetherId:  tether?.id,
    partnerId: partnerProfile?.id,
  });

  // Send a Love You
  const sendLoveYou = useCallback(async () => {
    if (!profile || !tether) return;

    const { error } = await supabase.from("love_messages").insert({
      tether_id: tether.id,
      sender_id: profile.id,
    });

    if (error) {
      toast({ title: "Oops!", description: error.message, variant: "destructive" });
      return;
    }

    sendLoveYouNotification(tether.id, profile.id, profile.full_name).catch(() => {});
  }, [profile, tether, toast]);

  const partnerName = partnerProfile?.full_name ?? (profile?.full_name === "Kyle" ? "Nathan" : "Kyle");
  const together    = togetherProp ?? daysTogether(ANNIVERSARY);
  const quote       = todayQuote();

  return (
    <>
      {/* ── Ghost Whisper overlays ───────────────────────────────── */}
      <AnimatePresence>
        {composeOpen && tether && profile && (
          <GhostWhisperCompose
            key="ghost-compose"
            tetherId={tether.id}
            senderId={profile.id}
            onClose={() => setComposeOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {incomingWhisper && (
          <GhostWhisperReceive
            key={incomingWhisper.id}
            whisper={incomingWhisper}
            onDone={() => setIncomingWhisper(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Cinematic Love-You arrival overlay ──────────────────── */}
      <AnimatePresence>
        {pendingLoveId && partnerProfile && (
          <LoveYouOverlay
            key={pendingLoveId}
            senderName={partnerProfile.full_name}
            onDismiss={dismissReceiver}
          />
        )}
      </AnimatePresence>

      <PullToRefresh onRefresh={reload} className="h-full">

        {/* ── "Us" Hero — Living Sky (full-bleed, no side padding) ─── */}
        <LivingSkyHeader>
          {/* Ghost Whisper button — top-right of hero */}
          <div style={{
            position: "absolute",
            top: 14,
            right: 16,
            zIndex: 20,
          }}>
            <GhostCloudButton onPress={() => setComposeOpen(true)} />
          </div>

          <motion.h1
            layoutId="couple-name"
            layout="position"
            className="text-4xl font-bold text-white leading-tight text-center"
            style={{
              fontFamily: "'Playfair Display', serif",
              textShadow: "0 0 48px rgba(197,48,48,0.35), 0 2px 24px rgba(0,0,0,0.90), 0 1px 6px rgba(0,0,0,0.70)",
            }}
          >
            Kyle &amp; Nathan<SensorSyncIcon size={16} />
          </motion.h1>

          <motion.p
            layoutId="couple-days"
            layout="position"
            className="text-blue-100/90 mt-2 text-center"
            style={{
              fontFamily: "'Caveat', cursive",
              fontSize: "1.15rem",
              textShadow: "0 1px 10px rgba(0,0,0,0.6)",
            }}
          >
            Building our life together for{" "}
            <span className="text-white font-semibold">{together.toLocaleString()}</span> days
          </motion.p>

          {/* ── Live Presence Indicator ────────────────────────────── */}
          {tether && profile && partnerProfile && (
            <PresenceGlow
              tetherId={tether.id}
              profileId={profile.id}
              partnerId={partnerProfile.id}
              partnerName={partnerProfile.full_name}
            />
          )}

          {!partnerProfile && (
            <p className="text-blue-200/80 text-xs mt-2 text-center">
              Share code{" "}
              <span className="font-mono font-bold text-white tracking-widest">{tether?.invite_code}</span>{" "}
              with {partnerName} to link profiles
            </p>
          )}
        </LivingSkyHeader>

        {/* Content cards sit seamlessly below the dissolved sky horizon */}
        <div className="px-5 pb-16 space-y-5 pt-4">

          {/* ── Vibe Check ─────────────────────────────────────────── */}
          {tether && profile && partnerProfile && (
            <VibeCheckSection
              tetherId={tether.id}
              myId={profile.id}
              myName={profile.full_name}
              partnerId={partnerProfile.id}
              partnerName={partnerProfile.full_name}
              initialMyVibe={profile.current_vibe ?? null}
              initialPartnerVibe={partnerProfile.current_vibe ?? null}
            />
          )}

          {/* ── Countdowns carousel ─────────────────────────────────── */}
          <div className="space-y-3">
            {/* Section header rendered as a floating Liquid-Glass
             * secondary surface — small inline pill that matches the
             * dock's top-edge highlight and the rest of the design
             * language.  Padding kept minimal so the label still
             * reads as a section title, not a button. */}
            <p
              className="lg-surface-secondary inline-block text-blue-300/80 text-[10px] uppercase tracking-widest font-semibold"
              style={{ padding: "4px 10px", borderRadius: "var(--lg-radius-sm)" }}
            >
              Countdowns
            </p>
            <div
              className="no-scrollbar"
              style={{
                display: "flex",
                gap: 12,
                overflowX: "auto",
                scrollSnapType: "x mandatory",
                WebkitOverflowScrolling: "touch",
                marginLeft: -20,
                marginRight: -20,
                paddingLeft: 20,
                paddingRight: 20,
                paddingBottom: 4,
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              } as React.CSSProperties}
            >
              <SpatialCard intensity={0.6} radius={18} style={{ flexShrink: 0, width: "76vw", scrollSnapAlign: "start" }}>
                <CountdownCard label="Our Anniversary" date={ANNIVERSARY} emoji="🥂" />
              </SpatialCard>
              <SpatialCard intensity={0.6} radius={18} style={{ flexShrink: 0, width: "58vw", scrollSnapAlign: "start" }}>
                <CountdownCard label="Kyle's Birthday" date={KYLE_BIRTHDAY} emoji="🎂" birthdayMonth={1} />
              </SpatialCard>
              <SpatialCard intensity={0.6} radius={18} style={{ flexShrink: 0, width: "58vw", scrollSnapAlign: "start" }}>
                <CountdownCard label="Nathan's Birthday" date={NATHAN_BIRTHDAY} emoji="🎂" birthdayMonth={3} />
              </SpatialCard>
            </div>
          </div>

          {/* ── Memory Capsule Teaser ──────────────────────────────── */}
          {onNavigateToCapsules && (
            <CapsuleWidget onNavigate={onNavigateToCapsules} />
          )}

          {/* ── Daily Connection ───────────────────────────────────── */}
          {/* Gold border + 3D parallax via SpatialCard */}
          {tether && profile && (
            <SpatialCard
              intensity={0.7}
              radius={22}
              ambientGlow="rgba(212,160,23,0.18)"
              style={{
                marginTop: 28,
                padding: 3,
                background: "linear-gradient(135deg, rgba(212,160,23,0.55) 0%, rgba(212,160,23,0.20) 50%, rgba(212,160,23,0.40) 100%)",
              }}
            >
              <div style={{
                borderRadius: 19,
                overflow: "hidden",
                backdropFilter: "blur(32px) saturate(180%)",
                WebkitBackdropFilter: "blur(32px) saturate(180%)",
                background: "rgba(15,15,20,0.70)",
              }}>
                <DailyConnectionCard
                  tetherId={tether.id}
                  myId={profile.id}
                  myName={profile.full_name}
                  partnerId={partnerProfile?.id ?? null}
                  partnerName={partnerName}
                />
              </div>
            </SpatialCard>
          )}

          {/* ── Love You button ─────────────────────────────────────── */}
          <LoveYouSender
            partnerName={partnerName}
            onSend={sendLoveYou}
          />

          {/* ── Daily Reminder ─────────────────────────────────────── */}
          {/* Promoted to `.lg-surface-primary` so the card's blur,
           * tint, radius, and shadow are sourced from the global
           * design tokens.  No padding/layout change. */}
          <div className="lg-surface-primary px-6 py-5 text-center">
            <EditableText
              id="home.daily_reminder_label"
              fallback="A Daily Reminder"
              tag="p"
              className="text-blue-300/70 text-[10px] uppercase tracking-widest font-semibold mb-2"
            />
            <EditableText
              id="home.daily_quote"
              fallback={`"${quote}"`}
              tag="p"
              className="text-white leading-snug"
              style={{ fontFamily: "'Caveat', cursive", fontSize: "1.35rem" }}
            />
          </div>

          {/* ── Naughty Question ────────────────────────────────────── */}
          {tether && profile && (
            <NaughtyQuestionSection
              tetherId={tether.id}
              myId={profile.id}
              myName={profile.full_name}
              partnerId={partnerProfile?.id ?? null}
              partnerName={partnerName}
            />
          )}

        </div>
      </PullToRefresh>
    </>
  );
}

// ── Naughty Question Section ───────────────────────────────────────
function NaughtyQuestionSection({
  tetherId, myId, myName, partnerId, partnerName,
}: {
  tetherId: string; myId: string; myName: string;
  partnerId: string | null; partnerName: string;
}) {
  const { toast } = useToast();
  const amKyle = isKyle(myName);

  const [question,   setQuestion]   = useState<NaughtyQuestion | null | undefined>(undefined);
  const [answers,    setAnswers]    = useState<NaughtyAnswer[]>([]);
  const [myAnswer,   setMyAnswer]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [composing,  setComposing]  = useState(false);
  const [newQ,       setNewQ]       = useState("");
  const [posting,    setPosting]    = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timeLeft,   setTimeLeft]   = useState("");
  const [revealed,   setRevealed]   = useState(false);

  const reload = useCallback(async () => {
    const q = await getActiveNaughtyQuestion(tetherId);
    setQuestion(q ?? null);
    if (q) {
      const ans = await getNaughtyAnswers(q.id);
      setAnswers(ans);
    } else {
      setAnswers([]);
    }
  }, [tetherId]);

  useEffect(() => { reload(); }, [reload]);

  // Live countdown timer
  useEffect(() => {
    if (!question) { setTimeLeft(""); return; }
    const tick = () => setTimeLeft(timeRemaining(question.expires_at));
    tick();
    timerRef.current = setInterval(tick, 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [question]);

  // Realtime: new answers from partner
  useEffect(() => {
    if (!question) return;
    const ch = supabase
      .channel("naughty-answers-" + question.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "naughty_answers",
          filter: `question_id=eq.${question.id}` },
        () => { reload(); },
      ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [question?.id, reload]);

  async function handlePost() {
    if (!newQ.trim()) return;
    setPosting(true);
    const { data: q, error } = await postNaughtyQuestion(tetherId, myId, newQ.trim());
    setPosting(false);
    if (q) { setQuestion(q); setAnswers([]); setComposing(false); setNewQ(""); haptic("success"); }
    else toast({ title: "Failed to post question", description: error ?? "Unknown error. Run the Naughty Questions migration in Supabase.", variant: "destructive" });
  }

  async function handleSubmitAnswer() {
    if (!question || !myAnswer.trim()) return;
    setSubmitting(true);
    const { error } = await submitNaughtyAnswer(question.id, tetherId, myId, myAnswer.trim());
    setSubmitting(false);
    if (error) { toast({ title: "Error", description: error, variant: "destructive" }); return; }
    haptic("success");
    setMyAnswer("");
    reload();
  }

  const myAnswerRow    = answers.find(a => a.user_id === myId);
  const partnerAnswerRow = partnerId ? answers.find(a => a.user_id === partnerId) : null;
  const bothAnswered   = !!myAnswerRow && !!partnerAnswerRow;

  const SPICY_CARD: React.CSSProperties = {
    background: "linear-gradient(135deg, rgba(197,48,48,0.12) 0%, rgba(10,10,20,0.82) 100%)",
    backdropFilter: "blur(28px) saturate(165%)",
    WebkitBackdropFilter: "blur(28px) saturate(165%)",
    /* 1px semi-transparent white border + crimson thematic edge */
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 20,
    /* White specular top + stronger crimson aura */
    boxShadow: [
      "0 8px 32px rgba(0,0,0,0.50)",
      "0 0 30px 6px rgba(197,48,48,0.28)",
      "inset 0 1.5px 0 rgba(255,200,200,0.40)",
      "inset 0 -1px 0 rgba(0,0,0,0.25)",
      "inset 1px 0 0 rgba(197,48,48,0.20)",
      "inset -1px 0 0 rgba(197,48,48,0.20)",
    ].join(", "),
    padding: "22px 24px",
    position: "relative",
    overflow: "hidden",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(197,48,48,0.35)",
    borderRadius: 12,
    color: "white",
    fontSize: "0.88rem",
    padding: "10px 12px",
    fontFamily: "'Quicksand', sans-serif",
    outline: "none",
    boxSizing: "border-box",
  };

  // Still loading
  if (question === undefined) return null;

  return (
    <div style={SPICY_CARD}>

      {/* ── FaceID-style privacy overlay — tap to reveal ── */}
      <AnimatePresence>
        {!revealed && (
          <motion.div
            key="naughty-privacy-veil"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            onClick={() => { haptic("light"); setRevealed(true); }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 10,
              borderRadius: 20,
              backdropFilter: "blur(20px) saturate(120%)",
              WebkitBackdropFilter: "blur(20px) saturate(120%)",
              background: "rgba(8,4,4,0.45)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: "1.8rem" }}>🔒</span>
            <p style={{
              fontFamily: "'Quicksand', sans-serif",
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "rgba(255,200,200,0.80)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              margin: 0,
            }}>
              Tap to Reveal
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: "1.1rem" }}>🔥</span>
          <span style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "0.82rem",
            fontWeight: 700,
            color: "rgba(255,120,120,0.95)",
            letterSpacing: "0.07em",
            textTransform: "uppercase",
          }}>
            Naughty Question
          </span>
        </div>
        {/* Kyle's + button */}
        {amKyle && !composing && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => { haptic("light"); setComposing(true); }}
            style={{
              background: "rgba(197,48,48,0.28)",
              border: "1px solid rgba(197,48,48,0.55)",
              borderRadius: 10,
              color: "rgba(255,150,150,0.95)",
              fontWeight: 700,
              fontSize: "1.1rem",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            +
          </motion.button>
        )}
      </div>

      {/* Compose new question (Kyle only) */}
      <AnimatePresence>
        {composing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden", marginBottom: 12 }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={newQ}
                onChange={e => setNewQ(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Ask anything… 😈"
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") handlePost(); }}
              />
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={handlePost}
                disabled={posting || !newQ.trim()}
                style={{
                  background: "linear-gradient(135deg, #C53030, #7B1313)",
                  border: "none", borderRadius: 10, color: "white",
                  fontSize: "0.8rem", fontWeight: 700, padding: "0 14px",
                  cursor: "pointer", flexShrink: 0,
                  opacity: (!newQ.trim() || posting) ? 0.5 : 1,
                }}
              >
                {posting ? "…" : "Post"}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => { setComposing(false); setNewQ(""); }}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.40)", fontSize: "1.2rem", cursor: "pointer" }}
              >
                ×
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No active question */}
      {!question && !composing && (
        <p style={{ color: "rgba(255,255,255,0.30)", fontStyle: "italic", fontSize: "0.85rem", textAlign: "center", paddingTop: 4 }}>
          {amKyle ? "Tap + to post a naughty question for you both…" : "No naughty question right now — check back soon 😈"}
        </p>
      )}

      {/* Active question */}
      {question && (
        <div>
          {/* Question text */}
          <div style={{
            background: "rgba(197,48,48,0.12)",
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 12,
          }}>
            <p style={{
              fontFamily: "'Caveat', cursive",
              fontSize: "1.20rem",
              color: "white",
              margin: 0,
              lineHeight: 1.4,
            }}>
              "{question.question_text}"
            </p>
            <p style={{ fontSize: "0.68rem", color: "rgba(255,140,140,0.55)", marginTop: 6, letterSpacing: "0.05em" }}>
              ⏳ {timeLeft}
            </p>
          </div>

          {/* Both answered — reveal */}
          {bothAnswered ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {[myAnswerRow, partnerAnswerRow].filter(Boolean).map(a => {
                const isMe = a!.user_id === myId;
                const name = isMe ? myName : partnerName;
                return (
                  <div key={a!.id} style={{
                    background: isMe ? "rgba(197,48,48,0.14)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${isMe ? "rgba(197,48,48,0.35)" : "rgba(255,255,255,0.10)"}`,
                    borderRadius: 12,
                    padding: "10px 13px",
                  }}>
                    <p style={{ fontSize: "0.68rem", color: "rgba(255,200,200,0.55)", marginBottom: 3, fontWeight: 600 }}>
                      {name}
                    </p>
                    <p style={{ color: "rgba(255,255,255,0.88)", fontSize: "0.88rem", fontFamily: "'Quicksand', sans-serif", margin: 0 }}>
                      {a!.answer_text}
                    </p>
                  </div>
                );
              })}
            </motion.div>
          ) : (
            <div>
              {/* My answer input */}
              {!myAnswerRow ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={myAnswer}
                    onChange={e => setMyAnswer(e.target.value)}
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="Your answer…"
                    onKeyDown={e => { if (e.key === "Enter") handleSubmitAnswer(); }}
                  />
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={handleSubmitAnswer}
                    disabled={submitting || !myAnswer.trim()}
                    style={{
                      background: "linear-gradient(135deg, #C53030, #7B1313)",
                      border: "none", borderRadius: 10, color: "white",
                      fontSize: "0.8rem", fontWeight: 700, padding: "0 14px",
                      cursor: "pointer", flexShrink: 0,
                      opacity: (!myAnswer.trim() || submitting) ? 0.5 : 1,
                    }}
                  >
                    {submitting ? "…" : "Send"}
                  </motion.button>
                </div>
              ) : (
                <div style={{
                  background: "rgba(197,48,48,0.12)",
                  borderRadius: 12,
                  padding: "10px 13px",
                }}>
                  <p style={{ fontSize: "0.70rem", color: "rgba(255,200,200,0.55)", marginBottom: 3 }}>Your answer ✓</p>
                  <p style={{ color: "rgba(255,255,255,0.80)", fontSize: "0.88rem", margin: 0, fontFamily: "'Quicksand', sans-serif" }}>
                    {myAnswerRow.answer_text}
                  </p>
                </div>
              )}
              {/* Waiting hint */}
              {myAnswerRow && !partnerAnswerRow && (
                <p style={{ fontSize: "0.72rem", color: "rgba(255,200,200,0.45)", marginTop: 8, textAlign: "center", fontStyle: "italic" }}>
                  Waiting for {partnerName} to answer…
                </p>
              )}
              {!myAnswerRow && partnerAnswerRow && (
                <p style={{ fontSize: "0.72rem", color: "rgba(255,200,200,0.45)", marginTop: 8, textAlign: "center", fontStyle: "italic" }}>
                  {partnerName} answered — reply to see theirs 🔒
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Live Presence Glow ─────────────────────────────────────────────
function PresenceGlow({
  tetherId, profileId, partnerId, partnerName,
}: {
  tetherId: string; profileId: string; partnerId: string; partnerName: string;
}) {
  const { isOnline, minutesAgo } = usePartnerPresence(tetherId, profileId, partnerId);

  // Three states
  const isActive = isOnline || (minutesAgo !== null && minutesAgo < 5);
  const isRecent = !isActive && minutesAgo !== null && minutesAgo < 30;

  function label(): string {
    if (isOnline)              return `${partnerName} is here with you`;
    if (minutesAgo === null)   return `tethered to ${partnerName}`;
    if (minutesAgo < 1)        return `${partnerName} was just here`;
    if (minutesAgo < 60)       return `${partnerName} was here ${minutesAgo}m ago`;
    const h = Math.floor(minutesAgo / 60);
    return `${partnerName} was here ${h}h ago`;
  }

  // Per-state design tokens
  const cfg = isActive
    ? {
        pill:   "rgba(197,48,48,0.28)",
        border: "rgba(255,100,130,0.55)",
        text:   "#FFD6DE",
        shadow: "0 0 28px rgba(220,50,80,0.55), 0 0 60px rgba(220,50,80,0.25)",
        heart:  "💗",
        dot:    "#FF6080",
      }
    : isRecent
    ? {
        pill:   "rgba(59,90,160,0.28)",
        border: "rgba(147,197,253,0.35)",
        text:   "rgba(190,220,255,0.90)",
        shadow: "0 0 14px rgba(100,150,255,0.20)",
        heart:  "🩷",
        dot:    "#93C5FD",
      }
    : {
        pill:   "rgba(255,255,255,0.05)",
        border: "rgba(255,255,255,0.10)",
        text:   "rgba(147,197,253,0.45)",
        shadow: "none",
        heart:  "🤍",
        dot:    "rgba(147,197,253,0.30)",
      };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={isActive ? "active" : isRecent ? "recent" : "dim"}
        initial={{ opacity: 0, scale: 0.92, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -6 }}
        transition={{ duration: 0.55, ease: [0.34, 1.26, 0.64, 1] }}
        style={{ display: "flex", justifyContent: "center", marginTop: 10 }}
      >
        {/* Outer halo — only in active state */}
        <div style={{ position: "relative", display: "inline-flex" }}>
          {isActive && (
            <motion.div
              aria-hidden
              style={{
                position: "absolute", inset: -6,
                borderRadius: 999,
                background: "radial-gradient(ellipse, rgba(220,50,80,0.22) 0%, transparent 72%)",
                pointerEvents: "none",
              }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}

          {/* Pill */}
          <motion.div
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 16px 6px 12px",
              borderRadius: 999,
              background: cfg.pill,
              border: `1px solid ${cfg.border}`,
              boxShadow: cfg.shadow,
              backdropFilter: "blur(12px)",
            }}
            animate={isActive ? { boxShadow: [
              "0 0 18px rgba(220,50,80,0.40), 0 0 50px rgba(220,50,80,0.15)",
              "0 0 32px rgba(220,50,80,0.70), 0 0 80px rgba(220,50,80,0.30)",
              "0 0 18px rgba(220,50,80,0.40), 0 0 50px rgba(220,50,80,0.15)",
            ]} : {}}
            transition={isActive ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" } : {}}
          >
            {/* Live dot */}
            <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
              {isActive && (
                <motion.div
                  style={{
                    position: "absolute", inset: -3,
                    borderRadius: "50%",
                    background: cfg.dot,
                    opacity: 0.4,
                  }}
                  animate={{ scale: [1, 2.2, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: cfg.dot,
                boxShadow: isActive ? `0 0 6px ${cfg.dot}` : "none",
              }} />
            </div>

            {/* Heart */}
            <motion.span
              style={{ fontSize: "1.15rem", lineHeight: 1, display: "inline-block" }}
              animate={isActive ? { scale: [1, 1.18, 1] } : {}}
              transition={isActive ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" } : {}}
            >
              {cfg.heart}
            </motion.span>

            {/* Text */}
            <p style={{
              fontFamily: "'Caveat', cursive",
              fontSize: "1.15rem",
              fontWeight: 600,
              margin: 0,
              color: cfg.text,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}>
              {label()}
            </p>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
