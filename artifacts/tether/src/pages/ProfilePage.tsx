import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { useEditMode } from "@/lib/EditModeContext";
import { motion, AnimatePresence, LayoutGroup, useMotionValue, useAnimation, useSpring } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { PullToRefresh } from "@/components/PullToRefresh";
import { isKyle, getSexBoxArchive, type SexBoxEntry } from "@/lib/naughtyBox";
import { registerServiceWorker, setupPushNotifications, requestNotificationPermission } from "@/lib/notifications";
import { playTap, playSave, playModalOpen, playModalClose } from "@/lib/sounds";
import highEmojiImg from "@assets/image_1776256634422.png";
import { Avatar3D, preloadAvatar } from "@/components/Avatar3D";
import { SpatialCard } from "@/components/SpatialCard";
import { SensorSyncIcon } from "@/components/SensorSyncIcon";

preloadAvatar("/kyle-avatar.glb");
preloadAvatar("/nathan-avatar.glb");

// ─── Types ───────────────────────────────────────────────────────────────────
interface SpicyCategory { key: string; label: string; emoji: string; }

interface SpicyStats {
  position: string;
  kinks: string;
  threesome_prefs: string;
  turn_ons: string;
  custom_categories?: SpicyCategory[];
  [key: string]: string | SpicyCategory[] | undefined;
}

interface ProfileDetail {
  user_id: string;
  avatar_uri: string | null;
  vibe_emoji: string;
  vibe_text: string;
  love_language: string;
  coffee_order: string;
  shoe_size: string;
  bucket_list: string;
  spicy_stats: SpicyStats | null;
}

const EMPTY_SPICY: SpicyStats = {
  position: "",
  kinks: "",
  threesome_prefs: "",
  turn_ons: "",
  custom_categories: [],
};

const EMPTY_DETAIL = (userId: string): ProfileDetail => ({
  user_id: userId,
  avatar_uri: null,
  vibe_emoji: "✨",
  vibe_text: "",
  love_language: "",
  coffee_order: "",
  shoe_size: "",
  bucket_list: "",
  spicy_stats: null,
});

// ─── Glass styles ─────────────────────────────────────────────────────────────
// Highly translucent smoked glass — background colors bleed through beautifully
const GLASS_CARD: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)",
  backdropFilter: "blur(30px) saturate(180%)",
  WebkitBackdropFilter: "blur(30px) saturate(180%)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 20,
  boxShadow: "0 8px 32px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.20)",
};

// Spicy card: crimson border + purple/magenta outer glow + dark-red inner glow
const SPICY_CARD: React.CSSProperties = {
  ...GLASS_CARD,
  border: "1.5px solid rgba(197,48,48,0.55)",
  boxShadow: [
    "0 8px 32px rgba(0,0,0,0.55)",
    "0 0 32px 8px rgba(147,51,234,0.22)",
    "0 0 16px 4px rgba(197,48,48,0.20)",
    "inset 0 0 38px rgba(100,0,0,0.28)",
    "inset 0 1px 0 rgba(255,100,100,0.18)",
  ].join(", "),
};

// ─── Avatar Circle ────────────────────────────────────────────────────────────
// Glass-orb effect: pulsing ambient glow behind + lens-flare specular arc inside
function AvatarCircle({
  name,
  avatarUri,
  isOwn,
  onUpload,
}: {
  name: string;
  avatarUri: string | null;
  isOwn: boolean;
  onUpload?: () => void;
}) {
  const initials    = name.slice(0, 1).toUpperCase();
  const isKyleOrb   = name.toLowerCase() === "kyle";
  const rimColor    = isOwn ? "rgba(197,48,48,0.60)"  : "rgba(147,197,253,0.50)";
  const glowColor   = isOwn ? "rgba(197,48,48,0.40)"  : "rgba(147,197,253,0.35)";
  const depthGrad   = isOwn
    ? "radial-gradient(circle at 38% 38%, rgba(255,160,160,0.35) 0%, rgba(197,48,48,0.18) 48%, rgba(60,5,5,0.50) 100%)"
    : "radial-gradient(circle at 38% 38%, rgba(200,225,255,0.30) 0%, rgba(100,150,220,0.18) 48%, rgba(5,10,60,0.50) 100%)";

  // ── Avatar Roaming Engine ────────────────────────────────────
  // The orb is never static.  Every 5 seconds we pick a fresh
  // random target inside its card and have the orb spring toward
  // that point — so it reads as if it's "exploring its room".
  // Translation range: ±70px / ±40px (the avatar is 108×108, well
  // contained within the ~280-300px wide profile card).  Yaw and
  // pitch shift in concert so the sphere appears to look where
  // it's heading.  When the user is actively interacting (page
  // not idle for more than 10 s) the same loop continues — this
  // is intentional: the orb feels alive at all times, not just
  // when you walk away.
  const [look, setLook] = useState({ x: 0, y: 0, ry: 0, rx: 0 });
  useEffect(() => {
    const pick = () => setLook({
      x:  (Math.random() - 0.5) * 140,    // ±70px horizontal roam
      y:  (Math.random() - 0.5) *  80,    // ±40px vertical  roam
      ry: (Math.random() - 0.5) *  24,    // ±12° look-yaw   toward target
      rx: (Math.random() - 0.5) *  14,    // ±7°  look-pitch toward target
    });
    pick();
    // Slight jitter so Kyle / Nathan orbs don't move in lock-step
    const jitter = isKyleOrb ? 0 : 1100;
    const id = setInterval(pick, 5000 + jitter);
    return () => clearInterval(id);
  }, [isKyleOrb]);

  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0, zIndex: 8 }}>

      {/* ── Contact shadow — soft elliptical drop onto the card surface
       *   beneath the orb, grounding the avatar in 3D space.  Sits BELOW
       *   every other layer (z=0) so it reads as the orb's own shadow
       *   on the glass.  The orb container itself is bumped to z=8 so
       *   the entire avatar stack floats above the card's rim/refract
       *   pseudo-elements. */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.55, 0.78, 0.55], scaleX: [0.95, 1.04, 0.95] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: isKyleOrb ? 0 : 1.1 }}
        style={{
          position: "absolute",
          left:   "50%",
          bottom: -14,
          transform: "translateX(-50%)",
          width:   84,
          height:  18,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.30) 45%, rgba(0,0,0,0) 75%)",
          filter: "blur(6px)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      {/* ── Pulsing ambient glow — sits behind the orb ── */}
      <motion.div
        animate={{ opacity: [0.50, 0.88, 0.50], scale: [0.95, 1.06, 0.95] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: isKyleOrb ? 0 : 1.9 }}
        style={{
          position: "absolute", inset: -12, borderRadius: "50%",
          background: `radial-gradient(circle at 50% 50%, ${glowColor} 0%, transparent 68%)`,
          filter: "blur(10px)", zIndex: 0, pointerEvents: "none",
        }}
      />

      {/* ── Glass orb — always-on breathe + idle-only look-around ── */}
      <motion.div
        initial={{ scale: 0.82, opacity: 0 }}
        animate={{
          scale:   [1, 1.025, 1],
          rotateY: look.ry,
          rotateX: look.rx,
          x:       look.x,
          y:       look.y,
          opacity: 1,
        }}
        transition={{
          scale:   { duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: isKyleOrb ? 0 : 0.6 },
          rotateY: { type: "spring", stiffness: 36, damping: 14, mass: 1 },
          rotateX: { type: "spring", stiffness: 36, damping: 14, mass: 1 },
          x:       { type: "spring", stiffness: 36, damping: 14, mass: 1 },
          y:       { type: "spring", stiffness: 36, damping: 14, mass: 1 },
          opacity: { duration: 0.4 },
        }}
        onClick={() => { if (isOwn && onUpload) { haptic("light"); onUpload(); } }}
        style={{
          position:       "relative",
          zIndex:         1,
          width:          108,
          height:         108,
          borderRadius:   "50%",
          cursor:         isOwn ? "pointer" : "default",
          flexShrink:     0,
          overflow:       "hidden",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          background:     avatarUri ? "transparent" : depthGrad,
          border:         `2.5px solid ${rimColor}`,
          transformStyle: "preserve-3d",
          transformPerspective: 700,
          boxShadow: [
            // SPEC — Avatar Depth Fix: dedicated grounding shadow so
            // the orb visibly hovers above its card surface.
            "0 15px 35px rgba(0,0,0,0.50)",
            `0 0 0 1px ${isOwn ? "rgba(197,48,48,0.18)" : "rgba(147,197,253,0.15)"}`,
            `0 0 24px 6px ${glowColor}`,
            "0 4px 16px rgba(0,0,0,0.42)",
            "inset 0.5px 0.5px 0 rgba(255,255,255,0.95)", /* sharp 0.5px specular at TL */
            "inset -1px -1px 0 rgba(0,0,0,0.45)",         /* deep shadow BR */
          ].join(", "),
        }}
      >
        {/* Inner depth shimmer (behind image or initials) */}
        {!avatarUri && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none",
            background: isOwn
              ? "radial-gradient(circle at 38% 38%, rgba(255,180,180,0.22) 0%, transparent 58%)"
              : "radial-gradient(circle at 38% 38%, rgba(180,210,255,0.22) 0%, transparent 58%)",
          }} />
        )}

        {/* Avatar image or initials */}
        {avatarUri ? (
          <img src={avatarUri} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{
            position: "relative", zIndex: 2,
            fontFamily: "'Playfair Display', serif",
            fontSize: "2.5rem", fontWeight: 700,
            color: "rgba(255,255,255,0.92)", lineHeight: 1,
            textShadow: "0 2px 8px rgba(0,0,0,0.38)",
          }}>
            {initials}
          </span>
        )}

        {/* Blink — eyelid sweep down across the orb every ~5s */}
        <motion.div
          aria-hidden
          animate={{ scaleY: [0, 0, 1, 0], opacity: [0, 0, 0.45, 0] }}
          transition={{
            duration: 0.6, repeat: Infinity, repeatDelay: 4.8 + (isKyleOrb ? 0 : 1.4),
            times: [0, 0.45, 0.55, 1], ease: "easeInOut",
          }}
          style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 60%)",
            transformOrigin: "top",
            pointerEvents: "none", zIndex: 5,
          }}
        />

        {/* ── Convex-Marble Lens overlay (SPEC) ────────────────────
         * Center-bright radial gradient that simulates the front
         * face of a curved glass sphere catching ambient light.
         * Stacked beneath the corner specular arc so the orb reads
         * as if you're looking AT a marble, not a flat disc. */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background:
            "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.10) 28%, rgba(255,255,255,0.02) 55%, rgba(0,0,0,0) 78%)",
          mixBlendMode: "screen",
          pointerEvents: "none", zIndex: 2,
        }} />

        {/* Corner specular arc + soft bottom sheen — sits ABOVE the
         * convex lens so the highlight catches at the top-left. */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: [
            "radial-gradient(ellipse 70% 38% at 36% 20%, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0) 60%),",
            "radial-gradient(ellipse 55% 22% at 60% 88%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)",
          ].join(" "),
          pointerEvents: "none", zIndex: 3,
        }} />

        {/* Camera overlay hint */}
        {isOwn && (
          <div className="avatar-hover-overlay" style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: "rgba(0,0,0,0.30)",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: 0, transition: "opacity 0.2s", zIndex: 4,
          }}>
            <span style={{ fontSize: "1.4rem" }}>📷</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
// glowColor: RGBA accent glow (e.g. "rgba(212,160,23,0.28)") per-card signature
function SectionCard({
  title,
  emoji,
  children,
  spicy = false,
  glowColor,
  style,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
  spicy?: boolean;
  glowColor?: string;
  style?: React.CSSProperties;
}) {
  const baseStyle = spicy ? SPICY_CARD : GLASS_CARD;
  const cardStyle: React.CSSProperties = {
    ...baseStyle,
    padding: "20px 22px",
    ...(glowColor && !spicy ? {
      boxShadow: [
        "0 8px 32px rgba(0,0,0,0.38)",
        `0 0 28px 6px ${glowColor}`,
        "inset 0 1px 0 rgba(255,255,255,0.20)",
      ].join(", "),
    } : {}),
    ...style,
  };

  return (
    <SpatialCard
      intensity={0.5}
      radius={20}
      ambientGlow={glowColor}
      style={cardStyle}
      noRim
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {/* Icon in frosted glass circle */}
        <div style={{
          width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(255,255,255,0.12)",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: glowColor
            ? `0 0 10px 2px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.30)`
            : "inset 0 1px 0 rgba(255,255,255,0.28)",
          fontSize: "1.05rem",
        }}>
          {emoji}
        </div>
        <span style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "0.85rem",
          fontWeight: 700,
          color: spicy ? "rgba(255,120,120,0.95)" : "rgba(255,255,255,0.90)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          {title}
        </span>
        {spicy && (
          <span style={{
            marginLeft: "auto",
            fontSize: "0.62rem",
            color: "rgba(197,48,48,0.85)",
            border: "1px solid rgba(197,48,48,0.50)",
            borderRadius: 6,
            padding: "1px 6px",
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}>
            🔞 PRIVATE
          </span>
        )}
      </div>
      {children}
    </SpatialCard>
  );
}

// ─── Field Row ────────────────────────────────────────────────────────────────
function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        fontSize: "0.62rem",
        color: "rgba(147,197,253,0.60)",
        fontWeight: 600,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "0.88rem",
        color: value ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.28)",
        fontFamily: "'Quicksand', sans-serif",
        lineHeight: 1.45,
        whiteSpace: "pre-wrap",
      }}>
        {value || "Not set yet…"}
      </div>
    </div>
  );
}

// ─── Gold Divider ─────────────────────────────────────────────────────────────
function GoldDivider({ label }: { label?: string }) {
  const lineStyle: React.CSSProperties = {
    flex: 1, height: 1,
    background: "linear-gradient(90deg, transparent 0%, rgba(212,160,23,0.58) 40%, rgba(212,160,23,0.58) 60%, transparent 100%)",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 0" }}>
      <div style={lineStyle} />
      {label && (
        <span style={{
          fontFamily: "'Quicksand', sans-serif",
          fontSize: "0.58rem", fontWeight: 700,
          color: "rgba(212,160,23,0.75)", letterSpacing: "0.14em",
          textTransform: "uppercase", flexShrink: 0,
        }}>
          {label}
        </span>
      )}
      <div style={lineStyle} />
    </div>
  );
}

// ─── Vibe color mapping ───────────────────────────────────────────────────────
function vibeColors(emoji: string, text: string): { c1: string; c2: string; c3: string } {
  const lc = (text + " " + emoji).toLowerCase();
  if (/horny/.test(lc))                                          return { c1: "#c084fc", c2: "#9333ea", c3: "#3b0764" };  // purple
  if (/high|stoned|blazed|baked|lifted|faded|420|weed/.test(lc)) return { c1: "#86efac", c2: "#22c55e", c3: "#14532d" };  // green haze
  if (/angry|mad|furious|annoyed|rage|pissed|irritat/.test(lc)) return { c1: "#ef4444", c2: "#dc2626", c3: "#450a0a" };  // red heat
  if (/love|heart|roman|sweet|adore|affec|cherish/.test(lc))    return { c1: "#f472b6", c2: "#db2777", c3: "#831843" };  // pink
  if (/hungry|starving|famished|craving/.test(lc))               return { c1: "#fde047", c2: "#ca8a04", c3: "#713f12" };  // amber
  if (/chill|relax|peace|calm|zen|serene|quiet/.test(lc))        return { c1: "#60a5fa", c2: "#2563eb", c3: "#1e3a8a" };  // blue soft
  if (/energy|excit|wild|fire|hype|alive/.test(lc))              return { c1: "#fb923c", c2: "#ea580c", c3: "#7c2d12" };
  if (/happy|joy|sun|bright|smile|fun/.test(lc))                 return { c1: "#fbbf24", c2: "#d97706", c3: "#78350f" };
  if (/myst|dark|moon|deep|soul|dream/.test(lc))                 return { c1: "#a78bfa", c2: "#7c3aed", c3: "#2e1065" };
  if (/spicy|naughty|passion|desire|hot/.test(lc))               return { c1: "#fb7185", c2: "#e11d48", c3: "#4c0519" };
  if (/natur|green|earth|forest|fresh/.test(lc))                 return { c1: "#4ade80", c2: "#16a34a", c3: "#14532d" };
  return { c1: "#fcd34d", c2: "#f59e0b", c3: "#92400e" };
}

// ─── Trigger-word → emoji mapping ────────────────────────────────────────────
// Falls back to the user-set emoji if no trigger word matches
function vibeToEmoji(text: string, fallback: string): string {
  const lc = text.toLowerCase();
  // Food & drink
  if (/hungry|starving|famished|snack/.test(lc))          return "🤤";
  if (/pizza/.test(lc))                                    return "🍕";
  if (/coffee|latte|espresso|caffein/.test(lc))            return "☕";
  if (/wine|cocktail|beer|drunk|booze/.test(lc))           return "🍷";
  if (/chocolate|dessert|ice.?cream|cake/.test(lc))        return "🍰";
  if (/taco|burrito|mexican/.test(lc))                     return "🌮";
  if (/sushi|ramen|noodle/.test(lc))                       return "🍜";
  // Emotions
  if (/ecstatic|overjoyed|thrilled|amazing|best.?day/.test(lc)) return "🤩";
  if (/happy|joyful|excited|great|fantastic|wonderful/.test(lc)) return "😊";
  if (/sad|down|depress|upset|crying|heartbroken/.test(lc)) return "😢";
  if (/angry|mad|furious|annoyed|rage|pissed/.test(lc))    return "😤";
  if (/tired|exhaust|sleepy|nap|drowsy|dead/.test(lc))     return "😴";
  if (/stress|anxious|worry|nervous|overwhelm/.test(lc))   return "😰";
  if (/miss|longing|lonely|apart|wish.*(here|with)/.test(lc)) return "🥺";
  if (/love|adore|heart|romance|swooning/.test(lc))        return "🥰";
  if (/chill|relax|peace|calm|zen|serene/.test(lc))        return "😌";
  if (/high|stoned|blazed|baked|lifted|faded|420|weed/.test(lc)) return "__HIGH__";
  if (/horny/.test(lc))                                    return "😈";
  if (/silly|goofy|laugh|funny|humor|clown/.test(lc))      return "😂";
  if (/playful|cheeky|tease|mischiev/.test(lc))            return "😜";
  if (/naughty|spicy|desire|passion|frisky/.test(lc))      return "🌶️";
  if (/flirty|crush|butterflies/.test(lc))                  return "😘";
  if (/shy|blush|embarra/.test(lc))                        return "😳";
  if (/bored|meh|whatever|blah|bland/.test(lc))            return "😑";
  if (/weird|quirky|random|odd|chaotic/.test(lc))          return "🤪";
  if (/grateful|thankful|blessed|appreci/.test(lc))        return "🙏";
  if (/proud|accomplish|win|success|nailed/.test(lc))      return "🏆";
  // Energy / activity
  if (/wild|energy|hype|alive|pump|hype/.test(lc))         return "⚡";
  if (/cool|swag|smooth|baddie/.test(lc))                  return "😎";
  if (/strong|power|gym|workout|fit|grind/.test(lc))       return "💪";
  if (/creative|art|music|paint|vibe/.test(lc))            return "🎨";
  if (/adventur|explor|travel|wander|road.?trip/.test(lc)) return "🌍";
  if (/cozy|comfort|snug|warm|blanket|hygge/.test(lc))     return "🫖";
  if (/reading|book|study|nerd/.test(lc))                   return "📚";
  if (/party|celebrate|birthday/.test(lc))                  return "🎉";
  // Weather / atmosphere
  if (/fire|burning|flame|hot/.test(lc))                   return "🔥";
  if (/moon|night|dark|mystic|witch/.test(lc))             return "🌙";
  if (/sun|sunny|summer|beach|bright/.test(lc))            return "☀️";
  if (/rain|storm|thunder|cloudy/.test(lc))                return "⛈️";
  if (/snow|winter|cold|freezing/.test(lc))                return "❄️";
  // Romantic
  if (/romantic|dream|cloud nine|float/.test(lc))          return "💫";
  if (/cute|adorable|soft|precious/.test(lc))              return "🥹";
  if (/heartfelt|tender|sweet(?!heart)/.test(lc))          return "💗";
  return fallback || "✨";
}

// ─── Mood detection ─────────────────────────────────────────────────────────
type Mood = "happy" | "sad" | "spicy" | "high" | "zen" | "angry" | "loved" | "hungry" | "default";
function detectMood(text: string): Mood {
  const lc = text.toLowerCase();
  if (/angry|mad|furious|annoyed|rage|pissed|irritat/.test(lc))          return "angry";
  if (/high|stoned|blazed|baked|lifted|faded|420|weed/.test(lc))         return "high";
  if (/love|adore|romantic|swooning|butterflies|cherish/.test(lc))        return "loved";
  if (/hungry|starving|famished|craving|snack(?!chat)|food/.test(lc))     return "hungry";
  if (/chill|relax|peace|calm|zen|serene|meditat|breath/.test(lc))        return "zen";
  if (/happy|joy|excit|energy|hype|great|amazing|thrill|ecstat|wild|alive|celebrat|party/.test(lc)) return "happy";
  if (/sad|tired|exhaust|depress|down|sleepy|low|miss|lonely|apart|stress|anxious|bored/.test(lc))  return "sad";
  if (/spicy|naughty|horny|desire|passion|frisky|flirt|tease|cheeky|mischiev|playful|feisty/.test(lc)) return "spicy";
  return "default";
}
const MOOD_SPEED: Record<Mood, number> = {
  happy: 1.80, sad: 0.35, spicy: 0.85, high: 0.55, zen: 0.06,
  angry: 3.50, loved: 0.65, hungry: 1.00, default: 1.10,
};
const MOOD_PULSE: Record<Mood, number> = {
  happy: 2.00, sad: 5.00, spicy: 3.00, high: 4.50, zen: 3.00,
  angry: 0.55, loved: 2.50, hungry: 3.20, default: 3.50,
};
const TOTEM_H = 176;   // container height (px)
const TOTEM_R = 32;    // emoji touch-area radius (px)

// ─── Tether Totem ─────────────────────────────────────────────────────────────
// Fully articulated physics character with mood-driven personality.
function TetherTotem({ emoji: userEmoji, text }: { emoji: string; text: string }) {
  const mood        = detectMood(text);
  const isHorny     = /horny/.test(text.toLowerCase());
  const activeEmoji = text ? vibeToEmoji(text, userEmoji || "✨") : (userEmoji || "✨");
  const { c1 }      = vibeColors(userEmoji, text);

  // ── Physics refs ──────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const xMV          = useMotionValue(0);
  const yMV          = useMotionValue(0);
  const vxRef        = useRef(0);
  const vyRef        = useRef(0);
  const frameId      = useRef<number>(0);
  const timeRef      = useRef(0);
  const lastBounce   = useRef(0);

  // ── Squash & stretch — spring-backed scale motion values ──────────────────────
  const squashXMV    = useMotionValue(1);
  const squashYMV    = useMotionValue(1);
  const scaleXSpring = useSpring(squashXMV, { stiffness: 550, damping: 22 });
  const scaleYSpring = useSpring(squashYMV, { stiffness: 550, damping: 22 });

  // ── Animation controls ────────────────────────────────────────────────────────
  const spinControls = useAnimation();
  const bodyControls = useAnimation();

  // ── Character state ───────────────────────────────────────────────────────────
  const [leftArm,      setLeftArm]      = useState("🤚");
  const [rightArm,     setRightArm]     = useState("🤚");
  const [isStretching, setIsStretching] = useState(false);
  const [sleeping,     setSleeping]     = useState(false);
  const [idleAnim,     setIdleAnim]     = useState<"breath" | "stretch" | "nudge" | null>(null);
  const idleTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reset velocity + phase on mood/text change ────────────────────────────────
  useEffect(() => {
    const angle   = Math.random() * Math.PI * 2;
    const spd     = MOOD_SPEED[mood];
    vxRef.current = Math.cos(angle) * spd;
    vyRef.current = Math.sin(angle) * spd;
    timeRef.current = 0;
    setSleeping(false);
  }, [mood, text]);

  // ── Arms per mood ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if      (mood === "happy")  { setLeftArm("👋"); setRightArm("👋"); }
    else if (mood === "angry")  { setLeftArm("✊"); setRightArm("✊"); }
    else if (mood === "loved")  { setLeftArm("🤗"); setRightArm("🤗"); }
    else if (mood === "zen")    { setLeftArm("🙏"); setRightArm("🙏"); }
    else if (mood === "hungry") { setLeftArm("🤚"); setRightArm("👉"); }
    else                        { setLeftArm("🤚"); setRightArm("🤚"); }
  }, [mood]);

  // ── Spicy: finger-gun cycle every ~4 s ───────────────────────────────────────
  useEffect(() => {
    if (mood !== "spicy") return;
    let alive = true;
    (async () => {
      while (alive) {
        await new Promise(r => setTimeout(r, 3800));
        if (!alive) break;
        setRightArm("👉");
        await new Promise(r => setTimeout(r, 1200));
        if (!alive) break;
        setRightArm("🤚");
      }
    })();
    return () => { alive = false; };
  }, [mood]);

  // ── Sleep timer: 1 hour without vibe change → drift asleep ───────────────────
  useEffect(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    setSleeping(false);
    sleepTimerRef.current = setTimeout(() => setSleeping(true), 3_600_000);
    return () => { if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current); };
  }, [mood, text]);

  // ── Idle timer: 30 s → random personality animation ──────────────────────────
  useEffect(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setIdleAnim(null);
    idleTimerRef.current = setTimeout(() => {
      const choices = ["breath", "stretch", "nudge"] as const;
      const pick    = choices[Math.floor(Math.random() * 3)];
      setIdleAnim(pick);
      const dur = pick === "breath" ? 4500 : pick === "stretch" ? 3500 : 2200;
      setTimeout(() => setIdleAnim(null), dur);
    }, 30_000);
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [mood]);

  // ── Idle sequence execution ───────────────────────────────────────────────────
  useEffect(() => {
    if (!idleAnim) { bodyControls.stop(); setIsStretching(false); return; }
    if (idleAnim === "breath") {
      bodyControls.start({ scale: [1, 1.16, 0.95, 1.13, 1],
        transition: { duration: 4.0, ease: "easeInOut" } });
    } else if (idleAnim === "stretch") {
      setIsStretching(true);
      bodyControls.start({ y: [0, -22, -24, -20, 0], scale: [1, 1.07, 1.10, 1.06, 1],
        transition: { duration: 3.0, ease: [0.34, 1.2, 0.64, 1] } });
      setTimeout(() => setIsStretching(false), 3000);
    } else if (idleAnim === "nudge") {
      vyRef.current += 2.8;
      vxRef.current *= 0.25;
    }
  }, [idleAnim]);

  // ── Physics loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const cw     = containerRef.current?.clientWidth ?? 280;
      const maxX   = cw / 2 - TOTEM_R - 4;
      const maxY   = TOTEM_H / 2 - TOTEM_R - 4;
      const tgtSpd = MOOD_SPEED[mood];

      if (sleeping) {
        // Drift to bottom-right corner and slow to a stop
        vxRef.current += (maxX * 0.78 - xMV.get()) * 0.04;
        vyRef.current += (maxY * 0.78 - yMV.get()) * 0.04;
        vxRef.current *= 0.88;
        vyRef.current *= 0.88;
      } else {
        // ── Mood-specific forces ─────────────────────────────────────────────
        if (mood === "happy") {
          vxRef.current += (Math.random() - 0.5) * 0.09;
          vyRef.current += (Math.random() - 0.5) * 0.09;
        }
        if (mood === "sad") {
          vyRef.current += 0.018;   // gravity bias — slides down to bottom
          vxRef.current *= 0.982;   // horizontal drag
        }
        if (mood === "spicy") {
          const cx = xMV.get(), cy = yMV.get(), d = Math.sqrt(cx*cx + cy*cy);
          if (d > 8) { vxRef.current += (-cy/d)*0.018; vyRef.current += (cx/d)*0.018; }
        }
        if (mood === "high") {
          // Lazy loopy Lissajous figure-eight — loose spring so it wanders freely
          timeRef.current += 0.0028;
          const figX = Math.sin(timeRef.current) * maxX * 0.78;
          const figY = Math.sin(timeRef.current * 2) * maxY * 0.78;
          vxRef.current += (figX - xMV.get()) * 0.005;
          vyRef.current += (figY - yMV.get()) * 0.005;
          // Extra slow sideways sway so it feels heavy and dreamy
          vxRef.current += Math.sin(timeRef.current * 0.4) * 0.012;
        }
        if (mood === "zen") {
          // Strong spring to center + heavy damping = breathing in place
          vxRef.current += (0 - xMV.get()) * 0.055;
          vyRef.current += (0 - yMV.get()) * 0.055;
          vxRef.current *= 0.82;
          vyRef.current *= 0.82;
        }
        if (mood === "angry") {
          // Occasional violent direction-change dashes
          if (Math.random() < 0.022) {
            const a = Math.random() * Math.PI * 2;
            vxRef.current = Math.cos(a) * tgtSpd * 1.9;
            vyRef.current = Math.sin(a) * tgtSpd * 1.9;
          }
          vxRef.current += (Math.random() - 0.5) * 0.26;
          vyRef.current += (Math.random() - 0.5) * 0.26;
        }
        if (mood === "loved") {
          // Slow dreamy circular orbit
          timeRef.current += 0.007;
          vxRef.current += (Math.cos(timeRef.current) * maxX * 0.55 - xMV.get()) * 0.006;
          vyRef.current += (Math.sin(timeRef.current) * maxY * 0.55 - yMV.get()) * 0.006;
        }
        if (mood === "hungry") {
          // Cycles between corners searching for food
          timeRef.current += 0.0015;
          const cIdx = Math.floor(timeRef.current / (Math.PI * 0.75)) % 4;
          const corners: [number,number][] = [[-maxX,-maxY],[maxX,-maxY],[maxX,maxY],[-maxX,maxY]];
          const [tx, ty] = corners[cIdx];
          vxRef.current += (tx - xMV.get()) * 0.004;
          vyRef.current += (ty - yMV.get()) * 0.004;
        }
        // Micro jitter (skip for zen — it should stay perfectly still)
        if (mood !== "zen") {
          vxRef.current += (Math.random() - 0.5) * 0.03;
          vyRef.current += (Math.random() - 0.5) * 0.03;
        }
        // Speed cap
        const spd = Math.sqrt(vxRef.current**2 + vyRef.current**2);
        const lo  = tgtSpd * 0.28, hi = tgtSpd * 1.65;
        if (spd > hi && spd > 0) { vxRef.current *= hi/spd; vyRef.current *= hi/spd; }
        if (spd < lo && spd > 0) { vxRef.current *= lo/spd; vyRef.current *= lo/spd; }
      }

      // ── Wall bounce with squash & stretch ────────────────────────────────────
      let nx = xMV.get() + vxRef.current;
      let ny = yMV.get() + vyRef.current;
      // Restitution: happy = super bouncy, sad = sad slides and sticks, angry = almost no loss
      const restitution = mood === "happy" ? 0.92 : mood === "sad" ? 0.28 : mood === "angry" ? 0.96 : 0.82;
      let bounced = false, bounceHorizontal = false;
      if (nx >  maxX) { nx =  maxX; vxRef.current *= -restitution; bounced = true; }
      if (nx < -maxX) { nx = -maxX; vxRef.current *= -restitution; bounced = true; }
      if (ny >  maxY) { ny =  maxY; vyRef.current *= -restitution; bounced = true; bounceHorizontal = true; }
      if (ny < -maxY) { ny = -maxY; vyRef.current *= -restitution; bounced = true; bounceHorizontal = true; }

      if (bounced && !sleeping) {
        const now = Date.now();
        if (now - lastBounce.current > 120) {
          lastBounce.current = now;
          const sqAmt = mood === "angry" ? 1.48 : mood === "happy" ? 1.36 : 1.28;
          const sqInv = mood === "angry" ? 0.58 : mood === "happy" ? 0.64 : 0.72;
          if (bounceHorizontal) { squashXMV.set(sqAmt); squashYMV.set(sqInv); }
          else                  { squashXMV.set(sqInv); squashYMV.set(sqAmt); }
          setTimeout(() => { squashXMV.set(1); squashYMV.set(1); }, 90);
        }
      }

      xMV.set(nx); yMV.set(ny);
      frameId.current = requestAnimationFrame(tick);
    };
    frameId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId.current);
  }, [mood, sleeping]);

  // ── Tap handler ───────────────────────────────────────────────────────────────
  async function handleTap(e: React.MouseEvent) {
    e.stopPropagation();
    if (sleeping) { setSleeping(false); haptic("light"); return; }
    haptic("medium");
    await spinControls.start({
      rotate: [0, 180, 360],
      scale:  [1, 1.38, 1.18, 1.32, 1],
      transition: { duration: 0.60, ease: [0.34, 1.2, 0.64, 1] },
    });
    spinControls.set({ rotate: 0, scale: 1 });
  }

  // ── Per-mood arm animations ───────────────────────────────────────────────────
  const leftArmAnim =
    isStretching         ? { rotate: [-100, -110, -100] }                          // stretch up
    : mood === "happy"   ? { rotate: [0, -72, -28, -65, 0], y: [0, -8, -3, -6, 0] } // victory wave
    : mood === "sad"     ? { rotate: [78, 60, 78], y: [0, 10, 0] }                // heavy droop
    : mood === "high"    ? { rotate: [-50, 55, -25, 48, -30, -50], y: [0, -18, 8, -15, 4, 0] } // heavy weightless float
    : mood === "angry"   ? { rotate: [-12, 12, -12], x: [-3, 3, -3] }             // tense shake
    : mood === "loved"   ? { rotate: [-42, -32, -42], y: [0, 6, 0] }             // open hug
    : mood === "hungry"  ? { rotate: [-8, -18, -8], y: [0, -4, 0] }              // idle/reach
    : mood === "zen"     ? { rotate: [-48, -52, -48], y: [0, -4, 0] }            // meditative open
    : mood === "spicy"   ? { rotate: [-6, 6, -6] }
    :                      { rotate: [-9, 9, -9], y: [0, 2, 0] };
  const leftArmDur =
    isStretching ? 1.0 : mood === "happy" ? 0.40 : mood === "sad" ? 5.5
    : mood === "high" ? 5.2 : mood === "angry" ? 0.14 : mood === "loved" ? 3.2
    : mood === "zen" ? 4.2 : mood === "hungry" ? 2.0 : 2.8;

  const rightArmAnim =
    isStretching           ? { rotate: [100, 110, 100] }
    : mood === "happy"     ? { rotate: [0, 72, 28, 65, 0], y: [0, -8, -3, -6, 0] } // mirror victory
    : mood === "sad"       ? { rotate: [-78, -60, -78], y: [0, 10, 0] }             // droop
    : mood === "high"      ? { rotate: [50, -55, 25, -48, 30, 50], y: [0, -18, 8, -15, 4, 0] } // heavy float
    : mood === "angry"     ? { rotate: [12, -12, 12], x: [3, -3, 3] }               // shake
    : mood === "loved"     ? { rotate: [42, 32, 42], y: [0, 6, 0] }                 // hug
    : mood === "hungry"    ? { rotate: [-25, -5, -25], x: [0, 10, 0] }             // reaching / pointing
    : mood === "zen"       ? { rotate: [48, 52, 48], y: [0, -4, 0] }               // meditative
    : rightArm === "👉"   ? { rotate: [-12, 12, -12], x: [0, 5, 0] }
    : mood === "spicy"     ? { rotate: [6, -6, 6] }
    :                        { rotate: [9, -9, 9], y: [0, 2, 0] };
  const rightArmDur =
    isStretching ? 1.0 : mood === "happy" ? 0.40 : mood === "sad" ? 5.5
    : mood === "high" ? 5.2 : mood === "angry" ? 0.14 : mood === "loved" ? 3.2
    : mood === "zen" ? 4.2 : mood === "hungry" ? 1.4
    : rightArm === "👉" ? 0.28 : 2.8;

  const displayEmoji = sleeping ? "😴" : activeEmoji;

  return (
    <div
      ref={containerRef}
      onClick={handleTap}
      style={{ position: "relative", width: "100%", height: TOTEM_H,
               overflow: "hidden", cursor: "pointer", marginTop: 4 }}
    >
      {/* Vibe text backdrop */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1,
                    display: "flex", alignItems: "flex-end", justifyContent: "center",
                    padding: "0 14px 10px", pointerEvents: "none" }}>
        {text ? (
          <span style={{ fontFamily: "'Quicksand', sans-serif", fontSize: "0.82rem",
                         fontStyle: "italic", color: "rgba(255,255,255,0.38)",
                         textAlign: "center", lineHeight: 1.5, letterSpacing: "0.01em" }}>
            "{text}"
          </span>
        ) : (
          <span style={{ fontSize: "0.70rem", color: "rgba(255,255,255,0.20)",
                         fontFamily: "'Quicksand', sans-serif", fontStyle: "italic" }}>
            Tap to react · set a vibe to animate the Totem
          </span>
        )}
      </div>

      {/* Rising smoke puffs — high mood */}
      {mood === "high" && !sleeping && (
        <>
          {[
            { left: "18%", delay: 0,    dur: 3.8 },
            { left: "52%", delay: 1.3,  dur: 3.2 },
            { left: "76%", delay: 0.7,  dur: 4.1 },
            { left: "36%", delay: 2.1,  dur: 3.5 },
          ].map((s, i) => (
            <motion.span key={`sm-${i}`}
              style={{ position: "absolute", bottom: 16, left: s.left,
                       fontSize: "0.82rem", zIndex: 3, pointerEvents: "none",
                       color: "rgba(200,230,200,0.7)", filter: "blur(1.5px)" }}
              animate={{ y: [-2, -38, -65], opacity: [0, 0.65, 0],
                         x: [0, i % 2 === 0 ? 7 : -7, 0], scale: [0.5, 1.1, 1.8] }}
              transition={{ duration: s.dur, repeat: Infinity, delay: s.delay, ease: "easeOut" }}
            >💨</motion.span>
          ))}
        </>
      )}

      {/* Floating hearts — loved mood */}
      {mood === "loved" && !sleeping && (
        <>
          {(["💖","💕","💗","💓"] as string[]).map((h, i) => (
            <motion.span key={`ht-${i}`}
              style={{ position: "absolute", fontSize: "0.82rem", bottom: 18,
                       left: `${12 + i * 19}%`, zIndex: 3, pointerEvents: "none" }}
              animate={{ y: [-4, -44, -72], opacity: [0, 0.80, 0],
                         x: [0, i % 2 === 0 ? 6 : -6, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.62, ease: "easeOut" }}
            >{h}</motion.span>
          ))}
        </>
      )}

      {/* Roaming physics cluster */}
      <motion.div
        style={{ x: xMV, y: yMV, position: "absolute", left: "50%", top: "50%",
                 marginLeft: -TOTEM_R, marginTop: -TOTEM_R,
                 width: TOTEM_R * 2, height: TOTEM_R * 2,
                 display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}
        animate={spinControls}
      >
        {/* Mood glow */}
        <motion.div
          animate={{ scale: [1, 1.45, 1], opacity: [0.28, 0.65, 0.28] }}
          transition={{ duration: MOOD_PULSE[mood], repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "absolute", inset: -14, borderRadius: "50%", zIndex: -1,
                   background: `radial-gradient(circle, ${c1}aa 0%, transparent 64%)`,
                   filter: "blur(10px)", pointerEvents: "none" }}
        />

        {/* Left arm — independent rotation from body */}
        <AnimatePresence mode="wait">
          <motion.span
            key={`L-${leftArm}-${isStretching}-${mood}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ ...leftArmAnim, opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ opacity: { duration: 0.2 }, scale: { duration: 0.2 },
                          duration: leftArmDur, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", right: "100%", top: "28%", marginRight: 3,
                     fontSize: "1.05rem", display: "inline-block",
                     transformOrigin: "bottom right", zIndex: 11, userSelect: "none" }}
          >
            {sleeping ? "🤚" : leftArm}
          </motion.span>
        </AnimatePresence>

        {/* Squash & stretch wrapper → idle body controls inside */}
        <motion.div style={{ scaleX: scaleXSpring, scaleY: scaleYSpring }}>
          <motion.div animate={bodyControls}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={displayEmoji}
                initial={{ scale: 0.25, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.25, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <motion.span
                  animate={
                    sleeping          ? { scale: [1, 1.05, 1] }                                                               :
                    isHorny           ? { rotate: [-13, 13, -13, 0], x: [0, -5, 5, -4, 0], scale: [1, 1.13, 0.95, 1.11, 1] } :
                    mood === "happy"  ? { rotate: [-10, 10, -10], scale: [1, 1.15, 1] }                                       :
                    mood === "sad"    ? { rotate: [-3, 3, -3], y: [0, 8, 0] }                                                 :
                    mood === "high"   ? { rotate: [-10, 6, -13, 9, -7, 0], y: [0, -6, 5, -10, 3, 0], scale: [1, 1.04, 0.97, 1.06, 0.98, 1] } :
                    mood === "angry"  ? { rotate: [-8, 8, -8], x: [-3, 3, -3], scale: [1, 1.08, 1] }                         :
                    mood === "loved"  ? { rotate: [-5, 5, -5], scale: [1, 1.10, 1] }                                          :
                    mood === "hungry" ? { rotate: [-7, 7, -7], y: [0, -3, 3, 0] }                                             :
                    mood === "zen"    ? { scale: [1, 1.08, 0.96, 1.04, 1] }                                                   :
                    mood === "spicy"  ? { rotate: [-7, 7, -7, 0], scale: [1, 1.09, 1] }                                       :
                                        { rotate: [-5, 5, -5] }
                  }
                  transition={{
                    duration: sleeping ? 4.2 : isHorny ? 0.52 : mood === "happy" ? 0.72 :
                      mood === "sad" ? 4.0 : mood === "high" ? 6.2 : mood === "angry" ? 0.18 :
                      mood === "loved" ? 2.8 : mood === "zen" ? 4.2 : mood === "hungry" ? 1.8 : 2.2,
                    repeat: Infinity, ease: "easeInOut",
                  }}
                  style={{ fontSize: "3.4rem", lineHeight: 1, display: "inline-block",
                           filter: mood === "high"
                             ? "drop-shadow(0 4px 14px rgba(0,0,0,0.5)) drop-shadow(0 0 12px rgba(134,239,172,0.55)) blur(0px)"
                             : "drop-shadow(0 4px 10px rgba(0,0,0,0.42))",
                           userSelect: "none" }}
                >
                  {displayEmoji === "__HIGH__"
                    ? <img src={highEmojiImg} alt="" style={{ width: "3.4rem", height: "3.4rem", objectFit: "contain", display: "block", pointerEvents: "none" }} />
                    : displayEmoji}
                </motion.span>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.div>

        {/* Right arm — independent rotation from body */}
        <AnimatePresence mode="wait">
          <motion.span
            key={`R-${rightArm}-${isStretching}-${mood}`}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ ...rightArmAnim, opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ opacity: { duration: 0.2 }, scale: { duration: 0.2 },
                          duration: rightArmDur, repeat: Infinity, ease: "easeInOut" }}
            style={{ position: "absolute", left: "100%", top: "28%", marginLeft: 3,
                     fontSize: "1.05rem", display: "inline-block",
                     transformOrigin: "bottom left", zIndex: 11, userSelect: "none" }}
          >
            {sleeping ? "🤚" : rightArm}
          </motion.span>
        </AnimatePresence>

        {/* Zzz particles — sleeping */}
        {sleeping && (
          <>
            {[
              { fs: "0.55rem", dx: -5,  dy: -2,  delay: 0    },
              { fs: "0.72rem", dx: 4,   dy: -14, delay: 0.72 },
              { fs: "0.90rem", dx: 12,  dy: -28, delay: 1.44 },
            ].map((z, i) => (
              <motion.span key={`z-${i}`}
                style={{ position: "absolute", right: -12, top: "8%",
                         color: "rgba(148,163,184,0.85)", zIndex: 20,
                         fontFamily: "'Quicksand',sans-serif", fontWeight: 700,
                         fontSize: z.fs, pointerEvents: "none" }}
                animate={{ y: [z.dy, z.dy - 16, z.dy - 32], x: [z.dx, z.dx + 5, z.dx + 9],
                           opacity: [0, 0.9, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, delay: z.delay, ease: "easeOut" }}
              >z</motion.span>
            ))}
          </>
        )}
      </motion.div>
    </div>
  );
}

// ─── Copy Action Row ──────────────────────────────────────────────────────────
// High-contrast action card row with animated copy-to-clipboard button
function CopyActionRow({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) return;
    haptic("medium"); playTap();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Copied! ☕", description: value });
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast({ title: "Couldn't copy", description: "Copy it manually 🤷" });
    }
  }

  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        fontSize: "0.62rem", color: "rgba(147,197,253,0.60)",
        fontWeight: 600, letterSpacing: "0.07em",
        textTransform: "uppercase", marginBottom: 5,
      }}>
        {label}
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(255,255,255,0.13)",
        border: "1px solid rgba(255,255,255,0.22)",
        borderRadius: 12, padding: "10px 14px",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        boxShadow: "inset 0 1.5px 0 rgba(255,255,255,0.28), 0 4px 12px rgba(0,0,0,0.22)",
      }}>
        <span style={{
          flex: 1, fontSize: "0.90rem",
          color: value ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.28)",
          fontFamily: "'Quicksand', sans-serif",
          fontStyle: value ? "normal" : "italic",
          fontWeight: value ? 600 : 400,
          lineHeight: 1.4,
        }}>
          {value || "Not set yet…"}
        </span>
        {value && (
          <motion.button
            whileTap={{ scale: 0.80 }}
            onClick={handleCopy}
            style={{
              background:   copied ? "rgba(72,187,120,0.28)" : "rgba(255,255,255,0.10)",
              border:       `1px solid ${copied ? "rgba(72,187,120,0.55)" : "rgba(255,255,255,0.20)"}`,
              borderRadius: 9,
              width: 34, height: 34, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              transition: "background 0.22s, border-color 0.22s",
            }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={copied ? "check" : "copy"}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.14 }}
                style={{ fontSize: "0.95rem", lineHeight: 1 }}
              >
                {copied ? "✓" : "📋"}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        )}
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({
  detail,
  onClose,
  onSave,
  isKyleUser,
  kyleSpicyStats,
}: {
  detail: ProfileDetail;
  onClose: () => void;
  onSave: (updated: ProfileDetail) => Promise<void>;
  isKyleUser: boolean;
  kyleSpicyStats: SpicyStats | null;
}) {
  const [form, setForm] = useState<ProfileDetail>({ ...detail, spicy_stats: detail.spicy_stats ?? { ...EMPTY_SPICY } });
  const [saving, setSaving] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("🌶️");
  const [addingCat, setAddingCat]   = useState(false);

  // Custom categories come from Kyle's spicy_stats (always the source of truth)
  const customCategories: SpicyCategory[] = (
    isKyleUser
      ? (form.spicy_stats?.custom_categories ?? [])
      : (kyleSpicyStats?.custom_categories ?? [])
  ) as SpicyCategory[];

  function setField<K extends keyof ProfileDetail>(key: K, val: ProfileDetail[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }
  function setSpicy(key: string, val: string) {
    setForm(f => ({ ...f, spicy_stats: { ...(f.spicy_stats ?? EMPTY_SPICY), [key]: val } }));
  }

  function addCustomCategory() {
    if (!newCatLabel.trim()) return;
    const key = `custom_${Date.now()}`;
    const cat: SpicyCategory = { key, label: newCatLabel.trim(), emoji: newCatEmoji };
    const prev = (form.spicy_stats?.custom_categories ?? []) as SpicyCategory[];
    setForm(f => ({
      ...f,
      spicy_stats: { ...(f.spicy_stats ?? EMPTY_SPICY), custom_categories: [...prev, cat] },
    }));
    setNewCatLabel("");
    setNewCatEmoji("🌶️");
    setAddingCat(false);
  }

  function removeCustomCategory(key: string) {
    const prev = (form.spicy_stats?.custom_categories ?? []) as SpicyCategory[];
    setForm(f => ({
      ...f,
      spicy_stats: { ...(f.spicy_stats ?? EMPTY_SPICY), custom_categories: prev.filter(c => c.key !== key) },
    }));
  }

  async function handleSave() {
    setSaving(true);
    try { await onSave(form); onClose(); }
    finally { setSaving(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 12,
    color: "white",
    fontSize: "0.88rem",
    padding: "10px 12px",
    fontFamily: "'Quicksand', sans-serif",
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-no-ptr
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.70)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "flex-end",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        touchAction: "none",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{
          width: "100%",
          maxHeight: "90svh",
          overflowY: "auto",
          // Prevent iOS scroll chaining — keep scroll contained inside the sheet
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
          // Restore pan-y so the sheet itself can scroll even though parent has touch-action:none
          touchAction: "pan-y",
          borderRadius: "28px 28px 0 0",
          background: "#0a0a14",
          border: "1px solid rgba(255,255,255,0.12)",
          borderBottom: "none",
          padding: "24px 20px 140px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.15rem", fontWeight: 700, color: "white" }}>
            Edit Your Profile
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.50)", fontSize: "1.4rem", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Vibe */}
          <div style={{ ...GLASS_CARD, padding: "14px 16px" }}>
            <p style={{ fontSize: "0.72rem", color: "rgba(147,197,253,0.70)", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>✨ The Vibe</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={form.vibe_emoji}
                onChange={e => setField("vibe_emoji", e.target.value)}
                style={{ ...inputStyle, width: 56, textAlign: "center", fontSize: "1.2rem" }}
                maxLength={2}
                placeholder="😊"
              />
              <input
                value={form.vibe_text}
                onChange={e => setField("vibe_text", e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="How are you feeling today?"
              />
            </div>
          </div>

          {/* Love Language */}
          <div style={{ ...GLASS_CARD, padding: "14px 16px" }}>
            <p style={{ fontSize: "0.72rem", color: "rgba(147,197,253,0.70)", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>💝 Love Language</p>
            <input
              value={form.love_language}
              onChange={e => setField("love_language", e.target.value)}
              style={inputStyle}
              placeholder="e.g. Words of affirmation + Quality time"
            />
          </div>

          {/* Cheat Sheet */}
          <div style={{ ...GLASS_CARD, padding: "14px 16px" }}>
            <p style={{ fontSize: "0.72rem", color: "rgba(147,197,253,0.70)", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>☕ The Cheat Sheet</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                value={form.coffee_order}
                onChange={e => setField("coffee_order", e.target.value)}
                style={inputStyle}
                placeholder="Coffee order"
              />
              <input
                value={form.shoe_size}
                onChange={e => setField("shoe_size", e.target.value)}
                style={inputStyle}
                placeholder="Shoe size"
              />
            </div>
          </div>

          {/* Bucket list */}
          <div style={{ ...GLASS_CARD, padding: "14px 16px" }}>
            <p style={{ fontSize: "0.72rem", color: "rgba(147,197,253,0.70)", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>🌍 Bucket List</p>
            <textarea
              value={form.bucket_list}
              onChange={e => setField("bucket_list", e.target.value)}
              style={{ ...inputStyle, minHeight: 80 }}
              placeholder="Top things you want to do together…"
            />
          </div>

          {/* Spicy Stats */}
          <div style={{ ...SPICY_CARD, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <p style={{ fontSize: "0.72rem", color: "rgba(255,120,120,0.85)", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", margin: 0 }}>🔥 Spicy Stats</p>
              {/* Kyle-only: Add Category button */}
              {isKyleUser && !addingCat && (
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setAddingCat(true)}
                  style={{ background: "rgba(197,48,48,0.22)", border: "1px solid rgba(197,48,48,0.50)", borderRadius: 8, color: "rgba(255,150,150,0.90)", fontSize: "0.68rem", fontWeight: 700, padding: "3px 9px", cursor: "pointer", letterSpacing: "0.04em" }}
                >
                  + Category
                </motion.button>
              )}
            </div>

            {/* Add new category form (Kyle only) */}
            <AnimatePresence>
              {addingCat && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ background: "rgba(197,48,48,0.10)", border: "1px solid rgba(197,48,48,0.35)", borderRadius: 12, padding: "10px 12px" }}>
                    <p style={{ fontSize: "0.68rem", color: "rgba(255,150,150,0.70)", marginBottom: 6, fontWeight: 600 }}>New Category</p>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={newCatEmoji} onChange={e => setNewCatEmoji(e.target.value)} style={{ ...inputStyle, width: 46, textAlign: "center", fontSize: "1.1rem" }} maxLength={2} />
                      <input value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="Category name (e.g. Toys)" />
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <motion.button whileTap={{ scale: 0.92 }} onClick={addCustomCategory} disabled={!newCatLabel.trim()} style={{ flex: 1, background: "rgba(197,48,48,0.45)", border: "none", borderRadius: 8, color: "white", fontSize: "0.78rem", fontWeight: 700, padding: "7px 0", cursor: "pointer", opacity: newCatLabel.trim() ? 1 : 0.5 }}>Add</motion.button>
                      <motion.button whileTap={{ scale: 0.92 }} onClick={() => setAddingCat(false)} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, color: "rgba(255,255,255,0.45)", fontSize: "0.78rem", padding: "7px 12px", cursor: "pointer" }}>Cancel</motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <p style={{ fontSize: "0.70rem", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>Position</p>
                <input value={form.spicy_stats?.position ?? ""} onChange={e => setSpicy("position", e.target.value)} style={inputStyle} placeholder="Top / Bottom / Versatile" />
              </div>
              <div>
                <p style={{ fontSize: "0.70rem", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>Kinks & Fantasies</p>
                <textarea value={form.spicy_stats?.kinks ?? ""} onChange={e => setSpicy("kinks", e.target.value)} style={{ ...inputStyle, minHeight: 72 }} placeholder="Don't hold back…" />
              </div>
              <div>
                <p style={{ fontSize: "0.70rem", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>Threesome Preferences</p>
                <textarea value={form.spicy_stats?.threesome_prefs ?? ""} onChange={e => setSpicy("threesome_prefs", e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="Rules, types, scenarios…" />
              </div>
              <div>
                <p style={{ fontSize: "0.70rem", color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>Turn-ons</p>
                <textarea value={form.spicy_stats?.turn_ons ?? ""} onChange={e => setSpicy("turn_ons", e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="What gets you going…" />
              </div>
              {/* Dynamic custom categories */}
              {customCategories.map(cat => (
                <div key={cat.key}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <p style={{ fontSize: "0.70rem", color: "rgba(255,200,150,0.70)", margin: 0 }}>{cat.emoji} {cat.label}</p>
                    {isKyleUser && (
                      <button onClick={() => removeCustomCategory(cat.key)} style={{ background: "none", border: "none", color: "rgba(197,48,48,0.60)", fontSize: "0.75rem", cursor: "pointer", padding: "0 4px" }}>✕</button>
                    )}
                  </div>
                  <textarea
                    value={(form.spicy_stats?.[cat.key] as string) ?? ""}
                    onChange={e => setSpicy(cat.key, e.target.value)}
                    style={{ ...inputStyle, minHeight: 56 }}
                    placeholder={`Your thoughts on ${cat.label.toLowerCase()}…`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 20,
            width: "100%",
            padding: "16px",
            borderRadius: 18,
            background: "linear-gradient(135deg, #C53030 0%, #7B1313 100%)",
            border: "none",
            color: "white",
            fontFamily: "'Playfair Display', serif",
            fontSize: "1rem",
            fontWeight: 700,
            cursor: "pointer",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save Profile"}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ─── Profile Card ─────────────────────────────────────────────────────────────
function ProfileCard({
  name,
  detail,
  isOwn,
  isKyleUser,
  kyleSpicyStats,
  vibeId,
  onEdit,
}: {
  name: string;
  detail: ProfileDetail;
  isOwn: boolean;
  isKyleUser: boolean;
  kyleSpicyStats: SpicyStats | null;
  vibeId: string | null;
  onEdit: () => void;
}) {
  const spicy = detail.spicy_stats;
  const customCategories = (kyleSpicyStats?.custom_categories ?? []) as SpicyCategory[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "0 4px 24px" }}>

      {/* Name badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
        <span style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "1.35rem",
          fontWeight: 700,
          color: "white",
        }}>
          {name}
        </span>
        {/* ✏️ visible to the card owner (own card) or Kyle (can edit both) */}
        {(isOwn || isKyleUser) && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => { haptic("light"); playModalOpen(); onEdit(); }}
            style={{
              ...GLASS_CARD,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              width: 36,
              height: 36,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1rem",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            ✏️
          </motion.button>
        )}
      </div>

      {/* 3D Avatar — driven by current vibe state */}
      <SectionCard title="The Vibe" emoji="✨" glowColor="rgba(212,160,23,0.28)">
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 4, paddingBottom: 4 }}>
          <Avatar3D
            url={name.toLowerCase() === "kyle" ? "/kyle-avatar.glb" : "/nathan-avatar.glb"}
            vibeId={vibeId}
            name={name}
            height={220}
            align={name.toLowerCase() === "kyle" ? "left" : "right"}
          />
        </div>
        {detail.vibe_text ? (
          <p style={{
            textAlign: "center",
            fontFamily: "'Caveat', cursive",
            fontSize: "1rem",
            color: "rgba(255,255,255,0.65)",
            marginTop: 6,
            fontStyle: "italic",
          }}>
            "{detail.vibe_text}"
          </p>
        ) : null}
      </SectionCard>

      {/* Love Language — rose accent */}
      <SectionCard title="Love Language" emoji="💝" glowColor="rgba(236,72,153,0.22)">
        <FieldRow label="Primary Love Languages" value={detail.love_language} />
      </SectionCard>

      {/* Cheat Sheet — sky blue accent; coffee order is a copy-action card */}
      <SectionCard title="The Cheat Sheet" emoji="☕" glowColor="rgba(99,179,237,0.20)">
        <CopyActionRow label="Coffee Order" value={detail.coffee_order} />
        <FieldRow label="Shoe Size" value={detail.shoe_size} />
      </SectionCard>

      {/* Bucket List — sage green accent */}
      <SectionCard title="Bucket List" emoji="🌍" glowColor="rgba(72,187,120,0.20)">
        <FieldRow label="Things We Want to Do" value={detail.bucket_list} />
      </SectionCard>

      {/* Gold divider — marks the transition from "Stats" to "Intimacy" */}
      <GoldDivider label="INTIMACY" />

      {/* Spicy Stats — purple/magenta glow via SPICY_CARD */}
      <SectionCard title="Spicy Stats" emoji="🔥" spicy>
        {spicy ? (
          <>
            <FieldRow label="Position" value={spicy.position} />
            <FieldRow label="Kinks & Fantasies" value={spicy.kinks} />
            <FieldRow label="Threesome Preferences" value={spicy.threesome_prefs} />
            <FieldRow label="Turn-ons" value={spicy.turn_ons} />
            {customCategories.map(cat => (
              <FieldRow
                key={cat.key}
                label={`${cat.emoji} ${cat.label}`}
                value={(spicy[cat.key] as string) ?? ""}
              />
            ))}
          </>
        ) : (
          <div style={{ color: "rgba(255,255,255,0.28)", fontStyle: "italic", fontSize: "0.85rem" }}>
            {isOwn ? "Tap ✏️ to fill in the spicy stuff…" : "Locked — they haven't filled this in yet."}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { profile, partnerProfile, tether } = useAuth();
  const { toast } = useToast();

  const [myDetail,      setMyDetail]      = useState<ProfileDetail | null>(null);
  const [partnerDetail, setPartnerDetail] = useState<ProfileDetail | null>(null);
  const [activeCard,    setActiveCard]    = useState<"me" | "partner">("me");
  const [editingFor,    setEditingFor]    = useState<"me" | "partner" | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [sexBox,        setSexBox]        = useState<SexBoxEntry[]>([]);
  const [sexBoxOpen,    setSexBoxOpen]    = useState(false);
  const [sexBoxRevealed, setSexBoxRevealed] = useState(false);
  // Re-lock the Sex Box each time it is closed
  useEffect(() => { if (!sexBoxOpen) setSexBoxRevealed(false); }, [sexBoxOpen]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const swipeStartX  = useRef<number | null>(null);

  const myName      = profile?.full_name ?? "You";
  const partnerName = partnerProfile?.full_name ?? "Partner";
  const isKyleUser  = isKyle(myName);

  // Architect (edit) mode — Kyle only
  const { isEditMode, toggleEditMode } = useEditMode();

  // Kyle's spicy_stats are always the source of truth for custom categories
  const kyleDetail   = isKyleUser ? myDetail : partnerDetail;
  const kyleSpicyStats = kyleDetail?.spicy_stats ?? null;

  // ── Load details ────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!profile) return;
    const ids = [profile.id, partnerProfile?.id].filter(Boolean) as string[];

    const { data, error } = await supabase
      .from("profile_details")
      .select("*")
      .in("user_id", ids);

    if (error) {
      console.error("profile_details load error", error);
      setMyDetail(EMPTY_DETAIL(profile.id));
      if (partnerProfile) setPartnerDetail(EMPTY_DETAIL(partnerProfile.id));
    } else {
      const rows = data ?? [];
      const me = rows.find(r => r.user_id === profile.id);
      const them = rows.find(r => r.user_id === partnerProfile?.id);
      setMyDetail(me ?? EMPTY_DETAIL(profile.id));
      if (partnerProfile) setPartnerDetail(them ?? EMPTY_DETAIL(partnerProfile.id));
    }

    // Load Sex Box archive (both can view)
    if (tether) {
      const archive = await getSexBoxArchive(tether.id);
      setSexBox(archive);
    }
  }, [profile, partnerProfile, tether]);

  useEffect(() => { load(); }, [load]);

  // ── Avatar upload ──────────────────��─────────────────────────────
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${profile.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      await supabase.from("profile_details").upsert(
        { user_id: profile.id, avatar_uri: publicUrl },
        { onConflict: "user_id" },
      );
      setMyDetail(d => d ? { ...d, avatar_uri: publicUrl } : d);
      toast({ title: "Avatar updated! 📸" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ── Save profile detail (Kyle can save either profile) ──────────
  async function handleSave(updated: ProfileDetail) {
    const { error } = await supabase.from("profile_details").upsert(
      updated,
      { onConflict: "user_id" },
    );
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      throw error;
    }
    if (updated.user_id === profile?.id) {
      setMyDetail(updated);
    } else {
      setPartnerDetail(updated);
    }
    haptic("success"); playSave();
    toast({ title: "Profile saved 💾" });
  }

  // ── Swipe gesture (horizontal card switch) ──────────────────────
  const swipeStartY = useRef<number | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    if (editingFor) return;
    swipeStartX.current = e.touches[0].clientX;
    swipeStartY.current = e.touches[0].clientY;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (swipeStartX.current === null || swipeStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    const dy = e.changedTouches[0].clientY - swipeStartY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx > 60 && absDx > absDy * 2) {
      haptic("soft");
      setActiveCard(dx < 0 ? "partner" : "me");
    }
    swipeStartX.current = null;
    swipeStartY.current = null;
  }

  // ── Realtime vibe state for the 3D avatars ──────────────────────
  const [myVibeId,      setMyVibeId]      = useState<string | null>(profile?.current_vibe ?? null);
  const [partnerVibeId, setPartnerVibeId] = useState<string | null>(partnerProfile?.current_vibe ?? null);

  useEffect(() => { setMyVibeId(profile?.current_vibe ?? null); },           [profile?.current_vibe]);
  useEffect(() => { setPartnerVibeId(partnerProfile?.current_vibe ?? null); }, [partnerProfile?.current_vibe]);

  useEffect(() => {
    if (!profile || !partnerProfile) return;
    const ids = [profile.id, partnerProfile.id];
    const ch = supabase
      .channel("profile-vibe-watch")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const row = payload.new as { id: string; current_vibe?: string | null };
        if (!ids.includes(row.id)) return;
        if (row.id === profile.id)        setMyVibeId(row.current_vibe ?? null);
        if (row.id === partnerProfile.id) setPartnerVibeId(row.current_vibe ?? null);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, partnerProfile?.id]);

  const displayDetail  = activeCard === "me" ? myDetail : partnerDetail;
  const displayName    = activeCard === "me" ? myName : partnerName;
  const displayVibeId  = activeCard === "me" ? myVibeId : partnerVibeId;
  const isOwn          = activeCard === "me";
  const editingDetail  = editingFor === "me" ? myDetail : partnerDetail;

  const myAvatar      = myDetail?.avatar_uri ?? null;
  const partnerAvatar = partnerDetail?.avatar_uri ?? null;

  return (
    <>
    <PullToRefresh onRefresh={load}>
      <div
        style={{
          background: "#000000",
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 120px)",
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { swipeStartX.current = null; swipeStartY.current = null; }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleAvatarChange}
        />

        {/* ── Kyle-only Architect Mode Gear ── */}
        {isKyleUser && (
          <motion.button
            whileTap={{ scale: 0.85, rotate: 45 }}
            onClick={() => { haptic("medium"); playTap(); toggleEditMode(profile!); }}
            style={{
              position:       "absolute",
              top:            "max(14px, calc(env(safe-area-inset-top, 14px) + 2px))",
              right:          16,
              zIndex:         50,
              width:          36,
              height:         36,
              borderRadius:   "50%",
              background:     isEditMode
                ? "linear-gradient(135deg, rgba(197,48,48,0.55) 0%, rgba(100,10,10,0.75) 100%)"
                : "rgba(255,255,255,0.10)",
              border:         isEditMode
                ? "1px solid rgba(255,100,100,0.50)"
                : "1px solid rgba(255,255,255,0.22)",
              boxShadow:      isEditMode
                ? "0 0 20px 5px rgba(197,48,48,0.35), 0 4px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,200,200,0.20)"
                : "0 0 16px 2px rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              cursor:         "pointer",
              backdropFilter: "blur(28px) saturate(180%)",
              WebkitBackdropFilter: "blur(28px) saturate(180%)",
              transition:     "background 0.25s, box-shadow 0.25s, border 0.25s",
            }}
            aria-label="Architect mode"
          >
            <motion.span
              animate={{ rotate: isEditMode ? 360 : 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              style={{ fontSize: "1rem", lineHeight: 1, display: "block" }}
            >
              ⚙
            </motion.span>
          </motion.button>
        )}

        {/* ── Top Avatar Duo ── */}
        <div style={{
          paddingTop: "max(24px, env(safe-area-inset-top, 24px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingBottom: 8,
        }}>
          {/* Overlapping circles */}
          <div style={{ position: "relative", height: 110, width: 200, marginBottom: 12 }}>
            {/* Kyle (left) */}
            <div style={{ position: "absolute", left: 0, top: 0 }}>
              <AvatarCircle
                name={myName.toLowerCase() === "kyle" ? myName : partnerName}
                avatarUri={myName.toLowerCase() === "kyle" ? myAvatar : partnerAvatar}
                isOwn={myName.toLowerCase() === "kyle"}
                onUpload={() => fileInputRef.current?.click()}
              />
            </div>
            {/* Nathan (right, slightly overlapping) */}
            <div style={{ position: "absolute", left: 96, top: 6 }}>
              <AvatarCircle
                name={myName.toLowerCase() === "nathan" ? myName : partnerName}
                avatarUri={myName.toLowerCase() === "nathan" ? myAvatar : partnerAvatar}
                isOwn={myName.toLowerCase() === "nathan"}
                onUpload={() => fileInputRef.current?.click()}
              />
            </div>
          </div>

          {/* Title */}
          <div style={{ textAlign: "center", marginBottom: 4 }}>
            <h1 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "white",
              margin: 0,
            }}>
              Profile Hub
            </h1>
            <p style={{
              fontFamily: "'Dancing Script', cursive",
              fontSize: "0.95rem",
              color: "rgba(147,197,253,0.65)",
              margin: "2px 0 0",
            }}>
              Kyle &amp; Nathan<SensorSyncIcon size={12} />
            </p>
          </div>

          {/* Upload indicator */}
          {uploadingAvatar && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ fontSize: "0.78rem", color: "rgba(147,197,253,0.70)", marginTop: 4 }}
            >
              Uploading photo…
            </motion.div>
          )}
        </div>

        {/* ── Card switcher tabs — sliding frosted glass pill ── */}
        <LayoutGroup id="profile-tab">
          <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "0 20px 16px" }}>
            {(["me", "partner"] as const).map((side) => {
              const label  = side === "me" ? myName : partnerName;
              const active = activeCard === side;
              return (
                <motion.button
                  key={side}
                  onClick={() => { haptic("soft"); playTap(); setActiveCard(side); }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    flex:         1,
                    padding:      "10px 0",
                    borderRadius: 16,
                    border:       active ? "1.5px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.08)",
                    background:   "transparent",
                    color:        active ? "white" : "rgba(255,255,255,0.38)",
                    fontFamily:   "'Playfair Display', serif",
                    fontSize:     "0.92rem",
                    fontWeight:   700,
                    cursor:       "pointer",
                    position:     "relative",
                    transition:   "color 0.22s, border-color 0.22s",
                  }}
                >
                  {/* Shared sliding pill — Framer Motion animates it between buttons */}
                  {active && (
                    <motion.div
                      layoutId="profile-tab-pill"
                      style={{
                        position:       "absolute",
                        inset:          0,
                        borderRadius:   15,
                        background:     "linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.06) 100%)",
                        backdropFilter: "blur(24px) saturate(180%)",
                        WebkitBackdropFilter: "blur(24px) saturate(180%)",
                        boxShadow:      "inset 0 1.5px 0 rgba(255,255,255,0.35), 0 4px 16px rgba(0,0,0,0.22)",
                      }}
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    />
                  )}
                  <span style={{ position: "relative", zIndex: 1 }}>{label}</span>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>

        {/* ── Profile Card Content ── */}
        <div style={{ padding: "0 16px" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCard}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.50, ease: [0.23, 1, 0.32, 1] }}
            >
              {displayDetail ? (
                <ProfileCard
                  name={displayName}
                  detail={displayDetail}
                  isOwn={isOwn}
                  isKyleUser={isKyleUser}
                  kyleSpicyStats={kyleSpicyStats}
                  vibeId={displayVibeId}
                  onEdit={() => setEditingFor(activeCard)}
                />
              ) : (
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.35)", paddingTop: 40 }}>
                  Loading…
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Swipe hint ── */}
        <div style={{ textAlign: "center", paddingBottom: 8 }}>
          <span style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.22)", letterSpacing: "0.06em" }}>
            SWIPE TO SWITCH
          </span>
        </div>

        {/* ── Sex Box Archive ── */}
        <div style={{ padding: "4px 16px 32px" }}>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { haptic("light"); sexBoxOpen ? playModalClose() : playModalOpen(); setSexBoxOpen(o => !o); }}
            style={{
              width: "100%",
              padding: "14px 18px",
              borderRadius: 20,
              background: "linear-gradient(135deg, rgba(120,0,0,0.35) 0%, rgba(10,0,0,0.75) 100%)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1.5px solid rgba(197,48,48,0.45)",
              boxShadow: "0 0 28px 4px rgba(197,48,48,0.15), 0 8px 24px rgba(0,0,0,0.50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.3rem" }}>📦</span>
              <div style={{ textAlign: "left" }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, color: "white", margin: 0 }}>The Sex Box</p>
                <p style={{ fontSize: "0.70rem", color: "rgba(255,140,140,0.60)", margin: "2px 0 0", letterSpacing: "0.04em" }}>
                  {sexBox.length > 0 ? `${sexBox.length} archived question${sexBox.length > 1 ? "s" : ""}` : "Questions archive here after 24h"}
                </p>
              </div>
            </div>
            <motion.span
              animate={{ rotate: sexBoxOpen ? 180 : 0 }}
              transition={{ duration: 0.25 }}
              style={{ color: "rgba(197,48,48,0.70)", fontSize: "1.1rem", lineHeight: 1 }}
            >
              ▾
            </motion.span>
          </motion.button>

          <AnimatePresence>
            {sexBoxOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.30, ease: [0.25, 0.46, 0.45, 0.94] }}
                style={{ overflow: "hidden" }}
              >
                <div style={{ paddingTop: 10, display: "flex", flexDirection: "column", gap: 12, position: "relative" }}>

                  {/* ── FaceID-style privacy overlay ── */}
                  <AnimatePresence>
                    {!sexBoxRevealed && (
                      <motion.div
                        key="sexbox-privacy-veil"
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        onClick={() => { haptic("light"); playTap(); setSexBoxRevealed(true); }}
                        style={{
                          position: "absolute",
                          inset: 0,
                          zIndex: 10,
                          borderRadius: 16,
                          backdropFilter: "blur(20px) saturate(120%)",
                          WebkitBackdropFilter: "blur(20px) saturate(120%)",
                          background: "rgba(8,4,4,0.40)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          cursor: "pointer",
                          minHeight: 80,
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

                  {sexBox.length === 0 ? (
                    <div style={{
                      textAlign: "center",
                      color: "rgba(255,255,255,0.28)",
                      fontStyle: "italic",
                      fontSize: "0.85rem",
                      paddingTop: 12,
                    }}>
                      No archived questions yet. Naughty questions appear here after 24 hours. 😈
                    </div>
                  ) : (
                    sexBox.map(entry => (
                      <div key={entry.question.id} style={{
                        background: "rgba(60,0,0,0.45)",
                        border: "1px solid rgba(197,48,48,0.30)",
                        borderRadius: 16,
                        padding: "13px 15px",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.40)",
                      }}>
                        <p style={{ fontFamily: "'Caveat', cursive", fontSize: "1.10rem", color: "white", margin: "0 0 8px", lineHeight: 1.35 }}>
                          "{entry.question.question_text}"
                        </p>
                        <p style={{ fontSize: "0.62rem", color: "rgba(255,140,140,0.45)", marginBottom: 10, letterSpacing: "0.04em" }}>
                          {new Date(entry.question.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                        {entry.answers.length === 0 ? (
                          <p style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>No answers submitted.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {entry.answers.map(a => {
                              const isMe = a.user_id === profile?.id;
                              const name = isMe ? myName : partnerName;
                              return (
                                <div key={a.id} style={{
                                  background: isMe ? "rgba(197,48,48,0.12)" : "rgba(255,255,255,0.05)",
                                  border: `1px solid ${isMe ? "rgba(197,48,48,0.28)" : "rgba(255,255,255,0.08)"}`,
                                  borderRadius: 10,
                                  padding: "8px 11px",
                                }}>
                                  <p style={{ fontSize: "0.65rem", color: "rgba(255,180,180,0.55)", marginBottom: 2, fontWeight: 600 }}>{name}</p>
                                  <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.82)", margin: 0, fontFamily: "'Quicksand', sans-serif" }}>{a.answer_text}</p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Force Re-register Notifications ── */}
        {profile && tether && (
          <div style={{ padding: "12px 16px 0" }}>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={async () => {
                haptic("light"); playTap();
                try {
                  // Step 1: request permission synchronously from this tap handler.
                  // iOS 16.4+ requires requestPermission() to be called directly
                  // inside a user-gesture — doing it from useEffect or setTimeout
                  // causes the prompt to be silently blocked.
                  const granted = await requestNotificationPermission();

                  if (!granted) {
                    if (Notification.permission === "denied") {
                      toast({ title: "Blocked by browser", description: "Go to Settings → Notifications → find Tether and enable notifications.", variant: "destructive" });
                    } else {
                      toast({ title: "Permission dismissed", description: "Tap the button again and choose Allow when prompted." });
                    }
                    return;
                  }

                  // Step 2: register the SW (or get the existing one).
                  const reg = await registerServiceWorker();
                  if (!reg) {
                    toast({ title: "Not supported", description: "This browser doesn't support notifications.", variant: "destructive" });
                    return;
                  }

                  // Step 3: subscribe / re-subscribe and send to server.
                  await setupPushNotifications(reg, profile.id, tether.id);
                  haptic("success"); playSave();
                  toast({ title: "Notifications enabled", description: "You'll receive push notifications from Tether." });
                } catch {
                  toast({ title: "Something went wrong", variant: "destructive" });
                }
              }}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: 16,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <span style={{ fontSize: "1rem" }}>🔔</span>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "rgba(255,255,255,0.50)", fontFamily: "'Quicksand', sans-serif", letterSpacing: "0.03em" }}>
                Re-enable Notifications
              </span>
            </motion.button>
          </div>
        )}

      </div>

    </PullToRefresh>

    {/* ── Edit Modal — rendered OUTSIDE PullToRefresh so PTR's native
         touch listeners never intercept modal scrolling ── */}
    <AnimatePresence>
      {editingFor && editingDetail && (
        <EditModal
          detail={editingDetail}
          onClose={() => { playModalClose(); setEditingFor(null); }}
          onSave={handleSave}
          isKyleUser={isKyleUser}
          kyleSpicyStats={kyleSpicyStats}
        />
      )}
    </AnimatePresence>
    </>
  );
}
