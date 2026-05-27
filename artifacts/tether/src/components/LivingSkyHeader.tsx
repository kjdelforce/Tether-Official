import { useState, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Brisbane: UTC+10, no DST ──────────────────────────────────
const LAT = -27.68, LON = 153.12;

type SkyPhase = "dawn" | "day" | "golden" | "night";
type CloudDensity = 0 | 1 | 2 | 3;

interface Weather {
  code: number;
  cloudCover: number;
  rain: boolean;
}

// ── Helpers ───────────────────────────────────────────────────
function getBrisbaneHour(): number {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const bris  = new Date(utcMs + 10 * 3600000); // AEST = UTC+10
  return bris.getHours() + bris.getMinutes() / 60;
}

function getPhase(h: number): SkyPhase {
  if (h >= 5  && h < 8)  return "dawn";
  if (h >= 8  && h < 17) return "day";
  if (h >= 17 && h < 19) return "golden";
  return "night";
}

// Arc: 5 AM → sunrise bottom-left, 12 PM → peak center, 7 PM → sunset bottom-right
function getCelestialPos(h: number) {
  const isDay  = h >= 5 && h < 19;
  let progress: number;
  if (isDay) {
    progress = (h - 5) / 14;  // 0 at 5 AM, 1 at 7 PM
  } else {
    const nh = h >= 19 ? h : h + 24;
    progress = (nh - 19) / 10; // 0 at 7 PM, 1 at 5 AM
  }
  const x = 5 + 90 * progress;
  const y = 84 - Math.sin(progress * Math.PI) * 70; // peak = 14% from top
  return { x, y };
}

function getCloudDensity(code: number, cover: number): CloudDensity {
  if (code >= 95) return 3;
  if (code >= 51) return 2;
  if (cover > 70) return 3;
  if (cover > 40) return 2;
  if (cover > 15) return 1;
  return 0;
}

// ── Sky gradient per phase ─────────────────────────────────────
const GRADIENTS: Record<SkyPhase, string> = {
  dawn:   "linear-gradient(to top, #FFAB76 0%, #FF8860 15%, #C47AAE 40%, #563484 70%, #130D2A 100%)",
  day:    "linear-gradient(to top, #8FD6E8 0%, #52AADD 30%, #2076C2 65%, #0A4FA0 100%)",
  golden: "linear-gradient(to top, #FF6E00 0%, #DD3535 25%, #7B2580 55%, #2A1558 85%, #0D0920 100%)",
  night:  "linear-gradient(to top, #172255 0%, #0C1440 45%, #05091C 100%)",
};
const RAINY_GRADIENT = "linear-gradient(to top, #8699AF 0%, #566275 40%, #323C4F 100%)";

// ── Stars — seeded deterministic positions ─────────────────────
function makeStars(n: number) {
  let s = 2025;
  const r = () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
  return Array.from({ length: n }, () => ({
    x:    r() * 100,
    y:    r() * 72,
    size: r() * 1.6 + 0.5,
    del:  r() * 5,
    dur:  r() * 2.5 + 1.8,
  }));
}
const STARS = makeStars(60);

// ── Cloud shapes — stable definitions ─────────────────────────
const CLOUDS = [
  { w: 120, yPct: 10, dur: 34, del:   0, op: 0.80 },
  { w: 170, yPct:  4, dur: 45, del: -13, op: 0.62 },
  { w:  90, yPct: 26, dur: 27, del: -19, op: 0.72 },
  { w: 150, yPct: 16, dur: 40, del:  -8, op: 0.55 },
  { w: 105, yPct:  7, dur: 31, del: -26, op: 0.68 },
  { w: 195, yPct: 22, dur: 52, del: -38, op: 0.44 },
];

// ── Cloud component ────────────────────────────────────────────
function Cloud({ w, yPct, dur, del, op, night, rain }: {
  w: number; yPct: number; dur: number; del: number; op: number;
  night: boolean; rain: boolean;
}) {
  const col = night
    ? "rgba(25,38,80,0.75)"
    : rain
      ? "rgba(145,165,195,0.82)"
      : "rgba(255,255,255,0.90)";
  return (
    <div style={{
      position: "absolute",
      top: `${yPct}%`,
      left: -w - 10,
      width: w,
      height: Math.round(w * 0.42),
      animation: `sky-cloud ${dur}s linear ${del}s infinite`,
      willChange: "transform",
      opacity: op,
      pointerEvents: "none",
    }}>
      <div style={{ position: "absolute", bottom: 0,   left: "8%",  width: "84%", height: "58%", background: col, borderRadius: 40 }} />
      <div style={{ position: "absolute", bottom: "35%", left: "10%", width: "38%", height: "68%", background: col, borderRadius: "50%" }} />
      <div style={{ position: "absolute", bottom: "35%", left: "28%", width: "46%", height: "88%", background: col, borderRadius: "50%" }} />
      <div style={{ position: "absolute", bottom: "35%", left: "52%", width: "34%", height: "60%", background: col, borderRadius: "50%" }} />
    </div>
  );
}

// ── Rain layer ────────────────────────────────────────────────
function RainLayer() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      <div className="sky-rain-inner" />
    </div>
  );
}

// ── Mist layer (dawn) ─────────────────────────────────────────
function MistLayer() {
  return (
    <>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            position: "absolute",
            bottom: `${i * 18}%`,
            left: 0, right: 0,
            height: "25%",
            background: `rgba(255,230,210,${0.18 - i * 0.04})`,
            filter: "blur(8px)",
            animation: `sky-mist ${14 + i * 5}s ease-in-out ${i * -3}s infinite`,
            willChange: "transform, opacity, filter",
            transform: "translateZ(0)",
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

// ── Celestial body (Sun or Moon) ───────────────────────────────
function Celestial({ x, y, isSun }: { x: number; y: number; isSun: boolean }) {
  const size = isSun ? 44 : 36;
  return (
    <motion.div
      style={{
        position: "absolute",
        left: `${x}%`,
        top:  `${y}%`,
        translateX: "-50%",
        translateY: "-50%",
        width:  size,
        height: size,
        borderRadius: "50%",
        willChange: "transform",
        pointerEvents: "none",
        zIndex: 2,
      }}
      animate={{ scale: [1, 1.04, 1] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Core */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "50%",
        background: isSun
          ? "radial-gradient(circle at 38% 38%, #FFF5A0, #FFD700 50%, #FF8C00)"
          : "radial-gradient(circle at 35% 35%, #F4F4DC, #E8E0B0 55%, #C8C090)",
        boxShadow: isSun
          ? "0 0 24px 10px rgba(255,200,0,0.55), 0 0 60px 22px rgba(255,160,0,0.25)"
          : "0 0 18px 8px rgba(220,220,180,0.40), 0 0 40px 16px rgba(200,200,150,0.18)",
      }} />
      {/* Ray halo — sun only */}
      {isSun && (
        <motion.div
          style={{
            position: "absolute",
            inset: -12,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,220,50,0.28) 30%, transparent 70%)",
          }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.85, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </motion.div>
  );
}

// ── Star field ────────────────────────────────────────────────
function StarField({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.8 }}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {STARS.map((s, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left:   `${s.x}%`,
                top:    `${s.y}%`,
                width:   s.size,
                height:  s.size,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.95)",
                /* No box-shadow — shadows trigger paint on every opacity frame */
                animation: `sky-twinkle ${s.dur}s ease-in-out ${s.del}s infinite`,
                willChange: "transform, opacity",
                transform: "translateZ(0)",
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── useLivingSky hook ─────────────────────────────────────────
function useLivingSky() {
  const [hour,         setHour]         = useState(getBrisbaneHour);
  const [weather,      setWeather]      = useState<Weather | null>(null);

  // Refresh hour every minute
  useEffect(() => {
    const id = setInterval(() => setHour(getBrisbaneHour()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Fetch weather on mount + every 30 minutes
  useEffect(() => {
    async function load() {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=weather_code,cloud_cover,precipitation&forecast_days=1`;
        const res  = await fetch(url);
        const json = await res.json();
        setWeather({
          code:      json.current.weather_code,
          cloudCover: json.current.cloud_cover,
          rain:      json.current.precipitation > 0 || json.current.weather_code >= 51,
        });
      } catch { /* fail silently — sky still works time-only */ }
    }
    load();
    const id = setInterval(load, 30 * 60_000);
    return () => clearInterval(id);
  }, []);

  const phase         = getPhase(hour);
  const celestial     = getCelestialPos(hour);
  const isSun         = phase === "dawn" || phase === "day" || phase === "golden";
  const density: CloudDensity = weather
    ? getCloudDensity(weather.code, weather.cloudCover)
    : 1;
  const isRaining     = weather?.rain ?? false;
  const isNight       = phase === "night";

  const gradient      = isRaining && phase === "day"
    ? RAINY_GRADIENT
    : GRADIENTS[phase];

  const visibleClouds = CLOUDS.slice(0, [0, 2, 4, 6][density]);

  return { phase, celestial, isSun, isNight, gradient, visibleClouds, isRaining };
}

// ── Main component ────────────────────────────────────────────
// Full-bleed: caller must break out of any horizontal padding.
// Bottom edge dissolves into the app's animated-bg via the gradient veil.
export function LivingSkyHeader({ children }: { children: ReactNode }) {
  const sky = useLivingSky();

  return (
    <div style={{
      position: "relative",
      overflow: "hidden",
      minHeight: 210,
      isolation: "isolate",
      transform: "translateZ(0)",
      willChange: "transform",
    }}>

      {/* ── Sky gradient — cross-fades on phase change ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={sky.gradient}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
          style={{
            position: "absolute", inset: 0,
            background: sky.gradient,
          }}
        />
      </AnimatePresence>

      {/* ── Horizon atmospheric glow ── */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        height: "40%",
        background: sky.isNight
          ? "rgba(10,15,40,0.30)"
          : sky.phase === "golden"
            ? "rgba(255,100,0,0.18)"
            : "rgba(150,220,255,0.10)",
        pointerEvents: "none",
      }} />

      {/* ── Stars ── */}
      <StarField visible={sky.isNight} />

      {/* ── Celestial body ── */}
      <Celestial x={sky.celestial.x} y={sky.celestial.y} isSun={sky.isSun} />

      {/* ── Clouds ── */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <AnimatePresence>
          {sky.visibleClouds.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2 }}
            >
              <Cloud {...c} night={sky.isNight} rain={sky.isRaining} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Dawn mist ── */}
      <AnimatePresence>
        {sky.phase === "dawn" && (
          <motion.div
            key="mist"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2 }}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            <MistLayer />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rain ── */}
      <AnimatePresence>
        {sky.isRaining && (
          <motion.div
            key="rain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            <RainLayer />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Night moonshine diffuse ── */}
      <AnimatePresence>
        {sky.isNight && (
          <motion.div
            key="moonshine"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(ellipse at 50% 0%, rgba(180,190,230,0.08) 0%, transparent 65%)",
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Bottom dissolve veil — sky melts into app background ──
           Uses the darkest animated-bg color (#0D1F3C) so the horizon
           bleeds naturally into the navy/crimson gradient below.        ── */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: "52%",
          background: "linear-gradient(to top, #0D1F3C 0%, rgba(13,31,60,0.75) 35%, transparent 100%)",
          pointerEvents: "none",
          zIndex: 8,
        }}
      />

      {/* ── Text content — sits above the dissolve veil ── */}
      <div style={{
        position: "relative", zIndex: 10,
        padding: "26px 20px 28px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
        minHeight: 210,
        justifyContent: "center",
      }}>
        {children}
      </div>
    </div>
  );
}
