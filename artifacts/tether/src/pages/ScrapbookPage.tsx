import scrapbookCoverImg from "@assets/IMG_4208_1776201891439.jpeg";
import { useAuth } from "@/lib/AuthContext";
import { supabase, Post } from "@/lib/supabaseClient";
import {
  useEffect, useState, useRef, useCallback, useMemo,
} from "react";
import { createPortal } from "react-dom";
import {
  motion, AnimatePresence, useMotionValue, animate, MotionValue,
} from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { PullToRefresh } from "@/components/PullToRefresh";
import { usePageTurn } from "@/hooks/usePageTurn";
import { PageTurnLayer } from "@/components/PageTurnLayer";

const BUCKET = "tether-images";

// ── Utilities ─────────────────────────────────────────────────────
function seededN(seed: number, salt: number): number {
  let h = ((seed + 1) * 2654435761 + salt * 1234567) | 0;
  h = ((h ^ (h >>> 16)) * 0x45d9f3b) | 0;
  return ((h >>> 0) % 1000) / 1000;
}
function seededStr(id: string, salt: number): number {
  let h = salt * 2654435761;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i) + i * 7) | 0;
  return ((h >>> 0) % 1000) / 1000;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });
}
function sortChron(items: Post[]): Post[] {
  return [...items].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

// ── Framer Motion variants ────────────────────────────────────────
const PAGE_VARS = {
  enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (d: number) => ({ x: d > 0 ? "-15%" : "15%", opacity: 0 }),
};
const PAGE_TRANS = {
  type: "spring" as const, stiffness: 260, damping: 28, mass: 0.85,
};

// ── Archival paper bg ─────────────────────────────────────────────
const PAPER_BG = [
  "radial-gradient(ellipse at 12% 22%, rgba(200,180,150,0.10) 0%, transparent 55%)",
  "radial-gradient(ellipse at 82% 75%, rgba(180,160,125,0.07) 0%, transparent 48%)",
  "linear-gradient(168deg, #faf6ef 0%, #f5f0e5 55%, #efe9dc 100%)",
].join(", ");

// ═══════════════════════════════════════════════════════════════════
// ScrapbookPage — root component
// ═══════════════════════════════════════════════════════════════════
export default function ScrapbookPage() {
  const { profile, partnerProfile, tether } = useAuth();
  const { toast } = useToast();

  const [posts,   setPosts]   = useState<Post[]>([]);
  const [notes,   setNotes]   = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // Orientation
  const [isLandscape, setIsLandscape] = useState(
    () => window.innerWidth > window.innerHeight,
  );

  // Phase: portrait → expanding → opening-cover → reading
  type Phase = "portrait" | "expanding" | "opening-cover" | "reading";
  const [phase, setPhase] = useState<Phase>("portrait");
  const phaseRef = useRef<Phase>("portrait");
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Cover 3D rotation (motionValue so it never re-renders)
  const coverY = useMotionValue(0);

  // Page navigation
  const [pageIdx, setPageIdx] = useState(0);
  const [navDir,  setNavDir]  = useState(1);

  // Add form
  const [showForm,     setShowForm]     = useState(false);
  const [uploadMode,   setUploadMode]   = useState<"note" | "image">("image");
  const [noteText,     setNoteText]     = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [imageFile,    setImageFile]    = useState<File | null>(null);
  const [imageCaption, setImageCaption] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Data fetch ──────────────────────────────────────────────────
  useEffect(() => {
    if (!tether) { setLoading(false); return; }
    fetchPosts();
  }, [tether]);

  // ── Supabase Realtime ───────────────────────────────────────────
  useEffect(() => {
    if (!tether) return;
    const ch = supabase.channel(`scrapbook-rt-${tether.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "posts",
        filter: `tether_id=eq.${tether.id}`,
      }, ({ new: p }) => {
        const post = p as Post;
        if (post.post_type === "image") {
          setPosts(prev => prev.find(x => x.id === post.id) ? prev : [post, ...prev]);
        } else if (!post.content?.includes('"_cc":true')) {
          setNotes(prev => prev.find(x => x.id === post.id) ? prev : [post, ...prev]);
        }
      })
      .on("postgres_changes", {
        event: "DELETE", schema: "public", table: "posts",
        filter: `tether_id=eq.${tether.id}`,
      }, ({ old }) => {
        const id = (old as { id: string }).id;
        setPosts(prev => prev.filter(p => p.id !== id));
        setNotes(prev => prev.filter(p => p.id !== id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tether]);

  // ── Orientation detection ────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", () => setTimeout(check, 120));
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", () => setTimeout(check, 120));
    };
  }, []);

  // ── Cinema mode: add class to <html> so iOS Safari allows full-bleed fixed ──
  // Framer Motion page transitions apply CSS `transform` which creates a new
  // containing block for position:fixed — createPortal breaks it out to body,
  // but we ALSO need to remove overflow:hidden from the flex chain on iOS.
  useEffect(() => {
    const root = document.documentElement;
    if (phase !== "portrait") {
      root.classList.add("cinema-mode");
    } else {
      root.classList.remove("cinema-mode");
    }
    return () => root.classList.remove("cinema-mode");
  }, [phase]);

  // ── Phase machine ────────────────────────────────────────────────
  const timerIds = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    timerIds.current.forEach(clearTimeout);
    timerIds.current = [];

    if (isLandscape && phaseRef.current === "portrait") {
      setPhase("expanding");
      const t1 = setTimeout(() => {
        setPhase("opening-cover");
        animate(coverY, -160, { duration: 1.5, ease: [0.25, 0.10, 0.25, 1.0] });
      }, 980);
      const t2 = setTimeout(() => setPhase("reading"), 980 + 1600);
      timerIds.current = [t1, t2];
    } else if (!isLandscape && phaseRef.current !== "portrait") {
      setPhase("portrait");
      coverY.set(0);
      setPageIdx(0);
    }
  }, [isLandscape]);

  // ── Data helpers ─────────────────────────────────────────────────
  async function fetchPosts() {
    if (!tether) return;
    setLoading(true);
    const [{ data: img }, { data: nte }] = await Promise.all([
      supabase.from("posts").select("*").eq("tether_id", tether.id)
        .eq("post_type", "image").order("created_at", { ascending: true }).limit(80),
      supabase.from("posts").select("*").eq("tether_id", tether.id)
        .eq("post_type", "note").order("created_at", { ascending: true }).limit(80),
    ]);
    if (img)  setPosts(img as Post[]);
    if (nte)  setNotes((nte as Post[]).filter(p => !p.content?.includes('"_cc":true')));
    setLoading(false);
  }

  async function deletePost(id: string) {
    await supabase.from("posts").delete().eq("id", id);
    setPosts(prev => prev.filter(p => p.id !== id));
    setNotes(prev => prev.filter(p => p.id !== id));
    toast({ title: "Deleted" });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setImageFile(f);
    const r = new FileReader();
    r.onload = ev => setImagePreview(ev.target?.result as string);
    r.readAsDataURL(f);
  }

  async function submitNote() {
    if (!profile || !tether || !noteText.trim()) return;
    haptic("light"); setSubmitting(true);
    const { error } = await supabase.from("posts").insert({
      tether_id: tether.id, author_id: profile.id,
      post_type: "note", content: noteText.trim(), image_url: null,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { setNoteText(""); setShowForm(false); toast({ title: "Note saved 📝" }); }
    setSubmitting(false);
  }

  async function submitImage() {
    if (!profile || !tether || !imageFile) return;
    haptic("light"); setUploading(true);
    try {
      const ext  = imageFile.name.split(".").pop();
      const path = `${tether.id}/${Date.now()}.${ext}`;
      const { error: ue } = await supabase.storage.from(BUCKET).upload(path, imageFile, { upsert: false });
      if (ue) throw ue;
      const { data: ud } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: pe } = await supabase.from("posts").insert({
        tether_id: tether.id, author_id: profile.id,
        post_type: "image", content: imageCaption.trim() || null, image_url: ud.publicUrl,
      });
      if (pe) throw pe;
      setImageFile(null); setImagePreview(null); setImageCaption("");
      setShowForm(false); toast({ title: "Memory saved 📸" });
    } catch (err: unknown) {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
    setUploading(false);
  }

  function closeForm() {
    setShowForm(false); setNoteText("");
    setImageFile(null); setImagePreview(null); setImageCaption("");
  }

  function authorName(id: string) {
    return id === profile?.id
      ? (profile?.full_name ?? "Me")
      : (partnerProfile?.full_name ?? "Partner");
  }

  // Chronological (oldest first — oldest is page 1 of the book)
  const allItems = useMemo(() => sortChron([...posts, ...notes]), [posts, notes]);

  // Clamp `pageIdx` whenever the data set shrinks (e.g. the user
  // deletes the post on the last spread) so we never land on a
  // blank, out-of-range spread.  Empty book → 0.
  useEffect(() => {
    if (pageIdx > 0 && pageIdx >= allItems.length) {
      setPageIdx(Math.max(0, allItems.length - 1));
    }
  }, [allItems.length, pageIdx]);

  function goToPage(idx: number) {
    if (idx < 0 || idx >= allItems.length) return;
    setNavDir(idx > pageIdx ? 1 : -1);
    setPageIdx(idx);
    haptic("light");
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <PullToRefresh onRefresh={fetchPosts} style={{ display: "flex", flexDirection: "column", minHeight: "100%", paddingBottom: "calc(120px + env(safe-area-inset-bottom, 0px))" }}>

      {/* Header */}
      <div style={{
        padding: "16px 20px 8px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div>
          <h2 style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            color: "rgba(255,255,255,0.90)", fontSize: "1.45rem", fontWeight: 300,
            letterSpacing: "0.08em", margin: 0,
          }}>
            Scrapbook
          </h2>
          <p style={{
            fontFamily: "'Quicksand', sans-serif",
            color: "rgba(147,197,253,0.45)", fontSize: "0.62rem",
            letterSpacing: "0.14em", textTransform: "uppercase", margin: "2px 0 0",
          }}>
            {isLandscape ? "rotate back · portrait view" : "rotate phone to read"}
          </p>
        </div>
      </div>

      {/* Portrait area — closed book cover */}
      <motion.div
        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70svh" }}
        animate={{ opacity: isLandscape ? 0 : 1 }}
        transition={{ duration: 0.35 }}
      >
        <BookCoverPortrait loading={loading} memoryCount={allItems.length} />
      </motion.div>

      {/* Landscape cinematic overlay — rendered via portal at document.body so
          it escapes Framer Motion's page-transition transform context.
          position:fixed on the overlay will correctly use the real viewport. */}
      {createPortal(
        <AnimatePresence>
          {phase !== "portrait" && (
          <LandscapeOverlay
            phase={phase}
            coverY={coverY}
            items={allItems}
            pageIdx={pageIdx}
            navDir={navDir}
            authorName={authorName}
            onNavigate={goToPage}
            onDelete={deletePost}
            onClose={() => setIsLandscape(false)}
          />
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Liquid Glass FAB — fixed above nav bar */}
      {createPortal(
        <AnimatePresence>
          {!showForm && (
            <LiquidGlassFAB onPress={() => { haptic("medium"); setShowForm(true); }} />
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* Add form (bottom sheet modal) */}
      <AnimatePresence>
        {showForm && (
          <AddFormModal
            uploadMode={uploadMode} setUploadMode={setUploadMode}
            noteText={noteText} setNoteText={setNoteText}
            submitting={submitting} submitNote={submitNote}
            imageFile={imageFile} imagePreview={imagePreview}
            imageCaption={imageCaption} setImageCaption={setImageCaption}
            uploading={uploading} submitImage={submitImage}
            fileRef={fileRef} handleFileChange={handleFileChange}
            closeForm={closeForm}
          />
        )}
      </AnimatePresence>
    </PullToRefresh>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Liquid Glass FAB
// ═══════════════════════════════════════════════════════════════════
function LiquidGlassFAB({ onPress }: { onPress: () => void }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 28, delay: 0.3 }}
      style={{
        position: "fixed",
        bottom: 110,
        right: 24,
        zIndex: 500,
      }}
    >
      <motion.button
        onClick={onPress}
        whileTap={{ scaleX: 1.22, scaleY: 0.78 }}
        transition={{ type: "spring", stiffness: 700, damping: 10, mass: 0.6 }}
        style={{
          width: 58,
          height: 58,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.28)",
          background: "rgba(255,255,255,0.12)",
          backdropFilter: "blur(28px) saturate(200%)",
          WebkitBackdropFilter: "blur(28px) saturate(200%)",
          color: "white",
          fontSize: "1.7rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: [
            "0 0 0 1px rgba(255,255,255,0.10)",
            "0 0 22px 4px rgba(147,197,253,0.18)",
            "0 8px 32px rgba(0,0,0,0.45)",
            "inset 0 1.5px 0 rgba(255,255,255,0.40)",
          ].join(", "),
          lineHeight: 1,
        }}
      >
        +
      </motion.button>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Portrait closed cover — photo of the physical book, floating with shadow
// ═══════════════════════════════════════════════════════════════════
function BookCoverPortrait({ loading, memoryCount }: {
  loading: boolean;
  memoryCount: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      style={{
        width: "85%",
        maxWidth: 340,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        userSelect: "none", WebkitUserSelect: "none",
      } as React.CSSProperties}
    >
      {/* Book image + titanium-plate glow overlay */}
      <div
        style={{
          position: "relative",
          width: "100%",
          isolation: "isolate",
        }}
      >
        <motion.div
          aria-hidden="true"
          animate={{
            opacity: [0.34, 0.52, 0.34],
            scale: [0.98, 1.03, 0.98],
          }}
          transition={{
            duration: 5,
            ease: "easeInOut",
            repeat: Infinity,
          }}
          style={{
            position: "absolute",
            zIndex: -1,
            top: "26%",
            left: "13%",
            width: "68%",
            height: "47%",
            borderRadius: 12,
            background:
              "radial-gradient(circle at 50% 45%, rgba(192,85,247,0.55) 0%, rgba(79,70,229,0.32) 42%, rgba(79,70,229,0) 72%)",
            filter: "blur(25px)",
            pointerEvents: "none",
          }}
        />
        <img
          src={scrapbookCoverImg}
          alt="Our Scrapbook"
          draggable={false}
          style={{
            width: "100%",
            objectFit: "contain",
            display: "block",
            borderRadius: 6,
            filter: [
              "drop-shadow(0 28px 56px rgba(0,0,0,0.82))",
              "drop-shadow(0 10px 22px rgba(0,0,0,0.60))",
              "drop-shadow(0 3px 8px rgba(0,0,0,0.40))",
            ].join(" "),
          } as React.CSSProperties}
        />
      </div>

      {/* Memory count / hint — fades in 0.3 s after the book */}
      {!loading && memoryCount > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.8, ease: [0.4, 0, 0.2, 1] }}
          style={{
            fontFamily: "'Quicksand', sans-serif",
            color: "rgba(255,255,255,0.7)", fontSize: "0.53rem",
            letterSpacing: "0.2em", textTransform: "uppercase", margin: 0, textAlign: "center",
            textShadow: "0 0 1px rgba(0,0,0,0.45)",
          }}
        >
          {memoryCount} {memoryCount === 1 ? "memory" : "memories"} · rotate to read
        </motion.p>
      )}
      {loading && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.8, ease: [0.4, 0, 0.2, 1] }}
          style={{
            fontFamily: "'Quicksand', sans-serif",
            color: "rgba(255,255,255,0.7)", fontSize: "0.53rem",
            letterSpacing: "0.18em", textTransform: "uppercase", margin: 0, textAlign: "center",
            textShadow: "0 0 1px rgba(0,0,0,0.45)",
          }}
        >
          Loading…
        </motion.p>
      )}
      {!loading && memoryCount === 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.8, ease: [0.4, 0, 0.2, 1] }}
          style={{
            fontFamily: "'Quicksand', sans-serif",
            color: "rgba(255,255,255,0.7)", fontSize: "0.52rem",
            letterSpacing: "0.2em", textTransform: "uppercase", margin: 0, textAlign: "center",
            textShadow: "0 0 1px rgba(0,0,0,0.45)",
          }}
        >
          Tap + to add a memory
        </motion.p>
      )}
    </motion.div>
  );
}

// ── Shared cover face (landscape 3D flip) — photo cover ──────────
function CoverFace({ size }: { size: "portrait" | "landscape" }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: size === "landscape" ? 4 : 0 }}>
      <img
        src={scrapbookCoverImg}
        alt="Our Scrapbook"
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Landscape cinematic overlay
// ═══════════════════════════════════════════════════════════════════
function LandscapeOverlay({ phase, coverY, items, pageIdx, navDir, authorName, onNavigate, onDelete, onClose }: {
  phase: "expanding" | "opening-cover" | "reading";
  coverY: MotionValue<number>;
  items: Post[];
  pageIdx: number;
  navDir: number;
  authorName: (id: string) => string;
  onNavigate: (idx: number) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      key="landscape-overlay"
      // Starts as the portrait book (small, rotated 90°) then grows to fullscreen
      initial={{ scale: 0.40, rotateZ: 90, opacity: 0 }}
      animate={{ scale: 1,    rotateZ: 0,  opacity: 1 }}
      exit={{    scale: 0.40, rotateZ: 90, opacity: 0 }}
      transition={{ duration: 0.95, ease: [0.34, 1.08, 0.64, 1] }}
      style={{
        position: "fixed", inset: 0, zIndex: 300, overflow: "hidden",
      }}
    >
      {/* 3D scene wrapper — gives perspective depth to the cover flip */}
      <div style={{
        position: "absolute", inset: 0,
        perspective: "1400px",
        perspectiveOrigin: "18% 50%",
        overflow: "hidden",
      }}>

        {/* ── Pages (revealed as cover swings open) ── */}
        {(phase === "opening-cover" || phase === "reading") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            style={{ position: "absolute", inset: 0, zIndex: 1 }}
          >
            <LandscapePageView
              items={items}
              pageIdx={pageIdx}
              navDir={navDir}
              authorName={authorName}
              onNavigate={onNavigate}
              onDelete={onDelete}
              onClose={onClose}
            />
          </motion.div>
        )}

        {/* ── Cover (swings open, disappears after −90°) ── */}
        <motion.div
          style={{
            position: "absolute", inset: 0,
            transformOrigin: "left center",
            rotateY: coverY,
            zIndex: 2,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            pointerEvents: phase === "reading" ? "none" : "auto",
          }}
        >
          <CoverFace size="landscape" />

          {/* "Rotate to read" hint (only while cover is closed/opening) */}
          {phase === "expanding" && (
            <div style={{
              position: "absolute",
              bottom: 30, left: 0, right: 0,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            }}>
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <p style={{
                  fontFamily: "'Quicksand', sans-serif",
                  color: "rgba(212,175,55,0.65)", fontSize: "0.7rem",
                  letterSpacing: "0.22em", textTransform: "uppercase", margin: 0,
                }}>
                  Opening…
                </p>
              </motion.div>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Landscape page view — swipe between memories
// ═══════════════════════════════════════════════════════════════════
function LandscapePageView({ items, pageIdx, authorName, onNavigate, onDelete, onClose }: {
  items: Post[];
  pageIdx: number;
  navDir: number;          // kept for signature stability (unused)
  authorName: (id: string) => string;
  onNavigate: (idx: number) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  // ── Spread model ─────────────────────────────────────────────
  // ONE POST = ONE SPREAD.  `pageIdx` is now the post index
  // (= spread index).  Each spread renders the SAME post on both
  // pages — left side shows the image / media, right side shows
  // the long-form text + metadata + delete.  The page-turn hook
  // still works unchanged because the visible-content
  // contract is "what's on left/right of the current spread", and
  // the next-spread leaf reveals the next post.
  const totalSpreads  = Math.max(items.length, 1);
  const currentSpread = pageIdx;

  const currentItem = items[pageIdx]     ?? null;
  const nextItem    = items[pageIdx + 1] ?? null;
  const prevItem    = items[pageIdx - 1] ?? null;

  // Page-turn hook — single source of truth for the flip animation.
  // `onSpreadChange` now maps 1:1 to the post index (no doubling).
  const turn = usePageTurn({
    totalSpreads,
    spreadIndex: currentSpread,
    onSpreadChange: (next) => onNavigate(next),
    bookWidth: 800,
  });

  // Render helper — same item, different SIDE.  Wrapped in
  // `.scrapbook-page-content` so PageTurnLayer can paint front/
  // back faces with consistent padding.  `side` drives which
  // half of the post we paint (image vs. text).  Spread index
  // is passed in explicitly (no `indexOf` lookup) so seeded
  // decorations stay deterministic and we avoid O(n) work per
  // render.
  const renderSide = (item: Post | null, spreadIdx: number, side: "image" | "text") => (
    <div className={`scrapbook-page-content scrapbook-page-content--${side}`}>
      <BookPageItem
        item={item}
        side={side}
        pageIdx={spreadIdx}
        authorName={authorName}
        onDelete={onDelete}
      />
    </div>
  );

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", flexDirection: "column",
    }}>
      {/* Controls bar — respects Dynamic Island / notch via safe-area insets */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingTop:    "max(10px, env(safe-area-inset-top, 10px))",
        paddingLeft:   "max(18px, env(safe-area-inset-left, 18px))",
        paddingRight:  "max(18px, env(safe-area-inset-right, 18px))",
        paddingBottom: "8px",
        flexShrink: 0, zIndex: 10, position: "relative",
      }}>
        <motion.button
          onClick={onClose}
          whileTap={{ scale: 0.86 }}
          style={{
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 20, padding: "6px 14px 6px 10px",
            color: "rgba(255,255,255,0.70)", cursor: "pointer",
            fontSize: "0.78rem", fontFamily: "'Quicksand', sans-serif", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          ← Close
        </motion.button>
        <p style={{
          fontFamily: "'Playfair Display', serif",
          color: "rgba(212,175,55,0.55)", fontSize: "0.8rem", fontStyle: "italic", margin: 0,
        }}>
          {items.length === 0
            ? "No memories yet"
            : `Spread ${currentSpread + 1} of ${totalSpreads}`}
        </p>
        {totalSpreads > 1 && totalSpreads <= 12 && (
          <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
            {Array.from({ length: totalSpreads }, (_, i) => (
              <motion.div key={i}
                onClick={() => onNavigate(i)}
                animate={{ scale: i === currentSpread ? 1.4 : 1, opacity: i === currentSpread ? 1 : 0.28 }}
                transition={{ type: "spring", stiffness: 400, damping: 24 }}
                style={{
                  width: 5, height: 5, borderRadius: "50%", cursor: "pointer",
                  background: i === currentSpread ? "#C53030" : "rgba(255,255,255,0.55)",
                }}
              />
            ))}
          </div>
        )}
        {(totalSpreads > 12 || totalSpreads === 0) && <div style={{ width: 80 }} />}
      </div>

      {/* ── Page area: centered 2:1 Liquid Glass book ───────────
       * The pointer handlers from `usePageTurn` live on
       * `.scrapbook-stage` (not `.scrapbook-book`) so a swipe
       * starting in the dark margin around the book still
       * registers — matches the affordance of a real book held
       * in hand, where the corner / outer edge is the natural
       * grab point. */}
      <div
        className="scrapbook-stage"
        style={{ flex: 1, position: "relative", overflow: "hidden", touchAction: "none" }}
        onPointerDown={turn.onPointerDown}
        onPointerMove={turn.onPointerMove}
        onPointerUp={turn.onPointerUp}
        onPointerCancel={turn.onPointerUp}
      >
        <div className="scrapbook-book">
          {/* Hard spine — sits above all pages on z-axis. */}
          <div className="scrapbook-spine" aria-hidden="true" />

          {/* Stacked page layers (static + flipping) come from
           * PageTurnLayer; it positions everything absolutely
           * inside `.scrapbook-book`. */}
          {/* Each spread = ONE post.  Both pages of `currentLeft`
           * + `currentRight` reference the same item; the page-
           * turn animation flips the right leaf to reveal the
           * NEXT post (its image side becoming the new left). */}
          <PageTurnLayer
            currentLeft ={renderSide(currentItem, currentSpread,     "image")}
            currentRight={renderSide(currentItem, currentSpread,     "text")}
            nextLeft    ={nextItem ? renderSide(nextItem, currentSpread + 1, "image") : null}
            nextRight   ={nextItem ? renderSide(nextItem, currentSpread + 1, "text")  : null}
            prevLeft    ={prevItem ? renderSide(prevItem, currentSpread - 1, "image") : null}
            prevRight   ={prevItem ? renderSide(prevItem, currentSpread - 1, "text")  : null}
            rotation ={turn.rotation}
            direction={turn.direction}
            reduced  ={turn.reduced}
          />
        </div>

        {/* Prev arrow — steps a whole spread back via the hook
         * so the animation runs identically to a swipe. */}
        {currentSpread > 0 && (
          <motion.button
            whileTap={{ scale: 0.84 }}
            onClick={turn.turnPrev}
            disabled={turn.isAnimating}
            aria-label="Previous spread"
            className="lg-surface-chip lg-interactive"
            style={{
              position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)",
              color: "var(--lg-text-secondary)",
              width: 38, height: 38, borderRadius: "50%",
              cursor: turn.isAnimating ? "default" : "pointer",
              fontSize: "1.2rem", zIndex: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0,
            }}>
            ‹
          </motion.button>
        )}
        {currentSpread + 1 < totalSpreads && (
          <motion.button
            whileTap={{ scale: 0.84 }}
            onClick={turn.turnNext}
            disabled={turn.isAnimating}
            aria-label="Next spread"
            className="lg-surface-chip lg-interactive"
            style={{
              position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)",
              color: "var(--lg-text-secondary)",
              width: 38, height: 38, borderRadius: "50%",
              cursor: turn.isAnimating ? "default" : "pointer",
              fontSize: "1.2rem", zIndex: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0,
            }}>
            ›
          </motion.button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BookPageItem — one HALF of a spread.
//
// The brief models each post as a 2-page spread, so this component
// receives a `side` prop that selects which half of the post to
// paint:
//
//   side="image" → left page  · primarily the media
//                              · small date/title chip
//   side="text"  → right page · long-form text body (large,
//                                generous line-height, scrollable
//                                inside the page if extreme)
//                              · author + date metadata footer
//                              · delete button anchored to the
//                                bottom of the page
//
// Splitting like this means the photo never crowds the text and
// the text page can use a typography scale tuned for reading.
// ═══════════════════════════════════════════════════════════════════
function BookPageItem({ item, side, pageIdx, authorName, onDelete }: {
  item: Post | null;
  side: "image" | "text";
  pageIdx: number;
  authorName: (id: string) => string;
  onDelete: (id: string) => void;
}) {
  if (!item) {
    return <p className="scrapbook-page-empty">No memory on this page yet</p>;
  }

  // ── LEFT PAGE — image / media ─────────────────────────────────
  if (side === "image") {
    return (
      <>
        <div className="scrapbook-image-frame">
          {item.post_type === "image"
            ? <PhotoPolaroid post={item} pageIdx={pageIdx} />
            : <NoteCard      post={item} pageIdx={pageIdx} large />}
        </div>
        {/* Single date chip — the right page shows the rest of
         * the metadata, so we don't crowd the image side. */}
        <span className="lg-surface-chip scrapbook-chip">
          {fmtDate(item.created_at)}
        </span>
      </>
    );
  }

  // ── RIGHT PAGE — long-form text + controls ────────────────────
  // Text body fills the page; metadata + delete sit at the bottom.
  // The page itself sets `max-height` + scrollable inner region
  // via CSS so a very long letter remains readable without
  // breaking the spread layout.
  const bodyText = item.content?.trim();
  const placeholder = item.post_type === "image"
    ? "A memory captured."
    : "(empty note)";

  return (
    <div className="scrapbook-text-page">
      {/* Scrollable body — only scrolls if text exceeds the page;
       * normal-length notes simply fit comfortably. */}
      <div className="scrapbook-text-body">
        {bodyText
          ? <p className="scrapbook-text-paragraph">{bodyText}</p>
          : <p className="scrapbook-text-placeholder">{placeholder}</p>}
      </div>

      {/* Metadata footer — author + date on the same line. */}
      <div className="scrapbook-text-meta">
        <span className="scrapbook-text-meta__rule" aria-hidden="true" />
        <span className="scrapbook-text-meta__author">
          — {authorName(item.author_id)}
        </span>
        <span className="scrapbook-text-meta__date">
          {fmtDate(item.created_at)}
        </span>
      </div>

      {/* Delete — anchored near the bottom of the right page. */}
      <button
        onClick={() => { if (window.confirm("Delete this memory?")) onDelete(item.id); }}
        className="lg-surface-chip lg-interactive scrapbook-chip scrapbook-text-delete"
        style={{ color: "var(--lg-accent-danger)", border: "none" }}
      >
        Delete
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Single scrapbook page — archival paper with decorations
// ═══════════════════════════════════════════════════════════════════
function ScrapbookPage_({ item, pageIdx, total, authorName, onDelete }: {
  item: Post | null;
  pageIdx: number;
  total: number;
  authorName: (id: string) => string;
  onDelete: (id: string) => void;
}) {
  const decs = useMemo(() => getPageDecorations(pageIdx), [pageIdx]);
  const [confirmDel, setConfirmDel] = useState(false);

  // Detect "long letter": text-only note with substantial content → full-spread layout
  const isLetter = item?.post_type === "note" && (item.content?.length ?? 0) > 200;

  // Route to the luxury full-spread letter view
  if (isLetter && item) {
    return (
      <FullLetterSpread
        item={item}
        pageIdx={pageIdx}
        total={total}
        authorName={authorName}
        onDelete={onDelete}
      />
    );
  }

  return (
    <div style={{
      position: "absolute", inset: 0,
      background: PAPER_BG,
      display: "flex",
      overflow: "hidden",
    }}>
      {/* Faint ruled lines */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(transparent, transparent 31px, rgba(130,110,80,0.05) 31px, rgba(130,110,80,0.05) 32px)",
        backgroundPositionY: 56,
      }} />

      {/* Left-edge spine shadow */}
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: 0, width: 20,
        background: "linear-gradient(90deg, rgba(0,0,0,0.10), transparent)",
        pointerEvents: "none",
      }} />

      {/* Page decorations (behind content) */}
      {decs.map((d, i) => <PageDecoration key={i} type={d} pageIdx={pageIdx} index={i} />)}

      {/* ── Empty state ── */}
      {!item ? (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <p style={{ fontFamily: "'Caveat', cursive", color: "#b0a090", fontSize: "1.3rem" }}>
            No memories yet…
          </p>
          <p style={{ fontFamily: "'Quicksand', sans-serif", color: "#c0b0a0", fontSize: "0.72rem" }}>
            Add a memory with the + button
          </p>
        </div>
      ) : (
        <>
          {/* ── Left panel: photo / note card ── */}
          <div style={{
            width: "50%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px 12px 20px 24px", boxSizing: "border-box",
            position: "relative",
          }}>
            {item.post_type === "image" ? (
              <PhotoPolaroid post={item} pageIdx={pageIdx} />
            ) : (
              <NoteCard post={item} pageIdx={pageIdx} large />
            )}
          </div>

          {/* ── Divider (vertical rule) ── */}
          <div style={{
            width: 1,
            margin: "32px 0",
            background: "linear-gradient(180deg, transparent, rgba(160,130,90,0.25) 20%, rgba(160,130,90,0.25) 80%, transparent)",
            flexShrink: 0,
          }} />

          {/* ── Right panel: text + metadata ── */}
          <div style={{
            flex: 1, height: "100%",
            display: "flex", flexDirection: "column",
            justifyContent: "center",
            padding: "24px 24px 24px 20px",
            boxSizing: "border-box",
            position: "relative",
          }}>

            {/* Handwritten note content (right side) */}
            {item.post_type === "image" && item.content && (
              <p style={{
                fontFamily: "'Caveat', cursive",
                color: "#3a3028",
                fontSize: "clamp(1.0rem, 2.5vw, 1.4rem)",
                lineHeight: 1.7,
                marginBottom: 20,
                wordBreak: "break-word",
              }}>
                {item.content}
              </p>
            )}

            {item.post_type === "note" && (
              <p style={{
                fontFamily: "'Caveat', cursive",
                color: "#3a3028",
                fontSize: "clamp(1.05rem, 2.8vw, 1.5rem)",
                lineHeight: 1.75,
                marginBottom: 20,
                wordBreak: "break-word",
              }}>
                {item.content}
              </p>
            )}

            {/* If no text caption on image post */}
            {item.post_type === "image" && !item.content && (
              <p style={{
                fontFamily: "'Playfair Display', serif",
                fontStyle: "italic",
                color: "#b0a080",
                fontSize: "1rem",
                marginBottom: 20,
              }}>
                A memory captured.
              </p>
            )}

            {/* Metadata */}
            <div>
              <div style={{
                width: 40, height: 1,
                background: "linear-gradient(90deg, rgba(197,48,48,0.4), transparent)",
                marginBottom: 10,
              }} />
              <p style={{
                fontFamily: "'Playfair Display', serif",
                fontStyle: "italic",
                color: "#9a8070",
                fontSize: "0.78rem",
                margin: "0 0 4px",
              }}>
                — {authorName(item.author_id)}
              </p>
              <p style={{
                fontFamily: "'Quicksand', sans-serif",
                color: "#b0a080",
                fontSize: "0.65rem",
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                margin: 0,
              }}>
                {fmtDate(item.created_at)}
              </p>
            </div>

            {/* Page number */}
            <p style={{
              position: "absolute",
              bottom: 14, right: 18,
              fontFamily: "'Caveat', cursive",
              color: "rgba(160,130,90,0.45)",
              fontSize: "0.72rem",
              margin: 0,
            }}>
              {pageIdx + 1} / {total}
            </p>

            {/* Delete */}
            {item && (
              <div style={{ position: "absolute", top: 14, right: 14, zIndex: 5 }}>
                <DeleteControl
                  confirmDel={confirmDel}
                  onConfirmToggle={() => setConfirmDel(v => !v)}
                  onDelete={() => { onDelete(item.id); setConfirmDel(false); }}
                  onCancel={() => setConfirmDel(false)}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Full-page luxury letter spread — used when a note post has >200 chars
// ═══════════════════════════════════════════════════════════════════
function FullLetterSpread({
  item, pageIdx, total, authorName, onDelete,
}: {
  item: Post;
  pageIdx: number;
  total: number;
  authorName: (id: string) => string;
  onDelete: (id: string) => void;
}) {
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div style={{
      position: "absolute", inset: 0,
      background: PAPER_BG,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    }}>
      {/* Ruled lines — full bleed */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(transparent, transparent 31px, rgba(130,110,80,0.05) 31px, rgba(130,110,80,0.05) 32px)",
        backgroundPositionY: 56,
      }} />

      {/* Subtle paper texture grain */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: [
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E\")",
        ].join(""),
        backgroundSize: "200px 200px",
        opacity: 1,
      }} />

      {/* Corner decorations — washi tape slivers, well away from text */}
      <div style={{ position: "absolute", top: -4, left: -6, width: 70, height: 22, borderRadius: 3,
        background: "rgba(197,100,60,0.28)", transform: "rotate(-8deg)",
        boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.18)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 10, right: 8, width: 52, height: 18, borderRadius: 3,
        background: "rgba(80,120,180,0.22)", transform: "rotate(5deg)",
        boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.15)", pointerEvents: "none" }} />

      {/* Small foil corner — bottom left */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, width: 0, height: 0,
        borderStyle: "solid", borderWidth: "0 0 36px 36px",
        borderColor: `transparent transparent rgba(212,175,55,0.22) transparent`,
        pointerEvents: "none",
      }} />
      {/* Small foil corner — top right */}
      <div style={{
        position: "absolute", top: 0, right: 0, width: 0, height: 0,
        borderStyle: "solid", borderWidth: "0 36px 36px 0",
        borderColor: `transparent rgba(212,175,55,0.22) transparent transparent`,
        pointerEvents: "none",
      }} />

      {/* Letter body — 80% width, vertically centered */}
      <div style={{
        width: "80%",
        maxHeight: "88%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignSelf: "center",
        position: "relative",
        zIndex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch" as any,
      }}>
        {/* Gold opening flourish */}
        <div style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "clamp(0.6rem, 1.2vw, 0.8rem)",
          color: "rgba(212,175,55,0.50)",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          textAlign: "center",
          marginBottom: 18,
        }}>
          ✦ &nbsp; A letter for you &nbsp; ✦
        </div>

        {/* The letter text */}
        <p style={{
          fontFamily: "'Caveat', cursive",
          color: "#2e2618",
          fontSize: "clamp(1.2rem, 2vw, 1.8rem)",
          lineHeight: 1.8,
          margin: 0,
          wordBreak: "break-word",
          textAlign: "left",
        }}>
          {item.content}
        </p>

        {/* Gold signature line */}
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{
            width: "60%",
            height: 1,
            background: "linear-gradient(90deg, rgba(212,175,55,0.55), transparent)",
          }} />
          <p style={{
            fontFamily: "'Playfair Display', serif",
            fontStyle: "italic",
            color: "rgba(197,48,48,0.65)",
            fontSize: "clamp(0.85rem, 1.6vw, 1.1rem)",
            margin: 0,
            letterSpacing: "0.04em",
          }}>
            {authorName(item.author_id)}
          </p>
          <p style={{
            fontFamily: "'Quicksand', sans-serif",
            color: "rgba(160,130,90,0.55)",
            fontSize: "clamp(0.55rem, 1vw, 0.68rem)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: 0,
          }}>
            {fmtDate(item.created_at)}
          </p>
        </div>
      </div>

      {/* Page number */}
      <p style={{
        position: "absolute", bottom: 10, right: 18,
        fontFamily: "'Caveat', cursive",
        color: "rgba(160,130,90,0.38)",
        fontSize: "0.68rem",
        margin: 0,
        zIndex: 2,
      }}>
        {pageIdx + 1} / {total}
      </p>

      {/* Delete */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5 }}>
        <DeleteControl
          confirmDel={confirmDel}
          onConfirmToggle={() => setConfirmDel(v => !v)}
          onDelete={() => { onDelete(item.id); setConfirmDel(false); }}
          onCancel={() => setConfirmDel(false)}
        />
      </div>
    </div>
  );
}

// ── Polaroid photo on page ────────────────────────────────────────
function PhotoPolaroid({ post, pageIdx }: { post: Post; pageIdx: number }) {
  const rot  = seededN(pageIdx, 0) * 10 - 5;
  const decoColor = seededN(pageIdx, 3) > 0.5 ? "red" : "blue";
  return (
    <div style={{
      transform: `rotate(${rot}deg)`,
      background: "white",
      padding: "10px 10px 28px",
      borderRadius: 3,
      boxShadow: "0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.14)",
      width: "90%",
      maxWidth: 280,
      position: "relative",
      flexShrink: 0,
    }}>
      {/* Washi tape at top */}
      <WashiTape color={decoColor} rotation={rot * -0.7} />
      {/* Photo */}
      <div style={{ width: "100%", aspectRatio: "4 / 3", overflow: "hidden", background: "#f0ede8" }}>
        {post.image_url && (
          <img src={post.image_url} draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        )}
      </div>
      {/* Polaroid label */}
      <div style={{ padding: "10px 4px 0", textAlign: "center" }}>
        <p style={{
          fontFamily: "'Quicksand', sans-serif",
          color: "#9a8878", fontSize: "0.58rem",
          letterSpacing: "0.09em", textTransform: "uppercase", margin: 0,
        }}>
          {fmtDate(post.created_at)}
        </p>
      </div>
    </div>
  );
}

// ── Note card on page ─────────────────────────────────────────────
function NoteCard({ post, pageIdx, large }: { post: Post; pageIdx: number; large?: boolean }) {
  const rot = seededN(pageIdx, 1) * 8 - 4;
  const pinColor = seededN(pageIdx, 5) > 0.5 ? "#C53030" : "#2563EB";
  return (
    <div style={{
      transform: `rotate(${rot}deg)`,
      background: "linear-gradient(140deg, #fef9e0 0%, #fdf5ce 100%)",
      padding: large ? "24px 20px 16px" : "18px 14px 12px",
      borderRadius: 3,
      boxShadow: "0 6px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10)",
      width: "90%",
      maxWidth: 280,
      position: "relative",
      flexShrink: 0,
      borderTop: "1px solid rgba(200,180,110,0.4)",
    }}>
      {/* Pushpin */}
      <div style={{
        position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)",
        width: 14, height: 14, borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, ${pinColor}cc, ${pinColor}66)`,
        boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
      }} />
      <p style={{
        fontFamily: "'Caveat', cursive",
        color: "#3a3028",
        fontSize: large ? "1.1rem" : "0.95rem",
        lineHeight: 1.6,
        wordBreak: "break-word",
        margin: "0 0 12px",
      }}>
        {post.content}
      </p>
      <p style={{
        fontFamily: "'Quicksand', sans-serif",
        color: "#9a8060", fontSize: "0.56rem",
        letterSpacing: "0.1em", textTransform: "uppercase", margin: 0,
      }}>
        {fmtDate(post.created_at)}
      </p>
    </div>
  );
}

// ── Page decoration system ────────────────────────────────────────
type DecType = "washi-red" | "washi-blue" | "icon-heart" | "icon-camera" | "icon-plane" | "foil-corner" | "ticket";

function getPageDecorations(pageIdx: number): DecType[] {
  const r = (n: number) => seededN(pageIdx, n + 50);
  return [
    r(0) > 0.5 ? "washi-red" : "washi-blue",
    (["icon-heart", "icon-camera", "icon-plane"] as DecType[])[Math.floor(r(1) * 3)],
    r(2) > 0.5 ? "foil-corner" : "ticket",
  ];
}

function PageDecoration({ type, pageIdx, index }: { type: DecType; pageIdx: number; index: number }) {
  const r = (n: number) => seededN(pageIdx, n + index * 10 + 80);
  switch (type) {
    case "washi-red":
    case "washi-blue": {
      const color = type === "washi-red" ? "#C53030" : "#2563EB";
      const top   = 8 + r(1) * 30;
      const left  = 15 + r(2) * 20;
      const rot   = r(3) * 20 - 10;
      return (
        <div style={{
          position: "absolute", top: `${top}%`, left: `${left}%`,
          transform: `rotate(${rot}deg)`,
          width: 70, height: 22,
          background: color + "1e",
          border: `1px solid ${color}28`,
          borderRadius: 3,
          pointerEvents: "none",
        }} />
      );
    }
    case "icon-heart":
    case "icon-camera":
    case "icon-plane": {
      const icon = type === "icon-heart" ? "♥" : type === "icon-camera" ? "⌖" : "✦";
      const top  = 12 + r(4) * 65;
      const side = r(5) > 0.5 ? "left" : "right";
      const sideVal = 6 + r(6) * 8;
      const rot  = r(7) * 30 - 15;
      return (
        <div style={{
          position: "absolute",
          top: `${top}%`,
          [side]: `${sideVal}px`,
          transform: `rotate(${rot}deg)`,
          fontSize: "0.7rem",
          color: "rgba(160,130,90,0.32)",
          pointerEvents: "none",
          fontFamily: "Georgia, serif",
        }}>
          {icon}
        </div>
      );
    }
    case "foil-corner": {
      const isLeft = r(8) > 0.5;
      const deg = isLeft ? "45deg" : "135deg";
      return (
        <div style={{
          position: "absolute",
          bottom: 18, [isLeft ? "left" : "right"]: 18,
          width: 44, height: 44,
          background: `linear-gradient(${deg}, rgba(212,175,55,0.55) 0%, rgba(255,220,80,0.75) 40%, rgba(212,175,55,0.35) 70%)`,
          opacity: 0.32,
          clipPath: isLeft ? "polygon(0% 0%, 100% 100%, 0% 100%)" : "polygon(100% 0%, 100% 100%, 0% 100%)",
          pointerEvents: "none",
        }} />
      );
    }
    case "ticket": {
      const top  = 45 + r(9) * 20;
      const left = 3 + r(10) * 10;
      const rot  = r(11) * 14 - 7;
      return (
        <div style={{
          position: "absolute",
          top: `${top}%`, left: `${left}%`,
          transform: `rotate(${rot}deg)`,
          width: 64, height: 28,
          background: "linear-gradient(135deg, #f5f0e2 0%, #ede6d4 100%)",
          borderRadius: 3,
          opacity: 0.45,
          boxShadow: "1px 2px 4px rgba(0,0,0,0.08)",
          clipPath: "polygon(0% 0%, 82% 0%, 82% 18%, 90% 18%, 90% 0%, 100% 0%, 100% 100%, 90% 100%, 90% 82%, 82% 82%, 82% 100%, 0% 100%)",
          pointerEvents: "none",
        }} />
      );
    }
    default:
      return null;
  }
}

// ── Washi tape strip ──────────────────────────────────────────────
function WashiTape({ color, rotation }: { color: "red" | "blue"; rotation: number }) {
  const c = color === "red" ? "#C53030" : "#2563EB";
  return (
    <div style={{
      position: "absolute", top: -9, left: "50%",
      transform: `translateX(-50%) rotate(${rotation}deg)`,
      width: 52, height: 18,
      background: c + "25",
      border: `1px solid ${c}30`,
      borderRadius: 2,
      zIndex: 10,
    }} />
  );
}

// ── Delete control ────────────────────────────────────────────────
function DeleteControl({ confirmDel, onConfirmToggle, onDelete, onCancel }: {
  confirmDel: boolean;
  onConfirmToggle: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return !confirmDel ? (
    <button onClick={e => { e.stopPropagation(); onConfirmToggle(); }}
      style={{
        background: "rgba(0,0,0,0.12)", border: "none", borderRadius: 7,
        padding: "4px 7px", cursor: "pointer", fontSize: "0.8rem", color: "#9a8060",
      }}>
      🗑
    </button>
  ) : (
    <div style={{ display: "flex", gap: 5 }}>
      <button onClick={e => { e.stopPropagation(); onCancel(); }}
        style={{
          background: "rgba(0,0,0,0.45)", border: "none", borderRadius: 7,
          padding: "4px 9px", cursor: "pointer", color: "white",
          fontSize: "0.65rem", fontFamily: "'Quicksand',sans-serif", fontWeight: 600,
        }}>
        No
      </button>
      <button onClick={e => { e.stopPropagation(); onDelete(); }}
        style={{
          background: "#C53030", border: "none", borderRadius: 7,
          padding: "4px 9px", cursor: "pointer", color: "white",
          fontSize: "0.65rem", fontFamily: "'Quicksand',sans-serif", fontWeight: 700,
        }}>
        Delete
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Add form (bottom-sheet modal)
// ═══════════════════════════════════════════════════════════════════
function AddFormModal({ uploadMode, setUploadMode, noteText, setNoteText, submitting, submitNote,
  imageFile, imagePreview, imageCaption, setImageCaption, uploading, submitImage,
  fileRef, handleFileChange, closeForm }: {
  uploadMode: "note"|"image"; setUploadMode: (m: "note"|"image") => void;
  noteText: string; setNoteText: (v: string) => void;
  submitting: boolean; submitNote: () => void;
  imageFile: File|null; imagePreview: string|null;
  imageCaption: string; setImageCaption: (v: string) => void;
  uploading: boolean; submitImage: () => void;
  fileRef: React.RefObject<HTMLInputElement>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  closeForm: () => void;
}) {
  return (
    <motion.div
      key="form-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={e => { if (e.target === e.currentTarget) closeForm(); }}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
        style={{
          width: "100%",
          maxHeight: "85svh",
          background: "rgba(14,16,24,0.97)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "28px 28px 0 0",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* Drag handle — stays pinned at top */}
        <div style={{ flexShrink: 0, padding: "16px 20px 0", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)", marginBottom: 12 }} />
        </div>

        {/* Scrollable content — bottom padding clears nav dock + home indicator */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 100px)", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Mode toggle */}
        <div style={{ display: "flex", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}>
          {(["image","note"] as const).map(m => (
            <button key={m} onClick={() => setUploadMode(m)}
              style={{
                flex: 1, padding: "9px 0", fontSize: "0.88rem", fontWeight: 600,
                border: "none", cursor: "pointer",
                background: uploadMode === m ? "#C53030" : "transparent",
                color: uploadMode === m ? "white" : "rgba(147,197,253,0.7)",
                fontFamily: "'Quicksand',sans-serif", transition: "all 0.2s",
              }}>
              {m === "image" ? "📸 Photo" : "✍️ Note"}
            </button>
          ))}
        </div>

        {uploadMode === "note" ? (
          <>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
              placeholder="Write something sweet…" rows={4}
              style={{
                width: "100%", background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14,
                padding: "12px 14px", color: "white", fontSize: "1rem",
                resize: "none", outline: "none", fontFamily: "'Caveat',cursive", boxSizing: "border-box",
              }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={submitNote} disabled={submitting || !noteText.trim()}
                style={{
                  flex: 1, padding: "12px", borderRadius: 14,
                  background: "linear-gradient(135deg,#C53030,#7B1313)", border: "none",
                  color: "white", fontWeight: 700, cursor: submitting||!noteText.trim() ? "not-allowed":"pointer",
                  fontFamily: "'Quicksand',sans-serif", opacity: !noteText.trim() ? 0.5 : 1,
                }}>
                {submitting ? "Saving…" : "Save Note"}
              </button>
              <button onClick={closeForm}
                style={{
                  padding: "12px 18px", borderRadius: 14, background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)",
                  cursor: "pointer", fontFamily: "'Quicksand',sans-serif",
                }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {imagePreview ? (
              <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
                <img src={imagePreview} style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }} />
                <button onClick={() => { /* reset handled by parent */ }}
                  style={{
                    position: "absolute", top: 8, right: 8,
                    background: "rgba(0,0,0,0.6)", color: "white", border: "none",
                    borderRadius: "50%", width: 28, height: 28, fontSize: "1rem",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                  ×
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                style={{
                  width: "100%", height: 110, borderRadius: 14,
                  border: "2px dashed rgba(255,255,255,0.18)", background: "none",
                  color: "rgba(147,197,253,0.6)", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 8, fontSize: "0.85rem", fontFamily: "'Quicksand',sans-serif",
                }}>
                <span style={{ fontSize: "2rem" }}>📷</span>
                Tap to choose a photo
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
            <input type="text" value={imageCaption} onChange={e => setImageCaption(e.target.value)}
              placeholder="Caption… (optional)"
              style={{
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14, padding: "12px 14px", color: "white", fontSize: "0.95rem",
                outline: "none", fontFamily: "'Caveat',cursive", width: "100%", boxSizing: "border-box",
              }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={submitImage} disabled={uploading||!imageFile}
                style={{
                  flex: 1, padding: "12px", borderRadius: 14,
                  background: "linear-gradient(135deg,#C53030,#7B1313)", border: "none",
                  color: "white", fontWeight: 700, cursor: uploading||!imageFile ? "not-allowed":"pointer",
                  fontFamily: "'Quicksand',sans-serif", opacity: !imageFile ? 0.5 : 1,
                }}>
                {uploading ? "Uploading…" : "Save Memory"}
              </button>
              <button onClick={closeForm}
                style={{
                  padding: "12px 18px", borderRadius: 14, background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)",
                  cursor: "pointer", fontFamily: "'Quicksand',sans-serif",
                }}>
                Cancel
              </button>
            </div>
          </>
        )}
        </div>{/* end scrollable content */}
      </motion.div>
    </motion.div>
  );
}
