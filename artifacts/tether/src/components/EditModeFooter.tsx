// ════════════════════════════════════════════════════════════════
//  EditModeFooter — Architect Mode HUD
//
//  Contains two things:
//    1. Gold glow ring — fixed inset border around the screen edges,
//       pointer-events:none so nothing is blocked underneath.
//    2. Floating "Save / Discard" pill — positioned ABOVE the nav bar
//       (not overlapping it) so navigation remains fully usable.
// ════════════════════════════════════════════════════════════════
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEditMode } from "@/lib/EditModeContext";
import { haptic } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";

// ── Gold glow border — pointer-events: none, never blocks anything ─
function EditModeGlowRing({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="glow-ring"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            position:      "fixed",
            inset:         0,
            zIndex:        9990,
            pointerEvents: "none",    // NEVER blocks any touch/click
            borderRadius:  0,
          }}
        >
          {/* Pulsing gold inner glow — inset box-shadow stays inside the viewport */}
          <motion.div
            animate={{
              boxShadow: [
                "inset 0 0 28px 6px rgba(212,175,55,0.35), inset 0 0 60px 12px rgba(212,175,55,0.12)",
                "inset 0 0 40px 10px rgba(212,175,55,0.55), inset 0 0 80px 18px rgba(212,175,55,0.20)",
                "inset 0 0 28px 6px rgba(212,175,55,0.35), inset 0 0 60px 12px rgba(212,175,55,0.12)",
              ],
            }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position:      "absolute",
              inset:         0,
              pointerEvents: "none",
              border:        "2px solid rgba(212,175,55,0.45)",
            }}
          />

          {/* Corner accents */}
          {[
            { top: 0, left: 0, borderTop: "3px solid rgba(212,175,55,0.70)", borderLeft: "3px solid rgba(212,175,55,0.70)", borderTopLeftRadius: 6 },
            { top: 0, right: 0, borderTop: "3px solid rgba(212,175,55,0.70)", borderRight: "3px solid rgba(212,175,55,0.70)", borderTopRightRadius: 6 },
            { bottom: 0, left: 0, borderBottom: "3px solid rgba(212,175,55,0.70)", borderLeft: "3px solid rgba(212,175,55,0.70)", borderBottomLeftRadius: 6 },
            { bottom: 0, right: 0, borderBottom: "3px solid rgba(212,175,55,0.70)", borderRight: "3px solid rgba(212,175,55,0.70)", borderBottomRightRadius: 6 },
          ].map((s, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                width:    24,
                height:   24,
                ...s,
              }}
            />
          ))}

          {/* Top badge */}
          <div style={{
            position:      "absolute",
            top:           "max(12px, env(safe-area-inset-top, 12px))",
            left:          "50%",
            transform:     "translateX(-50%)",
            background:    "linear-gradient(90deg, #8B6914, #D4AF37, #8B6914)",
            borderRadius:  20,
            padding:       "3px 14px",
            fontSize:      "0.58rem",
            fontWeight:    700,
            letterSpacing: "0.14em",
            color:         "#0a0500",
            boxShadow:     "0 0 16px 4px rgba(212,175,55,0.45)",
            whiteSpace:    "nowrap",
            fontFamily:    "'Quicksand', sans-serif",
          }}>
            ⚙ ARCHITECT MODE — TAP ANY GLOWING TEXT TO EDIT
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Floating save pill — sits above the glass nav bar ─────────────
// Nav is at: bottom = env(safe-area-inset-bottom) + 10px, height ≈ 70px.
// So the pill bottom edge should clear: env() + 10px + 70px + 10px gap = env() + 90px.
const ABOVE_NAV = "calc(env(safe-area-inset-bottom, 0px) + 92px)";

export function EditModeFooter() {
  const { isEditMode, pendingEdits, saveEdits, discardEdits } = useEditMode();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const editCount = Object.keys(pendingEdits).length;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    haptic("medium");
    const err = await saveEdits();
    setSaving(false);
    if (err) {
      haptic("error");
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } else {
      haptic("success");
      toast({ title: "Changes saved ✓", description: "All edits are now live on Nathan's device." });
    }
  }

  function handleDiscard() {
    haptic("light");
    discardEdits();
    toast({ title: "Edits discarded" });
  }

  return (
    <>
      {/* Gold glow ring — pointer-events:none, never blocks navigation */}
      <EditModeGlowRing visible={isEditMode} />

      {/* Floating save/discard pill above nav.
          Centering wrapper is outside AnimatePresence (pointer-events:none so
          the invisible area never blocks taps). The motion.div inside gets the
          enter/exit spring animation via its key in AnimatePresence. */}
      <div
        style={{
          position:       "fixed",
          bottom:         ABOVE_NAV,
          left:           0,
          right:          0,
          zIndex:         9995,
          display:        "flex",
          justifyContent: "center",
          pointerEvents:  "none",
        }}
      >
        <AnimatePresence>
          {isEditMode && (
          <motion.div
            key="edit-mode-pill"
            initial={{ y: 60, opacity: 0, scale: 0.92 }}
            animate={{ y: 0,  opacity: 1, scale: 1    }}
            exit={{   y: 60, opacity: 0, scale: 0.92  }}
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
            style={{
              pointerEvents: "all",
              display:       "flex",
              alignItems:    "center",
              gap:           8,
              padding:       "8px 8px 8px 14px",
              borderRadius:  32,
              background:    "linear-gradient(135deg, rgba(20,10,0,0.92) 0%, rgba(5,2,15,0.96) 100%)",
              border:        "1.5px solid rgba(212,175,55,0.50)",
              backdropFilter: "blur(32px)",
              WebkitBackdropFilter: "blur(32px)",
              boxShadow: [
                "0 0 0 1px rgba(212,175,55,0.12)",
                "0 0 28px 6px rgba(212,175,55,0.25)",
                "0 12px 40px rgba(0,0,0,0.65)",
              ].join(", "),
              whiteSpace:    "nowrap",
            }}
          >
            {/* Edit count label */}
            <span style={{
              fontSize:      "0.72rem",
              fontWeight:    700,
              color:         editCount > 0 ? "rgba(212,175,55,0.90)" : "rgba(255,255,255,0.35)",
              fontFamily:    "'Quicksand', sans-serif",
              letterSpacing: "0.04em",
              paddingRight:  4,
              minWidth:      60,
            }}>
              {editCount > 0
                ? `${editCount} edit${editCount > 1 ? "s" : ""}`
                : "No edits yet"}
            </span>

            {/* Divider */}
            <div style={{ width: 1, alignSelf: "stretch", background: "rgba(212,175,55,0.20)" }} />

            {/* Discard */}
            <motion.button
              whileTap={{ scale: 0.90 }}
              onClick={handleDiscard}
              disabled={saving}
              style={{
                padding:       "8px 14px",
                borderRadius:  24,
                background:    "transparent",
                border:        "1px solid rgba(255,255,255,0.10)",
                color:         "rgba(255,255,255,0.45)",
                fontSize:      "0.78rem",
                fontWeight:    600,
                cursor:        "pointer",
                fontFamily:    "'Quicksand', sans-serif",
              }}
            >
              Discard
            </motion.button>

            {/* Save */}
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={handleSave}
              disabled={saving}
              style={{
                padding:       "9px 18px",
                borderRadius:  24,
                background:    saving
                  ? "rgba(100,75,0,0.70)"
                  : "linear-gradient(135deg, #D4AF37 0%, #8B6914 100%)",
                border:        "1px solid rgba(212,175,55,0.60)",
                color:         saving ? "rgba(255,255,255,0.50)" : "#0a0500",
                fontSize:      "0.84rem",
                fontWeight:    700,
                cursor:        saving ? "not-allowed" : "pointer",
                fontFamily:    "'Quicksand', sans-serif",
                boxShadow:     saving ? "none" : "0 0 16px 4px rgba(212,175,55,0.30)",
                display:       "flex",
                alignItems:    "center",
                gap:           6,
              }}
            >
              {saving ? (
                <>
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                    style={{ display: "inline-block" }}
                  >
                    ⚙
                  </motion.span>
                  Saving…
                </>
              ) : (
                <>✓ Save & Exit</>
              )}
            </motion.button>
          </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
