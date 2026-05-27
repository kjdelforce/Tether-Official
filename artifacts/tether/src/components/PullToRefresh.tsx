import { useRef, useState, useEffect, useCallback, ReactNode, CSSProperties } from "react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptics";
import { playSound } from "@/lib/audioManager";

interface Props {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const THRESHOLD = 68;
const MAX_PULL  = 120;
const SPRING_BACK = "transform 0.45s cubic-bezier(.25,1.56,.36,1)";
const HGT_SPRING  = "height   0.45s cubic-bezier(.25,1.56,.36,1)";

export function PullToRefresh({ onRefresh, children, className, style }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spacerRef    = useRef<HTMLDivElement>(null);
  const posRef       = useRef<HTMLDivElement>(null);
  const iconRef      = useRef<HTMLDivElement>(null);

  const startY        = useRef(0);
  const isPulling     = useRef(false);
  const pullDistRef   = useRef(0);
  const isRefreshing  = useRef(false);
  const onRefreshRef  = useRef(onRefresh);
  const rAFId         = useRef<number | null>(null);
  const tensionPlayed = useRef(false);
  const thresholdHit  = useRef(false);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const applyPull = useCallback((dist: number) => {
    const spacer = spacerRef.current;
    const pos    = posRef.current;
    const icon   = iconRef.current;
    if (!spacer || !pos || !icon) return;

    const t = Math.min(dist / THRESHOLD, 1);
    const resistance = 1 - (dist / (MAX_PULL * 2.8));
    const easedDist = dist * Math.max(resistance, 0.3);
    const transY = -80 + easedDist * 0.88;

    spacer.style.height   = "0px";
    pos.style.transition  = "none";
    pos.style.transform   = `translate3d(-50%, ${transY}px, 0)`;
    icon.style.transform  = `scale(${dist > 6 ? 0.5 + 0.5 * t : 0.35})`;
    icon.style.opacity    = dist > 6 ? String(0.35 + 0.65 * t) : "0";
    icon.style.boxShadow  = `0 0 ${Math.round(6 + 22 * t)}px rgba(197,48,48,${(0.12 + 0.45 * t).toFixed(2)})`;

    if (t > 0.35 && !tensionPlayed.current) {
      tensionPlayed.current = true;
      playSound("glassTension");
    }

    if (dist >= THRESHOLD && !thresholdHit.current) {
      thresholdHit.current = true;
      haptic("medium");
    }
  }, []);

  const applyRefreshStart = useCallback(() => {
    const spacer = spacerRef.current;
    const pos    = posRef.current;
    const icon   = iconRef.current;
    if (!spacer || !pos || !icon) return;

    spacer.style.transition = HGT_SPRING;
    spacer.style.height     = "72px";
    pos.style.transition    = SPRING_BACK;
    pos.style.transform     = "translate3d(-50%, 0px, 0)";
    icon.style.transform    = "scale(1)";
    icon.style.opacity      = "1";
    icon.style.boxShadow    = "0 0 32px rgba(197,48,48,0.60), 0 0 70px rgba(197,48,48,0.22)";
  }, []);

  const applyReset = useCallback(() => {
    const spacer = spacerRef.current;
    const pos    = posRef.current;
    const icon   = iconRef.current;
    if (!spacer || !pos || !icon) return;

    spacer.style.transition = HGT_SPRING;
    spacer.style.height     = "0px";
    pos.style.transition    = SPRING_BACK;
    pos.style.transform     = "translate3d(-50%, -80px, 0)";
    icon.style.opacity      = "0";

    setTimeout(() => {
      if (pos)    pos.style.transition    = "none";
      if (spacer) spacer.style.transition = "none";
    }, 500);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Restore pan-y so the browser handles scroll efficiently by default
    function restorePanY() {
      el!.style.touchAction = "pan-y";
    }

    // Switch to touch-action:none when we take over the gesture for PTR.
    // This makes e.preventDefault() in touchmove actually work — the browser
    // won't take ownership of the gesture when touch-action is "none".
    function lockTouchAction() {
      el!.style.touchAction = "none";
    }

    restorePanY(); // ensure clean state on mount

    function onTouchStart(e: TouchEvent) {
      if (isRefreshing.current) return;
      if (el!.scrollTop > 0) return;

      let node = e.target as HTMLElement | null;
      while (node && node !== el) {
        const style = window.getComputedStyle(node);
        if (style.position === "fixed" || style.touchAction === "none" || node.hasAttribute("data-no-ptr")) {
          return;
        }
        node = node.parentElement;
      }

      startY.current        = e.touches[0].clientY;
      isPulling.current     = true;
      tensionPlayed.current = false;
      thresholdHit.current  = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPulling.current || isRefreshing.current) return;
      const delta = e.touches[0].clientY - startY.current;

      if (delta <= 0) {
        // User scrolling down into content — hand back to browser immediately
        if (pullDistRef.current > 0) {
          if (rAFId.current) {
            cancelAnimationFrame(rAFId.current);
            rAFId.current = null;
          }
          pullDistRef.current = 0;
          const pos = posRef.current;
          if (pos) {
            pos.style.transition = SPRING_BACK;
            pos.style.transform  = "translate3d(-50%, -80px, 0)";
          }
          const icon = iconRef.current;
          if (icon) icon.style.opacity = "0";
        }
        isPulling.current = false;
        restorePanY();
        return;
      }

      // User pulling down — we take over, disable browser's pan-y so
      // e.preventDefault() is respected and content doesn't scroll.
      const clamped       = Math.min(delta * 0.50, MAX_PULL);
      pullDistRef.current = clamped;

      if (clamped > 6) {
        lockTouchAction();  // now e.preventDefault() is guaranteed cancelable
        e.preventDefault();
      }

      if (!rAFId.current) {
        rAFId.current = requestAnimationFrame(() => {
          rAFId.current = null;
          applyPull(pullDistRef.current);
        });
      }
    }

    async function onTouchEnd() {
      if (!isPulling.current) {
        restorePanY();
        return;
      }
      isPulling.current = false;
      restorePanY();

      if (rAFId.current) {
        cancelAnimationFrame(rAFId.current);
        rAFId.current = null;
      }

      const dist        = pullDistRef.current;
      pullDistRef.current = 0;

      if (dist >= THRESHOLD) {
        isRefreshing.current = true;
        applyRefreshStart();
        setRefreshing(true);
        haptic("light");
        try {
          await onRefreshRef.current();
          playSound("crystalPlink");
          haptic("success");
          setTimeout(() => haptic("success"), 180);
        } finally {
          isRefreshing.current = false;
          setRefreshing(false);
          applyReset();
        }
      } else {
        applyReset();
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true  });
    el.addEventListener("touchmove",  onTouchMove,  { passive: false });
    el.addEventListener("touchend",   onTouchEnd,   { passive: true  });
    el.addEventListener("touchcancel",onTouchEnd,   { passive: true  });

    return () => {
      el.removeEventListener("touchstart",  onTouchStart);
      el.removeEventListener("touchmove",   onTouchMove);
      el.removeEventListener("touchend",    onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyPull, applyRefreshStart, applyReset]);

  return (
    <div
      ref={containerRef}
      className={`tether-scroll${className ? ` ${className}` : ""}`}
      style={style}
    >
      {/* Pull indicator */}
      <div
        ref={spacerRef}
        style={{ height: 0, flexShrink: 0, overflow: "visible", position: "relative" }}
      >
        <div
          ref={posRef}
          style={{
            position:   "absolute",
            left:       "50%",
            top:        0,
            transform:  "translate3d(-50%, -80px, 0)",
            willChange: "transform",
            pointerEvents: "none",
          }}
        >
          <div
            ref={iconRef}
            style={{
              width:         54,
              height:        54,
              borderRadius:  "50%",
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              opacity:       0,
              willChange:    "transform, opacity",
            }}
          >
            {refreshing ? (
              <motion.img
                src="/icon-192.png"
                alt="Tether"
                draggable={false}
                animate={{ scale: [1, 1.22, 0.88, 1.16, 0.94, 1.08, 1] }}
                transition={{ duration: 0.85, repeat: Infinity, repeatType: "loop", ease: "easeInOut" }}
                style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", display: "block", willChange: "transform" }}
              />
            ) : (
              <img
                src="/icon-192.png"
                alt="Tether"
                draggable={false}
                style={{ width: 54, height: 54, borderRadius: "50%", objectFit: "cover", display: "block" }}
              />
            )}
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
