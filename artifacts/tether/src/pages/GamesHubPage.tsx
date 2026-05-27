import { useState } from "react";
import {
  motion, AnimatePresence, PanInfo,
  useMotionValue, useTransform,
  animate as fmAnimate,
} from "framer-motion";
import { haptic } from "@/lib/haptics";
import CouplesCornerPage from "./CouplesCornerPage";
import TriviaPage from "./TriviaPage";

// ── Game definitions ───────────────────────────────────────────────
const GAMES = [
  {
    id: "corner"  as const,
    name: "Couples Corner",
    tagline: "Mystery & Magic",
    emoji: "🎭",
    description: "Upload a mystery reveal or dare. Partner gets one clue at a time.",
    color: "#C53030",
    bg: "linear-gradient(145deg, rgba(197,48,48,0.35) 0%, rgba(90,10,10,0.20) 100%)",
    glow: "rgba(197,48,48,0.70)",
    border: "rgba(197,48,48,0.50)",
  },
  {
    id: "matrix"  as const,
    name: "Red Light Matrix",
    tagline: "Explore Together",
    emoji: "🔴",
    description: "A secret grid of desires. Both vote — only shared picks are revealed.",
    color: "#FF4444",
    bg: "linear-gradient(145deg, rgba(180,20,20,0.35) 0%, rgba(70,5,5,0.20) 100%)",
    glow: "rgba(220,30,30,0.70)",
    border: "rgba(200,30,30,0.50)",
    comingSoon: true,
  },
  {
    id: "trivia"  as const,
    name: "Trivia",
    tagline: "How Well Do You Know?",
    emoji: "⭐",
    description: "Weekly questions that reveal how deeply you know each other.",
    color: "#60A5FA",
    bg: "linear-gradient(145deg, rgba(59,93,220,0.35) 0%, rgba(20,30,100,0.20) 100%)",
    glow: "rgba(96,165,250,0.70)",
    border: "rgba(96,165,250,0.50)",
  },
] as const;

type GameId = typeof GAMES[number]["id"];

// ── Card component ─────────────────────────────────────────────────
function GameCard({
  game, isCenter, onLaunch,
}: {
  game: typeof GAMES[number];
  isCenter: boolean;
  onLaunch: () => void;
}) {
  return (
    <div style={{
        width: "100%",
        minHeight: 340,
        borderRadius: 28,
        background: `rgba(12,12,16,0.92)`,
        border: `1px solid ${isCenter ? game.border : "rgba(255,255,255,0.08)"}`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        boxShadow: isCenter
          ? [
              `0 0 0 1px ${game.border}`,
              `0 0 40px ${game.glow}40`,
              `0 0 80px ${game.glow}20`,
              "0 20px 60px rgba(0,0,0,0.7)",
            ].join(", ")
          : "0 8px 32px rgba(0,0,0,0.5)",
      }}>
      {/* Gradient overlay */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: 28,
        background: game.bg, pointerEvents: "none",
      }} />

      {/* Glow pulse when center */}
      {isCenter && (
        <motion.div
          style={{
            position: "absolute", inset: 0, borderRadius: 28,
            background: `radial-gradient(ellipse at 50% 0%, ${game.glow}30 0%, transparent 65%)`,
            pointerEvents: "none",
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Coming Soon ribbon */}
      {"comingSoon" in game && game.comingSoon && (
        <div style={{
          position: "absolute", top: 18, right: -28,
          background: game.color, color: "white",
          fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.14em",
          textTransform: "uppercase", padding: "4px 36px",
          transform: "rotate(40deg)",
          fontFamily: "'Quicksand', sans-serif",
          zIndex: 10,
        }}>
          Soon
        </div>
      )}

      <div style={{ padding: "32px 24px 24px", display: "flex", flexDirection: "column", flex: 1, position: "relative", zIndex: 1 }}>
        {/* Emoji + glow */}
        <div style={{ marginBottom: 20 }}>
          <motion.div
            style={{
              width: 72, height: 72, borderRadius: "50%",
              background: `radial-gradient(circle at 35% 30%, ${game.color}50, ${game.color}18)`,
              border: `1.5px solid ${game.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "2rem",
              boxShadow: isCenter ? `0 0 24px ${game.glow}` : "none",
            }}
            animate={isCenter ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          >
            {game.emoji}
          </motion.div>
        </div>

        {/* Text */}
        <p style={{
          fontSize: "0.65rem", fontFamily: "'Quicksand', sans-serif",
          fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
          color: game.color, margin: "0 0 6px",
        }}>
          {game.tagline}
        </p>
        <h2 style={{
          fontFamily: "'Playfair Display', serif",
          color: "rgba(255,255,255,0.95)", fontSize: "1.35rem",
          fontWeight: 700, margin: "0 0 10px", lineHeight: 1.2,
        }}>
          {game.name}
        </h2>
        <p style={{
          fontFamily: "'Caveat', cursive",
          color: "rgba(147,197,253,0.70)", fontSize: "1rem",
          lineHeight: 1.5, margin: "0 0 28px", flex: 1,
        }}>
          {game.description}
        </p>

        {/* Launch button */}
        {"comingSoon" in game && game.comingSoon ? (
          <div style={{
            padding: "13px 24px", borderRadius: 16, textAlign: "center",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.30)",
            fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: "0.88rem",
            letterSpacing: "0.08em",
          }}>
            Coming Soon
          </div>
        ) : (
          <motion.button
            onClick={isCenter ? onLaunch : undefined}
            whileTap={isCenter ? { scale: 0.94 } : {}}
            style={{
              padding: "13px 24px", borderRadius: 16, border: "none",
              cursor: isCenter ? "pointer" : "default",
              background: isCenter
                ? `linear-gradient(135deg, ${game.color}, ${game.color}88)`
                : "rgba(255,255,255,0.08)",
              color: isCenter ? "white" : "rgba(255,255,255,0.35)",
              fontFamily: "'Quicksand', sans-serif",
              fontWeight: 700, fontSize: "0.92rem",
              letterSpacing: "0.06em",
              boxShadow: isCenter ? `0 6px 24px ${game.glow}` : "none",
              transition: "all 0.25s",
            }}
          >
            {isCenter ? "Launch →" : "—"}
          </motion.button>
        )}
      </div>
    </div>
  );
}

// ── 3D Carousel ────────────────────────────────────────────────────
function Carousel({
  activeIdx,
  setActiveIdx,
  onLaunch,
}: {
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  onLaunch: (id: GameId) => void;
}) {
  // Live drag offset → drives the spec'd "Squish & Stretch" physics.
  //   stretchX  — the carousel scales ~5 % toward the swipe direction
  //   skewLean  — the active card subtly skews along the swipe axis
  //               (left-drag → top leans right, +3°; right-drag → -3°)
  // On release `fmAnimate(dragX, 0)` springs both back to 0, so the
  // cards "snap" into their perfect glass shape.
  const dragX     = useMotionValue(0);
  const stretchX  = useTransform(dragX, [-160, 0, 160], [1.05, 1, 1.05]);
  const skewLean  = useTransform(dragX, [-160, 0, 160], [3,    0, -3]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    // Spring dragX back to 0 so the stretch eases out
    fmAnimate(dragX, 0, { type: "spring", stiffness: 300, damping: 30 });

    const threshold = 55;
    if (info.offset.x < -threshold && activeIdx < GAMES.length - 1) {
      haptic("light");
      setActiveIdx(activeIdx + 1);
    } else if (info.offset.x > threshold && activeIdx > 0) {
      haptic("light");
      setActiveIdx(activeIdx - 1);
    }
  }

  return (
    /* Outer perspective wrapper — keeps 3D depth separate from the drag surface */
    <div style={{
      width: "100%",
      position: "relative",
      height: 400,
      perspective: "1000px",
    }}>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDrag={(_, info) => dragX.set(info.offset.x)}
        onDragEnd={handleDragEnd}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          transformStyle: "preserve-3d",
          cursor: "grab",
          touchAction: "pan-y",
          scaleX: stretchX,
          skewX:  skewLean,
        }}
      >
        {GAMES.map((game, i) => {
          const pos = i - activeIdx; // -1, 0, 1
          const isCenter = pos === 0;
          const isVisible = Math.abs(pos) <= 1;

          return (
            <motion.div
              key={game.id}
              animate={{
                x: `${pos * 72}%`,
                rotateY: pos * 25,
                scale: isCenter ? 1.06 : 0.83,
                opacity: isVisible ? (isCenter ? 1 : 0.55) : 0,
                zIndex: isCenter ? 20 : 5,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
                mass: 1.1,
              }}
              style={{
                position: "absolute",
                top: 0,
                left: "15%",
                width: "70%",
                transformOrigin: "center center",
              }}
              onClick={() => {
                if (!isCenter) {
                  haptic("light");
                  setActiveIdx(i);
                }
              }}
            >
              <GameCard
                game={game}
                isCenter={isCenter}
                onLaunch={() => onLaunch(game.id)}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ── Dot indicators ─────────────────────────────────────────────────
function CarouselDots({ active, count, color }: { active: number; count: number; color: string }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            width: i === active ? 24 : 8,
            background: i === active ? color : "rgba(255,255,255,0.25)",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          style={{ height: 8, borderRadius: 4, flexShrink: 0 }}
        />
      ))}
    </div>
  );
}

// ── Red Light Matrix placeholder ───────────────────────────────────
function RedLightMatrix({ onBack }: { onBack: () => void }) {
  const items = [
    "Stargazing", "Slow dance", "Candlelit dinner", "Late-night drive",
    "Cook together", "New city trip", "Skinny dip", "Write love letters",
    "Karaoke night", "Sunrise watch", "Spa day", "Midnight snack run",
  ];
  const [voted, setVoted] = useState<Set<number>>(new Set());

  return (
    <div style={{
      minHeight: "100%", background: "#030303",
      display: "flex", flexDirection: "column",
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)",
    }}>
      {/* Header */}
      <div style={{
        padding: "max(20px, env(safe-area-inset-top, 20px)) 20px 12px",
        display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <motion.button
          onClick={onBack}
          whileTap={{ scale: 0.9 }}
          style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: "1.1rem",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ‹
        </motion.button>
        <div>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            color: "white", fontSize: "1.15rem", fontWeight: 700, margin: 0,
          }}>
            Red Light Matrix
          </h2>
          <p style={{
            color: "#FF4444", fontSize: "0.65rem",
            fontFamily: "'Quicksand', sans-serif",
            letterSpacing: "0.14em", textTransform: "uppercase", margin: 0,
          }}>
            Tap your desires — shared picks reveal ✨
          </p>
        </div>
      </div>

      {/* Grid */}
      <div style={{
        padding: "20px 16px",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
      }}>
        {items.map((item, i) => {
          const isOn = voted.has(i);
          return (
            <motion.button
              key={i}
              onClick={() => {
                haptic("light");
                setVoted(prev => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i); else next.add(i);
                  return next;
                });
              }}
              whileTap={{ scale: 0.93 }}
              animate={{
                background: isOn
                  ? "rgba(220,30,30,0.25)"
                  : "rgba(255,255,255,0.05)",
                borderColor: isOn
                  ? "rgba(220,30,30,0.60)"
                  : "rgba(255,255,255,0.08)",
                boxShadow: isOn
                  ? "0 0 20px rgba(220,30,30,0.35)"
                  : "none",
              }}
              transition={{ duration: 0.18 }}
              style={{
                padding: "14px 10px",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.08)",
                cursor: "pointer",
                fontFamily: "'Quicksand', sans-serif",
                color: isOn ? "#FF6060" : "rgba(255,255,255,0.55)",
                fontWeight: 600, fontSize: "0.82rem",
                textAlign: "center", lineHeight: 1.3,
              }}
            >
              {isOn ? "❤️" : "🔴"} {item}
            </motion.button>
          );
        })}
      </div>

      {/* Waiting notice */}
      {voted.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            margin: "0 16px",
            background: "rgba(220,30,30,0.12)",
            border: "1px solid rgba(220,30,30,0.25)",
            borderRadius: 16, padding: "14px 16px", textAlign: "center",
          }}
        >
          <p style={{
            fontFamily: "'Caveat', cursive",
            color: "rgba(255,100,100,0.85)", fontSize: "1rem", margin: 0,
          }}>
            {voted.size} picked ✨ Waiting for your partner to choose...
          </p>
          <p style={{
            color: "rgba(147,197,253,0.40)", fontSize: "0.68rem",
            fontFamily: "'Quicksand', sans-serif", margin: "4px 0 0",
          }}>
            Shared desires will glow when both of you agree
          </p>
        </motion.div>
      )}
    </div>
  );
}

// ── Game overlay wrapper ───────────────────────────────────────────
function GameOverlay({
  gameId, onBack,
}: {
  gameId: GameId;
  onBack: () => void;
}) {
  const game = GAMES.find(g => g.id === gameId)!;

  return (
    <motion.div
      key={gameId}
      initial={{ x: "100%", opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      style={{
        position: "absolute", inset: 0,
        background: "#000000", zIndex: 100,
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Back button — sits in the normal flow above game content */}
      <div style={{
        flexShrink: 0,
        position: "sticky",
        top: 0,
        paddingTop: "max(16px, calc(env(safe-area-inset-top, 16px) + 8px))",
        paddingLeft: 16, paddingRight: 16,
        paddingBottom: 8,
        background: "#000000",
        zIndex: 20,
      }}>
        <motion.button
          onClick={() => { haptic("soft"); onBack(); }}
          whileTap={{ scale: 0.88 }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px 7px 10px",
            borderRadius: 20,
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(12px)",
            border: `1px solid ${game.border}`,
            color: game.color, cursor: "pointer",
            fontFamily: "'Quicksand', sans-serif",
            fontWeight: 700, fontSize: "0.8rem",
          }}
        >
          <span style={{ fontSize: "1rem", lineHeight: 1 }}>‹</span>
          Games
        </motion.button>
      </div>

      {/* Game content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {gameId === "corner"  && <CouplesCornerPage />}
        {gameId === "trivia"  && <TriviaPage />}
        {gameId === "matrix"  && <RedLightMatrix onBack={onBack} />}
      </div>
    </motion.div>
  );
}

// ── Main GamesHubPage ──────────────────────────────────────────────
export default function GamesHubPage() {
  const [activeIdx, setActiveIdx]   = useState(0);
  const [activeGame, setActiveGame] = useState<GameId | null>(null);

  const activeGame_ = GAMES[activeIdx];

  function handleLaunch(id: GameId) {
    const g = GAMES.find(g => g.id === id);
    if (!g || ("comingSoon" in g && g.comingSoon)) return;
    haptic("medium");
    setActiveGame(id);
  }

  function handleBack() {
    haptic("soft");
    setActiveGame(null);
  }

  return (
    <div style={{
      position: "relative",
      width: "100%",
      height: "100%",
      background: "#030303",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Ambient orbs */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <motion.div
          style={{
            position: "absolute", top: -80, left: -60,
            width: 280, height: 280, borderRadius: "50%",
            background: `radial-gradient(circle, ${activeGame_.glow}20 0%, transparent 70%)`,
          }}
          animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.1, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          style={{
            position: "absolute", bottom: 80, right: -80,
            width: 240, height: 240, borderRadius: "50%",
            background: `radial-gradient(circle, ${activeGame_.glow}15 0%, transparent 70%)`,
          }}
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        />
      </div>

      {/* Header */}
      <div style={{
        flexShrink: 0,
        paddingTop: "max(16px, env(safe-area-inset-top, 16px))",
        paddingLeft: 20, paddingRight: 20, paddingBottom: 0,
        position: "relative", zIndex: 10,
      }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          color: "rgba(255,255,255,0.92)", fontSize: "1.4rem",
          fontWeight: 700, margin: "0 0 2px",
        }}>
          Games
        </h1>
        <p style={{
          color: "rgba(147,197,253,0.40)", fontSize: "0.62rem",
          fontFamily: "'Quicksand', sans-serif",
          letterSpacing: "0.16em", textTransform: "uppercase", margin: 0,
        }}>
          Swipe to explore · tap to play
        </p>
      </div>

      {/* Carousel container */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)",
        position: "relative",
        zIndex: 10,
        gap: 24,
      }}>
        <Carousel
          activeIdx={activeIdx}
          setActiveIdx={setActiveIdx}
          onLaunch={handleLaunch}
        />

        {/* Dots */}
        <CarouselDots
          active={activeIdx}
          count={GAMES.length}
          color={activeGame_.color}
        />

        {/* Active game name hint */}
        <motion.p
          key={activeIdx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            textAlign: "center",
            fontFamily: "'Caveat', cursive",
            color: `${activeGame_.color}BB`,
            fontSize: "1.1rem",
            margin: 0,
          }}
        >
          {activeGame_.tagline}
        </motion.p>
      </div>

      {/* Game overlay — slides in from right, slides out on back */}
      <AnimatePresence mode="wait">
        {activeGame && (
          <GameOverlay gameId={activeGame} onBack={handleBack} />
        )}
      </AnimatePresence>
    </div>
  );
}
