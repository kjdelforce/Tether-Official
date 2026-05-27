import { useState, useEffect, useRef, useCallback } from "react";
import { PullToRefresh } from "@/components/PullToRefresh";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { haptic } from "@/lib/haptics";
import { playSound } from "@/lib/audioManager";
import RedLightMatrixPage from "@/pages/RedLightMatrixPage";

// ── Constants ──────────────────────────────────────────────────────
const BUCKET  = "tether-images";
const PLAYFAIR = { fontFamily: "'Playfair Display', serif" };
const QS       = { fontFamily: "'Quicksand', sans-serif" };
const CAVEAT   = { fontFamily: "'Caveat', cursive" };

const QUESTIONS = [
  "What is my favorite childhood memory?",
  "What was the first movie we saw together?",
  "What is my biggest fear?",
  "What song instantly reminds you of me?",
  "What was I wearing the first time we met?",
  "What is my favorite comfort food?",
  "What is one thing I say way too often?",
  "What is my love language?",
  "What is my most embarrassing memory?",
  "What would be my dream vacation destination?",
  "What is the one thing I always forget to do?",
  "What was the best gift I've ever given you?",
  "What is my biggest pet peeve?",
  "What did you first notice about me?",
  "What is my favorite time of day?",
  "If I could have any superpower, what would it be?",
  "What is something I'm secretly really good at?",
  "What is my go-to karaoke song?",
  "What is the weirdest thing I've ever eaten?",
  "What is my favorite season?",
  "What is one thing on my bucket list?",
  "What is my coffee or drink order?",
  "What makes me laugh uncontrollably?",
  "What was my childhood dream job?",
  "What is my guilty pleasure TV show?",
  "What one word describes me best?",
  "What would be my perfect lazy Sunday?",
  "What do I always say I'll do but never get around to?",
  "What is my most used emoji?",
  "What is the first trip we took together?",
  "What am I most proud of?",
  "What is the weirdest thing I do when I'm alone?",
  "What is one habit of mine that drives you crazy?",
  "What is a secret talent you've discovered about me?",
  "What is my go-to comfort movie?",
];

function randomQuestion(): string {
  return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
}

// ── Types ──────────────────────────────────────────────────────────
// Stored as post_type='couples_corner' in the existing posts table.
// All metadata lives in the content JSON column; media path in image_url.
type ChallengeStatus = "waiting" | "answered" | "verifying" | "revealed" | "deleted";

interface Challenge {
  id: string;
  tether_id: string;
  uploader_id: string;  // = post.author_id
  media_path: string;   // = post.image_url
  media_type: "image" | "video";
  question_text: string;
  status: ChallengeStatus;
  answer_text: string | null;
  created_at: string;
  revealed_at: string | null;
}

// Convert a raw posts row → Challenge
function postToChallenge(row: Record<string, unknown>): Challenge {
  let meta: Record<string, unknown> = {};
  try { meta = JSON.parse(row.content as string ?? "{}"); } catch { /* empty */ }
  return {
    id:            row.id            as string,
    tether_id:     row.tether_id     as string,
    uploader_id:   row.author_id     as string,
    media_path:    row.image_url     as string ?? "",
    media_type:   (meta.mediaType    as "image" | "video") ?? "image",
    question_text:(meta.question     as string) ?? "",
    status:       (meta.status       as ChallengeStatus) ?? "waiting",
    answer_text:  (meta.answerText   as string | null) ?? null,
    created_at:    row.created_at    as string,
    revealed_at:  (meta.revealedAt   as string | null) ?? null,
  };
}

// Build the content JSON from a Challenge.
// "_cc": true acts as the marker so ScrapbookPage can exclude these 'note' rows.
function challengeContent(c: Partial<Challenge>): string {
  return JSON.stringify({
    _cc:        true,
    mediaType:  c.media_type,
    question:   c.question_text,
    status:     c.status,
    answerText: c.answer_text ?? null,
    revealedAt: c.revealed_at ?? null,
  });
}

// ── Velvet Curtain ─────────────────────────────────────────────────
const CURTAIN_BG = [
  "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.22) 100%)",
  "repeating-linear-gradient(90deg, transparent 0px, transparent 22px, rgba(0,0,0,0.07) 24px, transparent 26px)",
  "linear-gradient(135deg, #7B0000 0%, #C53030 25%, #9B1010 50%, #C53030 75%, #7B0000 100%)",
].join(", ");

function CurtainPanel({ side, open }: { side: "left" | "right"; open: boolean }) {
  return (
    <motion.div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "51%",
        left: side === "left" ? 0 : undefined,
        right: side === "right" ? 0 : undefined,
        background: CURTAIN_BG,
        zIndex: 10,
        overflow: "hidden",
      }}
      animate={
        open
          ? { x: side === "left" ? "-100%" : "100%", transition: { type: "spring", stiffness: 80, damping: 20 } }
          : { x: 0, transition: { duration: 0.3 } }
      }
    >
      {/* Sheen highlight */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 12,
          background: "rgba(255,255,255,0.06)",
          left: side === "left" ? "auto" : 0,
          right: side === "left" ? 0 : "auto",
        }}
      />
      {/* Fold lines */}
      {[15, 40, 65].map(pct => (
        <div
          key={pct}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 1.5,
            left: `${pct}%`,
            background: "rgba(0,0,0,0.12)",
          }}
        />
      ))}
    </motion.div>
  );
}

function VelvetCurtain({
  open,
  label,
}: {
  open: boolean;
  label?: string;
}) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 10, overflow: "hidden" }}>
      <CurtainPanel side="left"  open={open} />
      <CurtainPanel side="right" open={open} />

      {/* Center text shown only when closed */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 20,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              gap: 8,
            }}
          >
            <span style={{ fontSize: "2.5rem" }}>🎭</span>
            {label && (
              <p style={{ ...PLAYFAIR, color: "rgba(255,255,255,0.75)", fontSize: "0.85rem", textAlign: "center", maxWidth: 140 }}>
                {label}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Glass section header ───────────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ ...QS, color: "rgba(147,197,253,0.7)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>
      {children}
    </p>
  );
}

// ── Glass card wrapper ─────────────────────────────────────────────
function GlassCard({ children, crimson, style }: { children: React.ReactNode; crimson?: boolean; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: crimson ? "rgba(197,48,48,0.15)" : "rgba(255,255,255,0.08)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${crimson ? "rgba(197,48,48,0.3)" : "rgba(255,255,255,0.10)"}`,
        borderRadius: 16,
        boxShadow: crimson
          ? "0 4px 24px rgba(197,48,48,0.15), inset 0 1px 0 rgba(255,255,255,0.08)"
          : "0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Crimson gradient button ────────────────────────────────────────
function CrimsonButton({ children, onClick, disabled, outline }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; outline?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "12px 24px",
        borderRadius: 14,
        border: outline ? "1.5px solid rgba(197,48,48,0.6)" : "none",
        background: outline
          ? "rgba(197,48,48,0.1)"
          : disabled
            ? "rgba(80,40,40,0.5)"
            : "linear-gradient(135deg, #C53030 0%, #7B1313 100%)",
        color: "white",
        fontSize: "0.9rem",
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: outline ? "none" : disabled ? "none" : "0 4px 18px rgba(197,48,48,0.38), inset 0 1px 0 rgba(255,255,255,0.15)",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.2s",
        ...QS,
      }}
    >
      {children}
    </button>
  );
}

// ── Signed URL helper ──────────────────────────────────────────────
async function getSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

// ── Media preview thumbnail ────────────────────────────────────────
function MediaThumb({ mediaType }: { mediaType: "image" | "video" }) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "16/9",
        background: "rgba(0,0,0,0.3)",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "2.5rem",
        color: "rgba(255,255,255,0.3)",
      }}
    >
      {mediaType === "video" ? "🎬" : "🖼️"}
    </div>
  );
}

// ── Create Challenge flow ──────────────────────────────────────────
function CreateFlow({
  tetherId,
  uploaderId,
  partnerName,
  onCreated,
}: {
  tetherId: string;
  uploaderId: string;
  partnerName: string;
  onCreated: () => void;
}) {
  const [file,       setFile]       = useState<File | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);
  const [mediaType,  setMediaType]  = useState<"image" | "video">("image");
  const [question,   setQuestion]   = useState(() => randomQuestion());
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    const isVideo = f.type.startsWith("video/");
    setMediaType(isVideo ? "video" : "image");
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
    haptic("light");
  }

  async function submit() {
    if (!file) return;
    setUploading(true);
    setError(null);

    const ext  = file.name.split(".").pop() ?? (mediaType === "video" ? "mp4" : "jpg");
    const path = `${tetherId}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (upErr) { setError(upErr.message); setUploading(false); return; }

    const { error: dbErr } = await supabase.from("posts").insert({
      tether_id:  tetherId,
      author_id:  uploaderId,
      post_type:  "note",
      image_url:  path,
      content:    challengeContent({
        media_type:    mediaType,
        question_text: question,
        status:        "waiting",
        answer_text:   null,
        revealed_at:   null,
      }),
    });

    if (dbErr) {
      await supabase.storage.from(BUCKET).remove([path]);
      setError(dbErr.message);
      setUploading(false);
      return;
    }

    haptic("success");
    onCreated();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SectionLabel>New Mystery Challenge</SectionLabel>

      {/* File picker */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        style={{ display: "none" }}
        onChange={pickFile}
      />

      {!file ? (
        <GlassCard style={{ padding: 32, textAlign: "center" }}>
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              width: "100%",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "white",
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #C53030 0%, #7B1313 100%)",
                boxShadow: "0 0 32px rgba(197,48,48,0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "2rem",
              }}
            >
              📸
            </div>
            <p style={{ ...PLAYFAIR, fontSize: "1rem", color: "white" }}>Choose a Photo or Video</p>
            <p style={{ ...QS, fontSize: "0.78rem", color: "rgba(147,197,253,0.6)" }}>
              Hidden behind a velvet curtain — {partnerName} must answer a question to reveal it
            </p>
          </button>
        </GlassCard>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Preview */}
          <GlassCard style={{ padding: 14, position: "relative" }}>
            {mediaType === "image" ? (
              <img src={preview!} alt="preview" style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 220 }} />
            ) : (
              <video src={preview!} controls style={{ width: "100%", borderRadius: 10, maxHeight: 220 }} />
            )}
            <button
              onClick={() => { setFile(null); setPreview(null); }}
              style={{
                position: "absolute",
                top: 20,
                right: 20,
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.6)",
                border: "none",
                color: "white",
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              ✕
            </button>
          </GlassCard>

          {/* Question */}
          <GlassCard crimson style={{ padding: "14px 18px" }}>
            <p style={{ ...QS, color: "rgba(252,129,129,0.8)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
              {partnerName} will be asked
            </p>
            <p style={{ ...PLAYFAIR, color: "white", fontSize: "1rem", lineHeight: 1.45 }}>
              "{question}"
            </p>
            <button
              onClick={() => setQuestion(randomQuestion())}
              style={{ ...QS, marginTop: 10, background: "none", border: "none", color: "rgba(252,129,129,0.55)", fontSize: "0.75rem", cursor: "pointer", padding: 0 }}
            >
              ↻ use a different question
            </button>
          </GlassCard>

          {error && (
            <p style={{ ...QS, color: "#FC8181", fontSize: "0.8rem" }}>{error}</p>
          )}

          <CrimsonButton onClick={submit} disabled={uploading}>
            {uploading ? "Uploading…" : "Send Challenge 🎭"}
          </CrimsonButton>
        </div>
      )}
    </div>
  );
}

// ── Uploader waiting view ──────────────────────────────────────────
function UploaderWaitingView({
  challenge,
  partnerName,
}: {
  challenge: Challenge;
  partnerName: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel>{`Waiting for ${partnerName}`}</SectionLabel>

      {/* Media hidden behind curtain */}
      <GlassCard style={{ padding: 14 }}>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9" }}>
          <MediaThumb mediaType={challenge.media_type} />
          <VelvetCurtain open={false} label="Your mystery is hidden" />
        </div>
      </GlassCard>

      {/* Question */}
      <GlassCard crimson style={{ padding: "14px 18px" }}>
        <p style={{ ...QS, color: "rgba(252,129,129,0.8)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          Question sent to {partnerName}
        </p>
        <p style={{ ...PLAYFAIR, color: "white", fontSize: "1rem", lineHeight: 1.45 }}>
          "{challenge.question_text}"
        </p>
      </GlassCard>

      {/* Status */}
      <GlassCard style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <motion.span
          style={{ fontSize: "1.5rem" }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          ⏳
        </motion.span>
        <div>
          <p style={{ ...QS, color: "rgba(255,255,255,0.8)", fontSize: "0.9rem", fontWeight: 600 }}>
            Waiting for {partnerName} to answer…
          </p>
          <p style={{ ...QS, color: "rgba(147,197,253,0.5)", fontSize: "0.75rem", marginTop: 2 }}>
            You'll be notified when they submit
          </p>
        </div>
      </GlassCard>
    </div>
  );
}

// ── Recipient question + answer view ──────────────────────────────
function RecipientAnswerView({
  challenge,
  profileId,
  onSubmit,
}: {
  challenge: Challenge;
  profileId: string;
  onSubmit: (answer: string) => Promise<void>;
}) {
  const [answer,     setAnswer]     = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!answer.trim()) return;
    setSubmitting(true);
    await onSubmit(answer.trim());
    setSubmitting(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel>Mystery Reveal 🎭</SectionLabel>

      {/* Curtained media */}
      <GlassCard style={{ padding: 14 }}>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9" }}>
          <div style={{ width: "100%", height: "100%", background: "rgba(0,0,0,0.2)" }} />
          <VelvetCurtain open={false} label="Answer to reveal" />
        </div>
      </GlassCard>

      {/* Question card */}
      <GlassCard crimson style={{ padding: "16px 18px" }}>
        <p style={{ ...QS, color: "rgba(252,129,129,0.8)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
          Answer this to reveal the mystery
        </p>
        <p style={{ ...PLAYFAIR, color: "white", fontSize: "1.05rem", lineHeight: 1.5 }}>
          "{challenge.question_text}"
        </p>
      </GlassCard>

      {/* Answer input */}
      <GlassCard style={{ padding: "14px 16px" }}>
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder="Type your answer here…"
          rows={3}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: "12px 14px",
            color: "white",
            fontSize: "1rem",
            resize: "none",
            outline: "none",
            ...CAVEAT,
            boxSizing: "border-box",
          }}
        />
        <div style={{ marginTop: 12 }}>
          <CrimsonButton onClick={handleSubmit} disabled={!answer.trim() || submitting}>
            {submitting ? "Submitting…" : "Submit My Answer"}
          </CrimsonButton>
        </div>
      </GlassCard>
    </div>
  );
}

// ── Recipient waiting for verify ───────────────────────────────────
function RecipientWaitingVerify({ uploaderName }: { uploaderName: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel>Answer Submitted</SectionLabel>
      <GlassCard style={{ padding: 14 }}>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9" }}>
          <div style={{ width: "100%", height: "100%", background: "rgba(0,0,0,0.2)" }} />
          <VelvetCurtain open={false} label="Almost there…" />
        </div>
      </GlassCard>
      <GlassCard style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <motion.span
          style={{ fontSize: "1.5rem" }}
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          🔍
        </motion.span>
        <div>
          <p style={{ ...QS, color: "rgba(255,255,255,0.85)", fontSize: "0.9rem", fontWeight: 600 }}>
            {uploaderName} is checking your answer…
          </p>
          <p style={{ ...QS, color: "rgba(147,197,253,0.5)", fontSize: "0.75rem", marginTop: 2 }}>
            The curtain will open if you're correct!
          </p>
        </div>
      </GlassCard>
    </div>
  );
}

// ── Uploader verify view ───────────────────────────────────────────
function VerifyView({
  challenge,
  partnerName,
  onVerify,
}: {
  challenge: Challenge;
  partnerName: string;
  onVerify: (correct: boolean) => Promise<void>;
}) {
  const [verifying, setVerifying] = useState(false);

  async function handle(correct: boolean) {
    setVerifying(true);
    haptic(correct ? "celebration" : "error");
    await onVerify(correct);
    setVerifying(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel>{`Verify ${partnerName}'s Answer`}</SectionLabel>

      <GlassCard style={{ padding: 14 }}>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9" }}>
          <MediaThumb mediaType={challenge.media_type} />
          <VelvetCurtain open={false} label="Pending reveal" />
        </div>
      </GlassCard>

      <GlassCard crimson style={{ padding: "16px 18px" }}>
        <p style={{ ...QS, color: "rgba(252,129,129,0.8)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          Question
        </p>
        <p style={{ ...PLAYFAIR, color: "white", fontSize: "0.95rem", lineHeight: 1.45, marginBottom: 14 }}>
          "{challenge.question_text}"
        </p>
        <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 12 }} />
        <p style={{ ...QS, color: "rgba(252,129,129,0.8)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          {partnerName}'s Answer
        </p>
        <p style={{ ...CAVEAT, color: "white", fontSize: "1.1rem", lineHeight: 1.5 }}>
          {challenge.answer_text}
        </p>
      </GlassCard>

      {/* Verify buttons */}
      <GlassCard style={{ padding: "16px 18px" }}>
        <p style={{ ...QS, color: "rgba(255,255,255,0.6)", fontSize: "0.8rem", marginBottom: 14, textAlign: "center" }}>
          Is {partnerName}'s answer correct?
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => handle(false)}
            disabled={verifying}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.07)",
              backdropFilter: "blur(12px)",
              border: "1.5px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.7)",
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: verifying ? "not-allowed" : "pointer",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
              ...QS,
            }}
          >
            ❌ Incorrect
          </button>
          <button
            onClick={() => handle(true)}
            disabled={verifying}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 14,
              background: "linear-gradient(135deg, #C53030 0%, #7B1313 100%)",
              border: "none",
              color: "white",
              fontSize: "0.9rem",
              fontWeight: 700,
              cursor: verifying ? "not-allowed" : "pointer",
              boxShadow: "0 4px 18px rgba(197,48,48,0.38), inset 0 1px 0 rgba(255,255,255,0.15)",
              ...QS,
            }}
          >
            ✓ Correct!
          </button>
        </div>
      </GlassCard>
    </div>
  );
}

// ── Try again banner (recipient wrong answer) ─────────────────────
function TryAgainView({
  challenge,
  onRetry,
}: {
  challenge: Challenge;
  onRetry: (answer: string) => Promise<void>;
}) {
  const [answer, setAnswer]     = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!answer.trim()) return;
    setSubmitting(true);
    await onRetry(answer.trim());
    setSubmitting(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel>Almost! Try Again</SectionLabel>
      <GlassCard style={{ padding: 14 }}>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "16/9" }}>
          <div style={{ width: "100%", height: "100%", background: "rgba(0,0,0,0.2)" }} />
          <VelvetCurtain open={false} label="So close…" />
        </div>
      </GlassCard>
      <GlassCard crimson style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: "1.4rem" }}>❌</span>
        <p style={{ ...QS, color: "rgba(252,129,129,0.9)", fontSize: "0.9rem" }}>
          That wasn't quite right. Give it another try!
        </p>
      </GlassCard>
      <GlassCard style={{ padding: "14px 16px" }}>
        <p style={{ ...QS, color: "rgba(147,197,253,0.7)", fontSize: "0.78rem", marginBottom: 10 }}>
          "{challenge.question_text}"
        </p>
        <textarea
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder="Try again…"
          rows={3}
          style={{
            width: "100%",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: "12px 14px",
            color: "white",
            fontSize: "1rem",
            resize: "none",
            outline: "none",
            ...CAVEAT,
            boxSizing: "border-box",
          }}
        />
        <div style={{ marginTop: 12 }}>
          <CrimsonButton onClick={handleSubmit} disabled={!answer.trim() || submitting}>
            {submitting ? "Submitting…" : "Try Again"}
          </CrimsonButton>
        </div>
      </GlassCard>
    </div>
  );
}

// ── Reveal view ────────────────────────────────────────────────────
function RevealView({
  challenge,
  isRecipient,
  onDestruct,
}: {
  challenge: Challenge;
  isRecipient: boolean;
  onDestruct: () => Promise<void>;
}) {
  const [mediaUrl,     setMediaUrl]     = useState<string | null>(null);
  const [curtainOpen,  setCurtainOpen]  = useState(false);
  const [destructing,  setDestructing]  = useState(false);
  const [downloaded,   setDownloaded]   = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await getSignedUrl(challenge.media_path);
      if (!cancelled && url) {
        setMediaUrl(url);
        // slight delay then open curtain for drama
        setTimeout(() => {
          if (!cancelled) {
            setCurtainOpen(true);
            haptic("reveal");
            playSound("whoosh");
            setTimeout(() => { if (!cancelled) playSound("sparkle"); }, 600);
          }
        }, 500);
      }
    })();
    return () => { cancelled = true; };
  }, [challenge.media_path]);

  async function handleDownload() {
    if (!mediaUrl) return;
    haptic("tap");
    const a = document.createElement("a");
    a.href = mediaUrl;
    a.download = `couples-corner-${Date.now()}.${challenge.media_type === "video" ? "mp4" : "jpg"}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
    setDownloaded(true);
  }

  async function handleDestruct() {
    setDestructing(true);
    haptic("error");
    await onDestruct();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel>Mystery Revealed ✨</SectionLabel>

      {/* Media + curtain */}
      <GlassCard style={{ padding: 14 }}>
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden" }}>
          {mediaUrl ? (
            challenge.media_type === "image" ? (
              <img
                src={mediaUrl}
                alt="Revealed"
                style={{ width: "100%", display: "block", borderRadius: 12, maxHeight: 320, objectFit: "cover" }}
              />
            ) : (
              <video
                src={mediaUrl}
                controls
                autoPlay
                style={{ width: "100%", display: "block", borderRadius: 12, maxHeight: 320 }}
              />
            )
          ) : (
            <div style={{ aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
                ⏳
              </motion.div>
            </div>
          )}
          <VelvetCurtain open={curtainOpen} />
        </div>
      </GlassCard>

      {/* Actions — only recipient sees the destruct controls */}
      {isRecipient && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Download first */}
          {!downloaded ? (
            <button
              onClick={handleDownload}
              style={{
                padding: "13px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(12px)",
                border: "1.5px solid rgba(255,255,255,0.18)",
                color: "white",
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                ...QS,
              }}
            >
              ⬇️ Save to Camera Roll
            </button>
          ) : (
            <GlassCard style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <span>✅</span>
              <p style={{ ...QS, color: "rgba(104,211,145,0.9)", fontSize: "0.85rem" }}>Saved!</p>
            </GlassCard>
          )}

          {/* Self-destruct */}
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              style={{
                padding: "13px",
                borderRadius: 14,
                background: "rgba(197,48,48,0.12)",
                border: "1.5px solid rgba(197,48,48,0.3)",
                color: "rgba(252,129,129,0.9)",
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                ...QS,
              }}
            >
              💣 Close & Self-Destruct
            </button>
          ) : (
            <GlassCard crimson style={{ padding: "14px 18px" }}>
              <p style={{ ...QS, color: "white", fontSize: "0.85rem", marginBottom: 12, textAlign: "center" }}>
                {!downloaded ? "⚠️ You haven't saved it yet! Are you sure?" : "This will permanently delete the file. No going back!"}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setShowConfirm(false)}
                  style={{ flex: 1, padding: "10px", borderRadius: 12, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", cursor: "pointer", ...QS }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDestruct}
                  disabled={destructing}
                  style={{ flex: 1, padding: "10px", borderRadius: 12, background: "linear-gradient(135deg, #C53030, #7B1313)", border: "none", color: "white", cursor: destructing ? "wait" : "pointer", fontWeight: 700, ...QS }}
                >
                  {destructing ? "Deleting…" : "Delete 💣"}
                </button>
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {!isRecipient && (
        <GlassCard style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.3rem" }}>✨</span>
          <p style={{ ...QS, color: "rgba(147,197,253,0.75)", fontSize: "0.85rem" }}>
            They can see the reveal on their end!
          </p>
        </GlassCard>
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────
function EmptyState({
  partnerProfile,
  onCreate,
}: {
  partnerProfile: { full_name: string } | null;
  onCreate: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, paddingTop: 20 }}>
      <GlassCard style={{ padding: "36px 28px", textAlign: "center", width: "100%" }}>
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          style={{ fontSize: "4rem", marginBottom: 18, willChange: "transform" }}
        >
          🎭
        </motion.div>
        <h2 style={{ ...PLAYFAIR, color: "white", fontSize: "1.4rem", marginBottom: 10 }}>
          Couple's Corner
        </h2>
        <p style={{ ...QS, color: "rgba(147,197,253,0.65)", fontSize: "0.85rem", lineHeight: 1.6, marginBottom: 24 }}>
          Send a mystery photo or video hidden behind a velvet curtain.
          {partnerProfile ? ` ${partnerProfile.full_name} must answer a question to reveal it.` : ""}
        </p>
        {partnerProfile ? (
          <CrimsonButton onClick={onCreate}>
            Create a Mystery 🎭
          </CrimsonButton>
        ) : (
          <p style={{ ...QS, color: "rgba(147,197,253,0.4)", fontSize: "0.8rem" }}>
            Link with your partner first to start
          </p>
        )}
      </GlassCard>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────
type CornerSubTab = "corner" | "matrix";

export default function CouplesCornerPage() {
  const { profile, partnerProfile, tether } = useAuth();

  const [subTab,       setSubTab]       = useState<CornerSubTab>("corner");
  const [challenge,    setChallenge]    = useState<Challenge | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [creating,     setCreating]     = useState(false);
  const [confirmDel,   setConfirmDel]   = useState(false);
  const [deleting,     setDeleting]     = useState(false);

  // ── Status derived from challenge ────────────────────────────────
  const isUploader  = challenge?.uploader_id === profile?.id;
  const isRecipient = !!challenge && !isUploader;

  // ── Fetch active challenge (uses posts table — no extra SQL needed) ──
  const fetchChallenge = useCallback(async () => {
    if (!tether) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .eq("tether_id", tether.id)
      .eq("post_type", "note")
      .ilike("content", '%"_cc":true%')
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const active = rows
      .map(postToChallenge)
      .find(c => c.status !== "deleted") ?? null;
    setChallenge(active);
    setLoading(false);
  }, [tether]);

  useEffect(() => { fetchChallenge(); }, [fetchChallenge]);

  // ── Real-time subscription ───────────────────────────────────────
  useEffect(() => {
    if (!tether) return;

    const channel = supabase
      .channel(`cc-posts-${tether.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "posts",
        filter: `tether_id=eq.${tether.id}`,
      }, payload => {
        const raw = payload.new as Record<string, unknown>;
        if (!raw || raw.post_type !== "note") return;
        let meta: Record<string, unknown> = {};
        try { meta = JSON.parse(raw.content as string ?? "{}"); } catch { /* */ }
        if (!meta._cc) return;
        const c = postToChallenge(raw);
        if (c.status !== "deleted") {
          setChallenge(c);
          setCreating(false);
          if (c.status === "revealed") haptic("reveal");
        } else {
          setChallenge(null);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tether]);

  // ── Helper: update content JSON in posts row ─────────────────────
  async function updateChallengeContent(patch: Partial<Challenge>) {
    if (!challenge) return;
    const merged = { ...challenge, ...patch };
    await supabase
      .from("posts")
      .update({ content: challengeContent(merged) })
      .eq("id", challenge.id);
  }

  // ── Actions ──────────────────────────────────────────────────────
  async function submitAnswer(answer: string) {
    await updateChallengeContent({ status: "answered", answer_text: answer });
  }

  async function retryAnswer(answer: string) {
    await updateChallengeContent({ status: "answered", answer_text: answer });
  }

  async function verifyAnswer(correct: boolean) {
    if (correct) {
      await updateChallengeContent({ status: "revealed", revealed_at: new Date().toISOString() });
    } else {
      await updateChallengeContent({ status: "waiting", answer_text: null });
    }
  }

  async function selfDestruct() {
    if (!challenge) return;
    await supabase.storage.from(BUCKET).remove([challenge.media_path]);
    await supabase.from("posts").delete().eq("id", challenge.id);
    setChallenge(null);
    haptic("tap");
  }

  async function handleDelete() {
    setDeleting(true);
    await selfDestruct();
    setConfirmDel(false);
    setDeleting(false);
  }

  // ── Render ───────────────────────────────────────────────────────
  const partnerName = partnerProfile?.full_name ?? "your partner";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Sub-tab switcher ── */}
      <div style={{
        display: "flex",
        gap: 6,
        padding: "10px 16px 8px",
        background: "rgba(10,10,20,0.95)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        zIndex: 10,
        flexShrink: 0,
      }}>
        {([
          { id: "corner" as const,  label: "🎭  Mystery Reveal" },
          { id: "matrix" as const,  label: "🔴  Red Light Matrix" },
        ] as { id: CornerSubTab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => { haptic("light"); setSubTab(t.id); }}
            style={{
              flex: 1,
              padding: "8px 4px",
              borderRadius: "0.75rem",
              border: subTab === t.id
                ? "1px solid rgba(197,48,48,0.5)"
                : "1px solid rgba(255,255,255,0.07)",
              background: subTab === t.id
                ? "linear-gradient(135deg, rgba(197,48,48,0.20), rgba(113,28,28,0.12))"
                : "rgba(255,255,255,0.04)",
              color: subTab === t.id ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
              fontSize: "0.72rem",
              fontWeight: subTab === t.id ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.2s",
              letterSpacing: "0.01em",
              ...QS,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Red Light Matrix ── */}
      {subTab === "matrix" && (
        <div style={{ flex: 1, minHeight: 0, overflowX: "hidden" }}>
          <RedLightMatrixPage />
        </div>
      )}

      {/* ── Couples Corner content ── */}
      {subTab === "corner" && (
    <PullToRefresh
      onRefresh={fetchChallenge}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
        paddingTop: 20,
        paddingLeft: 20,
        paddingRight: 20,
        gap: 0,
      }}
    >
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ ...QS, color: "rgba(147,197,253,0.7)", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 4 }}>
          Couple's Corner
        </p>
        <h1 style={{ ...PLAYFAIR, color: "white", fontSize: "1.6rem", lineHeight: 1.2 }}>
          Mystery Reveal 🎭
        </h1>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ height: 80, borderRadius: 20, background: "rgba(255,255,255,0.05)", animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      )}

      {/* Content */}
      {!loading && (
        <>
          {/* ── Creating new challenge ── */}
          {creating && profile && tether && (
            <CreateFlow
              tetherId={tether.id}
              uploaderId={profile.id}
              partnerName={partnerName}
              onCreated={() => { setCreating(false); fetchChallenge(); }}
            />
          )}

          {/* ── No active challenge ── */}
          {!creating && !challenge && (
            <EmptyState
              partnerProfile={partnerProfile}
              onCreate={() => { haptic("medium"); setCreating(true); }}
            />
          )}

          {/* ── Active challenge states ── */}
          {!creating && challenge && (() => {
            switch (challenge.status) {
              case "waiting":
                return isUploader
                  ? <UploaderWaitingView challenge={challenge} partnerName={partnerName} />
                  : <RecipientAnswerView challenge={challenge} profileId={profile!.id} onSubmit={submitAnswer} />;

              case "answered":
                return isUploader
                  ? <VerifyView challenge={challenge} partnerName={partnerName} onVerify={verifyAnswer} />
                  : <RecipientWaitingVerify uploaderName={partnerName} />;

              case "verifying":
                return isUploader
                  ? <VerifyView challenge={challenge} partnerName={partnerName} onVerify={verifyAnswer} />
                  : <RecipientWaitingVerify uploaderName={partnerName} />;

              case "revealed":
                return (
                  <RevealView
                    challenge={challenge}
                    isRecipient={isRecipient}
                    onDestruct={selfDestruct}
                  />
                );

              default:
                return null;
            }
          })()}

          {/* ── Delete button — visible for in-progress challenges (revealed state has its own) ── */}
          {!creating && challenge && challenge.status !== "revealed" && (
            <div style={{ marginTop: 8 }}>
              {!confirmDel ? (
                <button
                  onClick={() => { haptic("light"); setConfirmDel(true); }}
                  style={{
                    width: "100%",
                    padding: "11px",
                    borderRadius: 14,
                    background: "rgba(197,48,48,0.08)",
                    border: "1px solid rgba(197,48,48,0.2)",
                    color: "rgba(252,129,129,0.6)",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    ...QS,
                  }}
                >
                  🗑 Delete challenge
                </button>
              ) : (
                <GlassCard crimson style={{ padding: "14px 18px" }}>
                  <p style={{ ...QS, color: "white", fontSize: "0.85rem", marginBottom: 12, textAlign: "center" }}>
                    Delete this challenge permanently?
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => setConfirmDel(false)}
                      style={{
                        flex: 1, padding: "10px", borderRadius: 12,
                        background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "rgba(255,255,255,0.7)", cursor: "pointer", ...QS,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      style={{
                        flex: 1, padding: "10px", borderRadius: 12,
                        background: "linear-gradient(135deg, #C53030, #7B1313)",
                        border: "none", color: "white",
                        cursor: deleting ? "wait" : "pointer",
                        fontWeight: 700, ...QS,
                      }}
                    >
                      {deleting ? "Deleting…" : "Delete 🗑"}
                    </button>
                  </div>
                </GlassCard>
              )}
            </div>
          )}
        </>
      )}
    </PullToRefresh>
      )}
    </div>
  );
}
