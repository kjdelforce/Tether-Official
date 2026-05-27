// ════════════════════════════════════════════════════════════════
//  EditableText — Tap-to-Edit wrapper for Architect Mode
//
//  Usage:
//    <EditableText id="home.title" fallback="Tether" tag="h1" style={...} />
//
//  Normal mode: renders text inside `tag` as-is — zero layout impact.
//
//  Edit mode (Kyle only):
//    • The text gains a subtle gold shimmer border and a ✏ badge.
//    • Layout is completely UNCHANGED — the text still displays normally.
//    • Tapping opens a compact popup sheet (portalled to body) to edit.
//    • Changes are queued; nothing saves until the footer "Save" button.
//    • Navigation, back buttons and all other UI remain fully clickable.
//
//  Nathan never sees any of this — isEditMode is always false for him.
// ════════════════════════════════════════════════════════════════
import React, { useState, useRef, CSSProperties } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useEditMode } from "@/lib/EditModeContext";
import { haptic } from "@/lib/haptics";

interface EditableTextProps {
  id: string;
  fallback: string;
  tag?: keyof JSX.IntrinsicElements;
  className?: string;
  style?: CSSProperties;
  children?: never;
}

// ── Inline edit popup (portalled) ──────────────────────────────
function EditPopup({
  id,
  value,
  onSave,
  onClose,
}: {
  id: string;
  value: string;
  onSave: (v: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function handleDone() {
    haptic("light");
    onSave(draft);
    onClose();
  }

  const label = id.replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="edit-popup-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{
          position:       "fixed",
          inset:          0,
          zIndex:         10100,
          background:     "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          padding:        "20px 18px",
        }}
      >
        <motion.div
          key="edit-popup-card"
          initial={{ scale: 0.88, opacity: 0, y: 24 }}
          animate={{ scale: 1,    opacity: 1, y: 0  }}
          exit={{   scale: 0.92,  opacity: 0, y: 12 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          onClick={e => e.stopPropagation()}
          style={{
            width:          "100%",
            maxWidth:       360,
            background:     "linear-gradient(160deg, rgba(30,12,0,0.97) 0%, rgba(8,4,20,0.98) 100%)",
            border:         "1.5px solid rgba(212,175,55,0.45)",
            borderRadius:   22,
            padding:        "20px 18px 16px",
            boxShadow: [
              "0 0 0 1px rgba(212,175,55,0.15)",
              "0 0 36px 8px rgba(212,175,55,0.18)",
              "0 24px 60px rgba(0,0,0,0.70)",
            ].join(", "),
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: "0.9rem" }}>✏️</span>
            <p style={{
              fontSize:      "0.68rem",
              fontWeight:    700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color:         "rgba(212,175,55,0.75)",
              fontFamily:    "'Quicksand', sans-serif",
              margin:        0,
            }}>
              {label}
            </p>
          </div>

          {/* Textarea */}
          <textarea
            ref={taRef}
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            style={{
              width:         "100%",
              boxSizing:     "border-box",
              background:    "rgba(212,175,55,0.06)",
              border:        "1.5px solid rgba(212,175,55,0.38)",
              borderRadius:  12,
              padding:       "10px 12px",
              color:         "rgba(255,255,255,0.92)",
              fontSize:      "0.97rem",
              fontFamily:    "'Quicksand', sans-serif",
              lineHeight:    1.5,
              resize:        "vertical",
              outline:       "none",
              caretColor:    "#D4AF37",
              boxShadow:     "0 0 12px rgba(212,175,55,0.12)",
            }}
          />

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={onClose}
              style={{
                flex:          "0 0 auto",
                padding:       "10px 18px",
                borderRadius:  14,
                background:    "rgba(255,255,255,0.06)",
                border:        "1px solid rgba(255,255,255,0.10)",
                color:         "rgba(255,255,255,0.50)",
                fontSize:      "0.82rem",
                fontWeight:    600,
                cursor:        "pointer",
                fontFamily:    "'Quicksand', sans-serif",
              }}
            >
              Cancel
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleDone}
              style={{
                flex:          "1 1 auto",
                padding:       "10px 18px",
                borderRadius:  14,
                background:    "linear-gradient(135deg, #D4AF37 0%, #8B6914 100%)",
                border:        "1px solid rgba(212,175,55,0.55)",
                color:         "#0a0500",
                fontSize:      "0.88rem",
                fontWeight:    700,
                cursor:        "pointer",
                fontFamily:    "'Quicksand', sans-serif",
                boxShadow:     "0 0 18px 4px rgba(212,175,55,0.30)",
              }}
            >
              ✓ Done
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ── Main component ──────────────────────────────────────────────
export function EditableText({
  id,
  fallback,
  tag: Tag = "span",
  className,
  style,
}: EditableTextProps) {
  const { isEditMode, getContent, setEdit } = useEditMode();
  const [popupOpen, setPopupOpen] = useState(false);
  const value = getContent(id, fallback);

  // Not in edit mode — render as-is, zero overhead
  if (!isEditMode) {
    return (
      <Tag className={className} style={style}>
        {value}
      </Tag>
    );
  }

  // ── Edit mode — tappable highlight, popup on tap ───────────────
  return (
    <>
      <Tag
        className={className}
        onClick={e => {
          e.stopPropagation();
          haptic("light");
          setPopupOpen(true);
        }}
        style={{
          ...style,
          // Gold shimmer border — visually indicates editable
          outline:       "1.5px dashed rgba(212,175,55,0.65)",
          outlineOffset: "3px",
          borderRadius:  4,
          cursor:        "pointer",
          position:      "relative",
          // Subtle gold glow behind the text
          textShadow:    "0 0 12px rgba(212,175,55,0.22)",
          // Small pulse shadow so Kyle immediately sees what's tappable
          boxShadow:     "0 0 0 2px rgba(212,175,55,0.10)",
          userSelect:    "none",
          WebkitUserSelect: "none",
        }}
      >
        {value}
      </Tag>

      {popupOpen && (
        <EditPopup
          id={id}
          value={value}
          onSave={v => setEdit(id, v)}
          onClose={() => setPopupOpen(false)}
        />
      )}
    </>
  );
}
