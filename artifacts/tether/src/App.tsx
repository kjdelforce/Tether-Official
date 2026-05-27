import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence, LayoutGroup, useMotionValue, animate } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { haptic } from "@/lib/haptics";
import { playSound, warmAudio } from "@/lib/audioManager";
import LoginPage from "@/pages/LoginPage";
import HomePage from "@/pages/HomePage";
import ScrapbookPage from "@/pages/ScrapbookPage";
import DatePlannerPage from "@/pages/DatePlannerPage";
import CapsulesPage from "@/pages/CapsulesPage";
import GamesHubPage from "@/pages/GamesHubPage";
import ProfilePage from "@/pages/ProfilePage";
import confetti from "canvas-confetti";
import { registerServiceWorker, setupPushNotifications } from "@/lib/notifications";
import { supabase } from "@/lib/supabaseClient";
import { TetherAura } from "@/components/TetherAura";
import { SensorSyncIcon } from "@/components/SensorSyncIcon";
import { VIBES } from "@/components/VibeCheckSection";
import { EditModeProvider } from "@/lib/EditModeContext";
import { EditModeFooter } from "@/components/EditModeFooter";
import { useViewportFix } from "@/hooks/useViewportFix";
import { useLgParallax } from "@/hooks/useLgParallax";

type Tab = "home" | "scrapbook" | "dates" | "games" | "capsules" | "profile";

// Left-to-right order of tabs — used to derive slide direction on navigation
const TAB_ORDER: Record<Tab, number> = {
  home: 0, scrapbook: 1, dates: 2, games: 3, capsules: 4, profile: 5,
};

// ── Page transition variants — Liquid Morph ─────────────────────────
// Each new page "settles" into the screen glass: it scales 0.98 → 1.0
// while opacity fades in.  Exiting page mirrors the motion.  No
// directional sliding — the UI feels like it's resolving in-place
// rather than swapping.  `dir` retained for backward compat / future use.
const PAGE_VARIANTS = {
  enter: (_dir: number) => ({
    opacity: 0,
    scale:   0.98,
    filter:  "blur(6px)",
  }),
  center: {
    opacity: 1,
    scale:   1,
    filter:  "blur(0px)",
  },
  exit: (_dir: number) => ({
    opacity: 0,
    scale:   0.98,
    filter:  "blur(4px)",
  }),
};

const PAGE_TRANSITION = {
  opacity: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  scale:   { duration: 0.42, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  filter:  { duration: 0.30 },
};

// ── Shared date constants ───────────────────────────────────────────
const ANNIVERSARY = new Date("2025-04-07");

function daysTogether(since: Date): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const s   = new Date(since); s.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

const BIRTHDAYS: Record<string, { month: number; day: number }> = {
  nathan: { month: 3, day: 16 },
  kyle:   { month: 1, day: 7  },
};
const CONFETTI_KEY_PREFIX = "tether_birthday_confetti_";

function triggerBirthdayConfetti() {
  const duration = 4500;
  const end = Date.now() + duration;
  const colors = ["#C53030", "#ffffff", "#ffd700", "#ff69b4", "#7B1313"];
  (function frame() {
    confetti({ particleCount: 7, angle: 60, spread: 58, origin: { x: 0 }, colors });
    confetti({ particleCount: 7, angle: 120, spread: 58, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

// ── Trivia sparkle-star icon ───────────────────────────────────────
function SparkleStar({ size = 22, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2l2.09 6.26L20 9.27l-4.95 4.82L16.18 21 12 17.77 7.82 21l1.13-6.91L4 9.27l5.91-1.01L12 2z"
        fill={color}
        fillOpacity="0.9"
      />
      <circle cx="12" cy="12" r="2.5" fill={color} fillOpacity="0.35" />
      <line x1="12" y1="1" x2="12" y2="3.5"  stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="20.5" x2="12" y2="23" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="1"  y1="12"  x2="3.5" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20.5" y1="12" x2="23" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Profile Mirror nav icon ────────────────────────────────────────
function ProfileMirrorIcon({ active }: { active: boolean }) {
  const color = active ? "#ffffff" : "rgba(147,197,253,0.55)";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="6.5" r="3.5" stroke={color} strokeWidth="1.4" fill="none" />
      <path d="M3 17.5c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ── Capsule Orb nav icon ───────────────────────────────────────────
function CapsuleOrb({ active }: { active: boolean }) {
  const color = active ? "#ffffff" : "rgba(147,197,253,0.55)";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="10" cy="10" rx="7" ry="7" stroke={color} strokeWidth="1.4" fill="none" />
      <ellipse cx="10" cy="10" rx="3.5" ry="3.5" fill={color} fillOpacity={active ? 0.9 : 0.5} />
      <line x1="10" y1="3" x2="10" y2="17" stroke={color} strokeWidth="1" strokeOpacity="0.35" />
      <line x1="3" y1="10" x2="17" y2="10" stroke={color} strokeWidth="1" strokeOpacity="0.35" />
    </svg>
  );
}

// ── Liquid Glass Nav Tab ───────────────────────────────────────────
// renderIcon receives `active` so callers can tint custom SVG icons.
// The active glass bubble lives separately (DraggableNavBubble) and
// is positioned absolutely over the entire nav bar — not per-tab.
interface NavTabProps {
  icon?: string;
  renderIcon?: (active: boolean) => React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function NavTab({ icon, renderIcon, label, active, onClick }: NavTabProps) {
  // Inactive icon colour bumped from 0.55 → 0.80 alpha so glyphs stay
  // legible against the heavy backdrop blur.  Active stays pure white.
  const iconColor = active ? "#ffffff" : "rgba(199,219,253,0.80)";

  return (
    <motion.button
      onClick={() => {
        haptic("soft");
        onClick();
      }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      /* Per spec: 150–200 ms ease-out, no bounce.  Tween (not spring)
       * keeps the hover lift quiet and predictable. */
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
               paddingTop: 6, paddingBottom: 6, gap: 2, position: "relative",
               background: "none", border: "none", cursor: "pointer" }}
    >
      {/* ── Icon — each tab has its own frosted glass circle ── */}
      <motion.span
        animate={{ scale: active ? 1.10 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        style={{
          lineHeight:           1,
          display:              "flex",
          alignItems:           "center",
          justifyContent:       "center",
          width:                38,
          height:               38,
          borderRadius:         "50%",
          position:             "relative",
          zIndex:               1,
          color:                iconColor,
          /* Frosted glass circle — visible only on inactive tabs;
           * the DraggableNavBubble provides the active glass sphere */
          background:           active ? "transparent" : "rgba(255,255,255,0.058)",
          backdropFilter:       active ? "none" : "blur(15px)",
          WebkitBackdropFilter: active ? "none" : "blur(15px)",
          border:               active ? "none" : "1px solid rgba(255,255,255,0.09)",
          /* ── Premium icon polish ──
           * • Active: a tight white "internal glow" via two stacked
           *   drop-shadows (0 px / 1.2 px white) so the icon looks
           *   self-illuminated inside the bubble.
           * • Inactive: a single dark drop-shadow + slight
           *   `contrast(1.10) brightness(1.05)` so the glyph reads
           *   crisply over the dock's heavy backdrop blur. */
          filter: active
            ? "drop-shadow(0 0 4px rgba(255,255,255,0.55)) drop-shadow(0 0 10px rgba(255,255,255,0.25))"
            : "drop-shadow(0 1px 2px rgba(0,0,0,0.55)) contrast(1.10) brightness(1.05)",
          transition: "filter 0.25s ease-out, color 0.25s ease-out",
        } as React.CSSProperties}
      >
        {renderIcon
          ? renderIcon(active)
          : <span style={{ fontSize: "1.2rem" }}>{icon}</span>}
      </motion.span>

      {/* ── Label ── */}
      <motion.span
        animate={{ color: active ? "#ffffff" : "rgba(199,219,253,0.80)" }}
        transition={{ duration: 0.2 }}
        style={{
          fontSize:       "0.62rem",
          fontWeight:     600,
          letterSpacing:  "0.04em",
          position:       "relative",
          zIndex:         1,
          /* Legibility shadow so 10 px text stays sharp over the
           * dock's blur — never strong enough to read as an effect. */
          textShadow:     active
            ? "0 0 6px rgba(255,255,255,0.40), 0 1px 1px rgba(0,0,0,0.35)"
            : "0 1px 1px rgba(0,0,0,0.45)",
        }}
      >
        {label}
      </motion.span>
    </motion.button>
  );
}

// ── Draggable Liquid Glass Nav Bubble ─────────────────────────────
// A single absolutely-positioned glass capsule that slides across the
// nav pill.  Programmatic navigation springs it to the target tab;
// direct touch-drag uses raw pointer events + setPointerCapture so it
// works reliably on iOS Safari without Framer Motion gesture conflicts.
//
// Vertical: 3 px inset from top & bottom of the nav pill (centred).
// Horizontal: BUBBLE_MARGIN px inset from each tab cell edge.
const TABS_ORDERED: Tab[] = ["home", "scrapbook", "dates", "games", "capsules", "profile"];
const NAV_COUNT    = TABS_ORDERED.length; // 6
const BUBBLE_MARGIN = 5; // horizontal inset from tab cell edge (each side)
const BUBBLE_V      = 3; // vertical inset from nav pill edge (top & bottom)

interface DraggableNavBubbleProps {
  tab: Tab;
  navigateTo: (t: Tab) => void;
  auraColor: string;
  onSnapComplete: () => void;
  navEl: HTMLElement | null;
}

function DraggableNavBubble({ tab, navigateTo, auraColor, onSnapComplete, navEl }: DraggableNavBubbleProps) {
  const [navWidth, setNavWidth] = useState(0);

  // Measure nav bar width — ResizeObserver keeps it current on rotation
  useEffect(() => {
    if (!navEl) return;
    const measure = () => setNavWidth(navEl.offsetWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(navEl);
    measure();
    return () => ro.disconnect();
  }, [navEl]);

  const tabWidth = navWidth > 0 ? navWidth / NAV_COUNT : 0;
  const bubbleW  = tabWidth > 0 ? tabWidth - BUBBLE_MARGIN * 2 : 0;

  // Absolute left-edge x for each tab
  const snapX = useCallback(
    (idx: number) => idx * tabWidth + BUBBLE_MARGIN,
    [tabWidth],
  );

  const targetX = snapX(TAB_ORDER[tab]);

  // x motion value — animate() tweens it; pointer events set() it directly.
  // scaleX  — bubble elongates 22 % mid-slide (Liquid Bubble stretch).
  // scaleY  — bubble BULGES 25 % vertically while being dragged so it
  //           visibly protrudes above and below the pill perimeter,
  //           matching the iOS 26 reference (image 2 in the brief).
  const x           = useMotionValue(0);
  const scaleX      = useMotionValue(1);
  const scaleY      = useMotionValue(1);
  // pressGlow drives the soft white halo overlay (0 = off, 1 = full).
  // Bumped to 1 on pointerDown over 120 ms, eased back to 0 over 380 ms
  // on release — gives the bubble a quick "pop" of light that fades
  // before you've consciously registered it (premium iOS feel).
  const pressGlow   = useMotionValue(0);
  const initialized = useRef(false);
  const isDragging  = useRef(false);
  const ptrStartX   = useRef(0);   // client x where drag started
  const motStartX   = useRef(0);   // motion value x where drag started
  const lastDragIdx = useRef(TAB_ORDER[tab]);
  // For drag-velocity-driven liquid stretch.
  const lastMoveX   = useRef(0);
  const lastMoveT   = useRef(0);

  // SPEC: Liquid-Bubble morph easing — 300 ms with an overshoot curve.
  // The y-axis 1.5 control point pushes scaleX past 1 mid-flight then
  // settles, giving the pill its trademark "stretch & snap" feel.
  const BUBBLE_DURATION = 0.3;
  const BUBBLE_EASE: [number, number, number, number] = [0.5, 0, 0.5, 1.5];

  // Spring physics for the snap-to-tab.  Stiffness 320 + damping 26
  // gives a single-bounce settle — the same response curve Apple
  // uses for the iOS pill selector — without the multi-oscillation
  // you'd get from a lighter damping value.
  const SNAP_SPRING = { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.7 };

  // ── Sync x to targetX on tab change or first width measurement ──
  useEffect(() => {
    if (navWidth === 0) return;
    if (!initialized.current) {
      initialized.current = true;
      x.set(targetX);           // instant on first mount — no boot animation
      return;
    }
    if (isDragging.current) return;
    // Programmatic tab change → spring physics on x for natural snap.
    const ctrlX = animate(x, targetX, {
      ...SNAP_SPRING,
      onComplete: onSnapComplete,
    });
    // Stretch keyframes — bubble elongates 22% mid-slide, then rebounds.
    const ctrlS = animate(scaleX, [1, 1.22, 1], {
      duration: BUBBLE_DURATION,
      ease:     "easeInOut",
      times:    [0, 0.55, 1],
    });
    // Vertical lift — small 12 % bulge so a tab change reads as a
    // physical "pop" of the lens, not just a horizontal slide.
    const ctrlY = animate(scaleY, [1, 1.12, 1], {
      duration: BUBBLE_DURATION,
      ease:     "easeInOut",
      times:    [0, 0.55, 1],
    });
    return () => { ctrlX.stop(); ctrlS.stop(); ctrlY.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetX, navWidth]);

  if (!navWidth || bubbleW <= 0) return null;

  const minX = BUBBLE_MARGIN;
  const maxX = (NAV_COUNT - 1) * tabWidth + BUBBLE_MARGIN;

  // ── Pointer handlers — bypass Framer Motion gesture system ──
  // setPointerCapture keeps events flowing even when pointer leaves the
  // element (essential for fast swipes across the nav on mobile).
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    isDragging.current  = true;
    ptrStartX.current   = e.clientX;
    motStartX.current   = x.get();
    lastDragIdx.current = TAB_ORDER[tab];
    lastMoveX.current   = e.clientX;
    lastMoveT.current   = performance.now();
    e.currentTarget.setPointerCapture(e.pointerId);
    haptic("soft");
    // Bulge the lens vertically while being dragged — the bubble
    // visibly protrudes above & below the pill, like a soft jelly
    // being pinched between two fingers (matches iOS 26 reference).
    animate(scaleY, 1.25, { duration: 0.18, ease: [0.34, 1.56, 0.64, 1] });
    // Press glow — soft white halo punches in fast, fades out below.
    animate(pressGlow, 1, { duration: 0.12, ease: "easeOut" });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    const newX  = Math.max(minX, Math.min(maxX, motStartX.current + (e.clientX - ptrStartX.current)));
    x.set(newX);

    // ── Liquid drag-stretch ────────────────────────────────────────
    // While dragging, the bubble elongates along the drag axis in
    // proportion to instantaneous velocity (px / ms).  Capped so a
    // very fast swipe still tops out at scaleX 1.18 — mimics the way
    // a viscous liquid blob distorts as it's pulled across a surface.
    const now    = performance.now();
    const dt     = Math.max(1, now - lastMoveT.current);
    const vel    = (e.clientX - lastMoveX.current) / dt;   // px/ms, signed
    lastMoveX.current = e.clientX;
    lastMoveT.current = now;
    const stretch = Math.min(0.18, Math.abs(vel) * 0.06);
    // Compress on the cross-axis as it stretches (volume-preserving).
    animate(scaleX, 1 + stretch,         { duration: 0.10, ease: "easeOut" });
    animate(scaleY, 1.25 - stretch * 0.6, { duration: 0.10, ease: "easeOut" });

    // Light haptic tick each time the bubble crosses a tab boundary
    const idx = Math.max(0, Math.min(NAV_COUNT - 1, Math.round((newX - BUBBLE_MARGIN) / tabWidth)));
    if (idx !== lastDragIdx.current) {
      haptic("light");
      lastDragIdx.current = idx;
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    isDragging.current = false;

    const curX      = x.get();
    const nearestIdx = Math.max(0, Math.min(NAV_COUNT - 1, Math.round((curX - BUBBLE_MARGIN) / tabWidth)));
    const target     = snapX(nearestIdx);

    // Spring snap to the nearest tab — same physics as programmatic
    // tab changes, so direct-tap and drag-release feel identical.
    animate(x, target, {
      ...SNAP_SPRING,
      onComplete: onSnapComplete,
    });
    // Liquid-stretch keyframes layered on the spring snap.
    animate(scaleX, [scaleX.get(), 1.18, 1], {
      duration: 0.40,
      ease:     "easeOut",
      times:    [0, 0.40, 1],
    });
    // Squish-and-rebound the vertical bulge back to rest — the
    // [1.25 → 0.94 → 1] keyframes give the lens its trademark
    // "splat" recovery on release.
    animate(scaleY, [scaleY.get(), 0.94, 1.04, 1], {
      duration: 0.42,
      ease:     "easeOut",
      times:    [0, 0.45, 0.75, 1],
    });
    // Fade the press glow back out — quick enough that you only
    // perceive it as a residual gleam after release.
    animate(pressGlow, 0, { duration: 0.38, ease: "easeOut" });
    navigateTo(TABS_ORDERED[nearestIdx]);
  }

  return (
    <motion.div
      className="liquid-glass-bubble"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        // ── Layout ──
        position:    "absolute",
        top:          BUBBLE_V,
        bottom:       BUBBLE_V,
        left:         0,
        width:        bubbleW,
        x,
        scaleX,
        scaleY,                         // vertical bulge during drag (see handlers)
        transformOrigin: "50% 50%",
        zIndex:       5,
        borderRadius: "var(--active-pill-radius)",
        touchAction:  "none",
        cursor:       "grab",
        userSelect:   "none",

        // ── iOS 26 Liquid Glass Lens ──
        // All tunables are driven by the `--active-pill-*` CSS custom
        // properties hoisted at the top of `index.css`, so the visual
        // weight of the bubble can be retuned in one place without
        // editing this inline style block.  The pill uses 1.5 × the
        // dock's backdrop blur (per spec) so the active tab visibly
        // reads as a denser, more-refractive piece of glass than the
        // surrounding pill.  Inset shadows give the pill its 3-D edge
        // (bright top, dark bottom, faint inner top drop for thickness),
        // and the SVG #liquid-refract displacement map adds the lens
        // magnification of whatever sits behind it.
        background:           "var(--active-pill-bg)",
        backdropFilter:       "blur(var(--active-pill-blur)) saturate(var(--active-pill-saturate)) brightness(var(--active-pill-brightness)) contrast(var(--active-pill-contrast)) url(#liquid-refract)",
        WebkitBackdropFilter: "blur(var(--active-pill-blur)) saturate(var(--active-pill-saturate)) brightness(var(--active-pill-brightness)) contrast(var(--active-pill-contrast))",
        border:               "none",
        boxShadow: [
          "inset 0  1px 1px rgba(255,255,255,0.50)",  // top inner-edge specular
          "inset 0  2px 4px rgba(0,0,0,0.06)",        // very subtle inner depth shadow
          "inset 0  0   0 1px rgba(255,255,255,0.40)",// bright lens rim
          "inset 0 -1px 0 rgba(0,0,0,0.10)",          // bottom refraction line
          "0 4px 14px rgba(0,0,0,0.18)",              // grounding shadow
          tab === "games"
            ? "0 0 22px 4px rgba(197,48,48,0.40)"
            : `0 0 18px 4px ${auraColor}30`,           // colour-matched aura
        ].join(", "),
        willChange: "transform",
      }}
    >
      {/* Press-glow halo — soft white radial that punches in on
          pointerDown and fades on release.  Sits behind the bubble's
          lens content, expanding 8 px past the rim so the glow looks
          like light bleeding through the glass edge. */}
      <motion.div
        style={{
          position: "absolute",
          inset: -8,
          borderRadius: 24,
          background: "radial-gradient(circle, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 40%, transparent 70%)",
          opacity: pressGlow,
          pointerEvents: "none",
          zIndex: -1,
          willChange: "opacity",
        }}
      />

      {/* Tab-change sheen — a slim diagonal white-to-transparent strip
          that sweeps across the bubble whenever the active tab changes.
          Re-mounts via `key={tab}` so it plays exactly once per change.
          The CSS `.bubble-sheen-hover` overlay below handles the
          desktop-hover variant of the same effect. */}
      <motion.div
        key={`sheen-${tab}`}
        initial={{ x: "-110%", opacity: 0 }}
        animate={{ x: "110%",  opacity: [0, 0.55, 0] }}
        transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          overflow: "hidden",
          pointerEvents: "none",
          background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.45) 50%, transparent 65%)",
          mixBlendMode: "screen",
          willChange: "transform, opacity",
        }}
      />

      {/* Hover-only sheen — pure CSS keyframe sweep on `:hover` of
          `.liquid-glass-bubble`.  Driven entirely by `.bubble-sheen-hover`
          rules in `index.css` so it costs no JS frames. */}
      <span className="bubble-sheen-hover" aria-hidden="true" />

      {/* Pulsing crimson ring when Games tab is active */}
      {tab === "games" && (
        <motion.div
          animate={{ opacity: [0.35, 0.80, 0.35], scale: [0.90, 1.10, 0.90] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute", inset: -4, borderRadius: 20,
            border: "1.5px solid rgba(197,48,48,0.75)",
            boxShadow: "0 0 14px 3px rgba(197,48,48,0.40)",
            pointerEvents: "none",
          }}
        />
      )}
    </motion.div>
  );
}

// ── App shell ──────────────────────────────────────────────────────
function AppShell() {
  // Global Liquid-Glass parallax — drives `--lg-px` / `--lg-py` on
  // every element marked `[data-lg-parallax]` or `.lg-parallax`.
  // Single-listener implementation, throttled to rAF, automatically
  // disabled under `prefers-reduced-motion: reduce`.
  useLgParallax();

  const { profile, partnerProfile, tether, loading, logout } = useAuth();
  const [tab,           setTab]           = useState<Tab>("home");
  const [prevTab,       setPrevTab]       = useState<Tab>("home");
  const [transitionKey, setTransitionKey] = useState(0);
  const [birthdayBanner, setBirthdayBanner] = useState(false);
  // navEl: reference to the <nav> DOM node, needed by DraggableNavBubble
  // to measure its width via ResizeObserver.  Using state (not ref) means
  // the bubble re-renders once the nav mounts and the measurement is valid.
  const [navEl, setNavEl] = useState<HTMLElement | null>(null);

  // ── Cursor-tracking specular sheen + dock parallax ──────────────
  // One rAF loop drives THREE custom-property channels on the dock:
  //
  //   1. `--nav-mx` / `--nav-my`  — centre of the radial spotlight
  //      (in % of the dock's bounding box) for the moving highlight
  //      on `.glass-nav::before`.
  //   2. `--nav-px` / `--nav-py`  — small px offset (±5 / ±2) for
  //      the icon parallax — icons drift opposite the cursor.
  //   3. `--dock-tx` / `--dock-ty` — even smaller px offset (±2 / ±1)
  //      applied to the entire dock pill — gives the whole element a
  //      subtle "floating" parallax separate from the icon parallax.
  //
  // Disabled entirely when the user has set
  // `prefers-reduced-motion: reduce` — the dock then stays perfectly
  // still and the resting spotlight position is set once at mount.
  useEffect(() => {
    if (!navEl) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // Static rest position only — no movement at all.
      navEl.style.setProperty("--nav-mx", "50%");
      navEl.style.setProperty("--nav-my", "-20%");
      navEl.style.setProperty("--nav-px", "0px");
      navEl.style.setProperty("--nav-py", "0px");
      navEl.style.setProperty("--dock-tx", "0px");
      navEl.style.setProperty("--dock-ty", "0px");
      return;
    }

    let rafId = 0;
    let targetX = 50, targetY = -20;
    let curX = 50,    curY = -20;

    const tick = () => {
      // Lerp toward the target so the highlight glides instead of snaps.
      curX += (targetX - curX) * 0.18;
      curY += (targetY - curY) * 0.18;
      navEl.style.setProperty("--nav-mx", `${curX.toFixed(2)}%`);
      navEl.style.setProperty("--nav-my", `${curY.toFixed(2)}%`);
      // Icon parallax — drifts opposite the cursor by ±5/±2 px.
      const px = ((50 - curX) / 50) * 5;
      const py = ((50 - curY) / 50) * 2;
      navEl.style.setProperty("--nav-px", `${px.toFixed(2)}px`);
      navEl.style.setProperty("--nav-py", `${py.toFixed(2)}px`);
      // Whole-dock parallax — much subtler (capped ±2 px X / ±1 px Y)
      // so the pill itself sways gently in the opposite direction.
      const dx = ((50 - curX) / 50) * 2;
      const dy = ((50 - curY) / 50) * 1;
      navEl.style.setProperty("--dock-tx", `${dx.toFixed(2)}px`);
      navEl.style.setProperty("--dock-ty", `${dy.toFixed(2)}px`);
      rafId = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = navEl.getBoundingClientRect();
      // Allow a small "halo zone" outside the dock so the highlight
      // begins drifting toward the finger before it actually enters
      // the pill — feels more anticipatory.
      const HALO = 80;
      if (
        e.clientX < r.left - HALO || e.clientX > r.right + HALO ||
        e.clientY < r.top  - HALO || e.clientY > r.bottom + HALO
      ) {
        targetX = 50; targetY = -20;       // resting position
        return;
      }
      targetX = ((e.clientX - r.left) / r.width)  * 100;
      targetY = ((e.clientY - r.top)  / r.height) * 100;
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    rafId = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(rafId);
    };
  }, [navEl]);

  // Direction the new page enters from: +1 = right, -1 = left
  const slideDir = TAB_ORDER[tab] >= TAB_ORDER[prevTab] ? 1 : -1;

  // ── Navigate with fluid transition + haptic sync ───────────────
  const navigateTo = useCallback((newTab: Tab) => {
    if (newTab === tab) return;
    setPrevTab(tab);
    setTab(newTab);
    setTransitionKey(k => k + 1);
    // Midpoint haptic fires when the two pages overlap (~120 ms into spring)
    setTimeout(() => haptic("soft"), 120);
  }, [tab]);

  // ── Partner vibe for TetherAura ────────────────────────────────────
  const [partnerVibeId, setPartnerVibeId] = useState<string | null>(
    partnerProfile?.current_vibe ?? null,
  );

  // Sync when partnerProfile first loads
  useEffect(() => {
    setPartnerVibeId(partnerProfile?.current_vibe ?? null);
  }, [partnerProfile?.id, partnerProfile?.current_vibe]);

  // Realtime: watch for vibe changes on partner's profile row
  useEffect(() => {
    if (!partnerProfile?.id) return;
    const channel = supabase
      .channel("aura-vibe-" + partnerProfile.id)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "profiles",
          filter: `id=eq.${partnerProfile.id}`,
        },
        (payload) => {
          const row = payload.new as { current_vibe?: string | null };
          setPartnerVibeId(row.current_vibe ?? null);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [partnerProfile?.id]);

  const together = daysTogether(ANNIVERSARY);
  const isHome   = tab === "home";

  // Resolve the partner's vibe color for the liquid-glass pill glow.
  // Falls back to Crimson (#C53030) when no vibe is set.
  const auraColor = useMemo(() => {
    if (!partnerVibeId) return "#C53030";
    return VIBES.find(v => v.id === partnerVibeId)?.color ?? "#C53030";
  }, [partnerVibeId]);

  useEffect(() => {
    const handler = () => warmAudio();
    document.addEventListener("touchstart", handler, { once: true });
    document.addEventListener("pointerdown", handler, { once: true });
    document.addEventListener("click", handler, { once: true });
    return () => {
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("click", handler);
    };
  }, []);

  const handleSnapComplete = useCallback(() => { haptic("medium"); playSound("glassClick"); }, []);

  useEffect(() => {
    if (!profile || !tether) return;
    let cancelled = false;
    (async () => {
      const reg = await registerServiceWorker();
      if (cancelled || !reg) return;
      // Always attempt — setupPushNotifications handles the permission prompt
      // internally and is a no-op if the user denies or the API is unavailable.
      await setupPushNotifications(reg, profile.id, tether.id);
    })();
    return () => { cancelled = true; };
  }, [profile, tether]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const screen = params.get("screen") as Tab | null;
    if (screen && TAB_ORDER[screen] !== undefined) {
      navigateTo(screen);
      const url = new URL(window.location.href);
      url.searchParams.delete("screen");
      window.history.replaceState({}, "", url.pathname + url.search);
    }

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === "TETHER_NAVIGATE") {
        const s = event.data.screen as Tab;
        if (s && TAB_ORDER[s] !== undefined) navigateTo(s);
      }
    };
    navigator.serviceWorker?.addEventListener("message", handleSWMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", handleSWMessage);
    };
  }, [navigateTo]);

  useEffect(() => {
    if (!profile) return;
    const name = profile.full_name.toLowerCase();
    const bday = BIRTHDAYS[name];
    if (!bday) return;
    const now = new Date();
    const birthdayThis = new Date(now.getFullYear(), bday.month - 1, bday.day);
    const daysSince = Math.floor((now.getTime() - birthdayThis.getTime()) / (1000 * 60 * 60 * 24));
    const isNear = daysSince >= 0 && daysSince <= 3;
    const key    = CONFETTI_KEY_PREFIX + name;
    if (isNear && localStorage.getItem(key) !== String(now.getFullYear())) {
      localStorage.setItem(key, String(now.getFullYear()));
      setBirthdayBanner(true);
      setTimeout(() => {
        triggerBirthdayConfetti();
        setTimeout(() => setBirthdayBanner(false), 5500);
      }, 700);
    }
  }, [profile]);

  if (loading) {
    return (
      <div className="animated-bg app-shell items-center justify-center flex">
        <div className="text-white text-center">
          <div className="text-5xl mb-3 animate-pulse">💙</div>
          <p className="text-blue-200 text-sm font-light tracking-widest uppercase"
            style={{ fontFamily: "'Playfair Display', serif" }}>
            Tether
          </p>
        </div>
      </div>
    );
  }

  if (!profile) return <LoginPage />;

  return (
    // LayoutGroup enables layoutId morphs across all children
    <LayoutGroup id="tether-header">
      <div className="animated-bg app-shell max-w-md mx-auto">

        {/* GPU-composited animated background — own compositor layer, zero repaint */}
        <div className="animated-bg-layer" />

        {/* Ambient orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-[#C53030]/12 blur-3xl" />
          <div className="absolute top-1/3 -right-20 w-60 h-60 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute bottom-24 left-1/3 w-52 h-52 rounded-full bg-[#7B1313]/15 blur-3xl" />
        </div>

        {/* ── Tether Aura — glowing border synced to partner's vibe ── */}
        <AnimatePresence mode="wait">
          {partnerVibeId && (
            <motion.div
              key={partnerVibeId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2 }}
              style={{
                // position:fixed pins the aura to the TRUE physical screen perimeter
                // (not to the parent container) — the glow traces every edge including
                // the bottom bezel behind the home indicator.
                position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9995,
              }}
            >
              <TetherAura vibeId={partnerVibeId} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Birthday banner */}
        {birthdayBanner && (
          <div className="absolute left-0 right-0 z-50 bg-gradient-to-r from-[#7B1313] via-[#C53030] to-pink-500 text-white text-center px-4 text-sm shadow-xl"
            style={{ top: 0, paddingTop: "max(12px, calc(env(safe-area-inset-top, 12px) + 4px))", paddingBottom: 12 }}>
            <span style={{ fontFamily: "'Playfair Display', serif" }}>
              {profile.full_name.toLowerCase() === "kyle"
                ? "🎂 Happy Birthday, Kyle! 🎉 Nathan loves you so much! 💙"
                : "🎂 Happy Birthday, Nathan! 🎉 Kyle loves you endlessly! 💓"}
            </span>
          </div>
        )}

        {/* Top bar — paddingTop uses safe-area-inset-top so content sits
            below the status bar on all iPhone models (notched, Dynamic Island,
            home-button). Falls back to 20px on devices/browsers where the
            env() variable isn't supported. */}
        <div
          className="relative z-10 flex items-center justify-between px-5 pb-1 flex-shrink-0"
          style={{ paddingTop: "max(20px, env(safe-area-inset-top, 20px))" }}
        >
          <div className="flex items-center gap-2">
            <img
              src={`${import.meta.env.BASE_URL}icon-192.png`}
              alt="Tether"
              className="w-8 h-8 rounded-lg shadow-lg"
            />
            <span className="text-white font-bold text-xl"
              style={{ fontFamily: "'Playfair Display', serif" }}>
              Tether
            </span>
          </div>
          <motion.button
            onClick={() => { haptic("light"); logout(); }}
            whileTap={{ scale: 0.92 }}
            className="text-blue-300/70 text-xs hover:text-white transition-colors tracking-wide"
          >
            Sign out
          </motion.button>
        </div>

        {/* ── Compact header — visible on all non-home tabs ── */}
        {/* Uses layoutId so "Kyle & Nathan" morphs from the hero sky header */}
        <AnimatePresence>
          {!isHome && (
            <motion.div
              key="compact-header"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="relative z-10 flex-shrink-0 flex flex-col items-center py-3 px-5"
              style={{
                background: "rgba(10, 18, 48, 0.55)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                borderBottom: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <motion.h2
                layoutId="couple-name"
                layout="position"
                style={{
                  fontFamily: "'Playfair Display', serif",
                  color: "white",
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                Kyle &amp; Nathan<SensorSyncIcon size={11} />
              </motion.h2>
              <motion.p
                layoutId="couple-days"
                layout="position"
                style={{
                  fontFamily: "'Caveat', cursive",
                  color: "rgba(147,197,253,0.75)",
                  fontSize: "0.9rem",
                  margin: "2px 0 0",
                }}
              >
                {together.toLocaleString()} days together
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Page content — Liquid Fluid transitions ── */}
        {/* Wrapper is position:relative + overflow:hidden so sliding pages   */}
        {/* are clipped to their bounds. Both enter/exit animate in parallel. */}
        <div className="relative z-10 flex-1 min-h-0 overflow-hidden" style={{ position: "relative" }}>

          {/* ── Liquid Glass Wave — sweeps across in the nav direction ── */}
          {/* A bright vertical shimmer band that travels with the new page, */}
          {/* creating the "glass washing over the screen" effect.           */}
          <AnimatePresence>
            {transitionKey > 0 && (
              <motion.div
                key={transitionKey}
                initial={{ x: slideDir >= 0 ? "-80%" : "80%", opacity: 0 }}
                animate={{ x: slideDir >= 0 ? "180%" : "-180%", opacity: [0, 1, 1, 0] }}
                transition={{ duration: 0.52, ease: [0.25, 0.1, 0.25, 1] }}
                style={{
                  position:      "absolute",
                  inset:         0,
                  zIndex:        30,
                  pointerEvents: "none",
                  background:    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0.04) 75%, transparent 100%)",
                  backdropFilter: "blur(2px)",
                  WebkitBackdropFilter: "blur(2px)",
                }}
              />
            )}
          </AnimatePresence>

          {/* ── Pages — simultaneously enter/exit with directional spring ── */}
          {/* Both pages are absolute-fill so they overlap during the cross.  */}
          {/* `custom` propagates slideDir to the exit variant of the leaving */}
          {/* page — without this, exit would use the stale direction value.  */}
          <AnimatePresence initial={false} custom={slideDir}>
            <motion.div
              key={tab}
              custom={slideDir}
              variants={PAGE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={PAGE_TRANSITION}
              style={{
                position:       "absolute",
                inset:          0,
                display:        "flex",
                flexDirection:  "column",
                overflow:       "hidden",
                willChange:     "transform, opacity",
              }}
            >
              {tab === "home"      && <HomePage together={together} onNavigateToCapsules={() => navigateTo("capsules")} />}
              {tab === "scrapbook" && <ScrapbookPage />}
              {tab === "dates"     && <DatePlannerPage />}
              {tab === "games"     && <GamesHubPage />}
              {tab === "capsules"  && <CapsulesPage />}
              {tab === "profile"   && <ProfilePage />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Bottom nav — Liquid Glass pill ─────────────────────────
             position:fixed on .glass-nav creates a containing block so the
             DraggableNavBubble (position:absolute) stays inside the nav.
             overflow:visible lets the bubble protrude slightly above/below. */}
        <nav ref={setNavEl} className="glass-nav flex">

          {/* Idle light-refraction shimmer — slow chromatic drift
              behind everything else in the dock.  Sits at z-index 0
              so the icons (z=1), cursor sheen (z=1) and bubble (z=5)
              all stack above it. */}
          <div className="glass-shimmer" aria-hidden="true" />

          {/* Tabs — icons + labels only; no bubble rendered here */}
          <NavTab icon="🏠"  label="Home"      active={isHome}              onClick={() => navigateTo("home")} />
          <NavTab icon="📖" label="Scrapbook"  active={tab === "scrapbook"} onClick={() => navigateTo("scrapbook")} />
          <NavTab icon="🗺️" label="Dates"      active={tab === "dates"}     onClick={() => navigateTo("dates")} />
          <NavTab icon="🎮" label="Games"      active={tab === "games"}     onClick={() => navigateTo("games")} />
          <NavTab
            label="Capsules"
            active={tab === "capsules"}
            onClick={() => navigateTo("capsules")}
            renderIcon={(active) => (
              <CapsuleOrb active={active} />
            )}
          />
          <NavTab
            label="Us"
            active={tab === "profile"}
            onClick={() => navigateTo("profile")}
            renderIcon={(active) => (
              <ProfileMirrorIcon active={active} />
            )}
          />

          {/* Single draggable glass bubble — travels across the full nav */}
          <DraggableNavBubble
            tab={tab}
            navigateTo={navigateTo}
            auraColor={auraColor}
            onSnapComplete={handleSnapComplete}
            navEl={navEl}
          />
        </nav>

      </div>
    </LayoutGroup>
  );
}

export default function App() {
  // iOS Visual-Viewport restoration — see hooks/useViewportFix.ts.
  // Installed at the App root so the listeners exist for the full
  // session, regardless of which page is mounted.
  useViewportFix();

  return (
    <AuthProvider>
      <EditModeProvider>
        <AppShell />
        <EditModeFooter />
        <Toaster />
      </EditModeProvider>
    </AuthProvider>
  );
}
