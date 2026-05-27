import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { haptic } from "@/lib/haptics";
import { playSound } from "@/lib/audioManager";
import { PullToRefresh } from "@/components/PullToRefresh";
import confetti from "canvas-confetti";

// ── Font tokens ────────────────────────────────────────────────────
const PF = { fontFamily: "'Playfair Display', serif" };
const DS = { fontFamily: "'Dancing Script', cursive" };
const QS = { fontFamily: "'Quicksand', sans-serif" };

// ── 52 couples trivia questions ────────────────────────────────────
// Questions that are about one specific person use {name} as a placeholder.
// Questions about "both of us" stay as-is.
const TRIVIA_QUESTIONS = [
  "Which of us would survive longer in the wilderness?",
  "If we had to describe each other in one emoji, what would yours be for {name}?",
  "Which of us is more likely to cry at a movie?",
  "What's our most-used inside joke?",
  "Which of us would win in a cooking competition?",
  "What song best describes our relationship right now?",
  "Which of us is more of a morning person?",
  "What is {name}'s primary love language?",
  "Which of us is more likely to suggest a spontaneous road trip?",
  "What's the first thing {name} notices when walking into a room?",
  "Which of us is more of a 'planner' in our relationship?",
  "What is {name}'s ultimate comfort food?",
  "Which of us would adopt every stray animal we saw?",
  "What's something about {name} that surprised you when you first met?",
  "Which of us would get lost first without GPS?",
  "What is {name}'s biggest pet peeve?",
  "Which of us would win a pub trivia night?",
  "What trip have we talked about that {name} wants most?",
  "Which of us is messier at home?",
  "What is something {name} does that always makes you laugh?",
  "Which of us would binge an entire series in one weekend?",
  "What is {name}'s go-to movie genre when they need comfort?",
  "Which of us would be more internet-famous if we were influencers?",
  "What is the best gift {name} has ever given you?",
  "Which of us would suggest dessert first?",
  "What is a dream job {name} has never mentioned but might secretly love?",
  "Which of us is more likely to start a random collection?",
  "What quality about {name} did you fall for first?",
  "Which of us is better at keeping secrets?",
  "What is something on {name}'s bucket list they haven't done yet?",
  "Which of us would learn a completely random skill for fun?",
  "What is the last thing that made {name} genuinely laugh out loud?",
  "Which of us would be more likely to write a book?",
  "What is {name}'s biggest irrational fear?",
  "Which of us would be more likely to start a business?",
  "What is {name}'s favourite way to spend a Sunday?",
  "Which of us would make friends with a stranger at a party faster?",
  "What meal does {name} make (or would make) that you love most?",
  "Which of us would win at poker?",
  "What habit of {name}'s have you unconsciously adopted?",
  "Which of us remembers anniversaries and dates better?",
  "What city in the world would {name} most like to live in?",
  "Which of us would handle a zombie apocalypse better?",
  "What is {name} passionate about that you've come to love because of them?",
  "Which of us would cry first at a wedding?",
  "What is {name}'s ideal Saturday afternoon?",
  "Which of us would be the calmer parent in a crisis?",
  "What is the one thing {name} would save in a house fire (besides people/pets)?",
  "Which of us is more sentimental?",
  "What personal achievement is {name} most proud of?",
  "Which of us would go viral on social media?",
  "What is {name}'s most-used phrase or expression?",
];

const COUPLE_NAMES = ["Nathan", "Kyle"] as const;
const QUESTION_COUNT = 3;

// ── Helpers ────────────────────────────────────────────────────────
/** Brisbane time (AEST = UTC+10, no DST). Returns "YYYY-MM-DD" local date. */
function getBrisbaneDate(): string {
  const brisMs = Date.now() + 10 * 60 * 60 * 1000;
  return new Date(brisMs).toISOString().split("T")[0];
}

/** Milliseconds until the next Brisbane midnight. */
function msUntilBrisbaneMidnight(): number {
  const brisMs = Date.now() + 10 * 60 * 60 * 1000;
  const bris = new Date(brisMs);
  const nextMid = new Date(bris);
  nextMid.setUTCDate(nextMid.getUTCDate() + 1);
  nextMid.setUTCHours(0, 0, 0, 0);
  return Math.max(0, nextMid.getTime() - brisMs);
}

/** Pick 3 distinct questions deterministically from the day key. */
function getDayQuestions(dayKey: string): [string, string, string] {
  const base = dayKey.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const seen  = new Set<number>();
  const idxs: number[] = [];
  for (let i = 0; idxs.length < QUESTION_COUNT; i++) {
    const idx = (base + i * 31) % TRIVIA_QUESTIONS.length;
    if (!seen.has(idx)) { seen.add(idx); idxs.push(idx); }
  }
  return idxs.map(i => TRIVIA_QUESTIONS[i]) as [string, string, string];
}

/** For each question slot, assign "Nathan" or "Kyle" so {name} always names someone. */
function getDaySlotNames(dayKey: string): [string, string, string] {
  const base = dayKey.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return [0, 1, 2].map(i => COUPLE_NAMES[(base + i) % 2]) as [string, string, string];
}

/** Replace {name} placeholder with the assigned name for this slot. */
function formatQ(question: string, name: string): string {
  return question.replace(/\{name\}/g, name);
}

function formatMs(ms: number) {
  const t = Math.max(0, ms);
  return {
    h: Math.floor(t / 3_600_000),
    m: Math.floor((t / 60_000) % 60),
    s: Math.floor((t / 1_000) % 60),
  };
}

function fireConfetti(intensity: "full" | "light" = "full") {
  const colors = ["#ffd700", "#ff69b4", "#ffffff", "#C53030", "#a855f7"];
  const pc     = intensity === "full" ? 60 : 28;
  const burst  = (angle: number, origin: { x: number; y: number }) =>
    confetti({ angle, spread: 65, startVelocity: 38, particleCount: pc, origin, colors });
  burst(60,  { x: 0.1, y: 0.6 });
  burst(120, { x: 0.9, y: 0.6 });
  if (intensity === "full") {
    setTimeout(() => burst(80,  { x: 0.3, y: 0.7 }), 200);
    setTimeout(() => burst(100, { x: 0.7, y: 0.7 }), 350);
  }
}

// ── Glass card style ───────────────────────────────────────────────
const GLASS: CSSProperties = { // 16 px radius, Apple-style 1px edge
  background:           "rgba(255,255,255,0.07)",
  backdropFilter:       "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border:               "1px solid rgba(255,255,255,0.10)",
  boxShadow:            "0 8px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.08)",
  borderRadius:         "16px",
};

// ── Connection Points counter ──────────────────────────────────────
function PointsCounter({ points }: { points: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-white/70 text-[10px] uppercase tracking-[0.22em]" style={QS}>
        Connection Points
      </p>
      <div className="relative overflow-hidden" style={{ height: 60 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={points}
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{    y: -32, opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className="text-[3.2rem] font-bold text-white tabular-nums block leading-none"
            style={PF}
          >
            {points.toLocaleString()}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-yellow-400 text-xs">✦</span>
        <span className="text-yellow-300/85 text-[10px] uppercase tracking-widest" style={QS}>pts</span>
        <span className="text-yellow-400 text-xs">✦</span>
      </div>
    </div>
  );
}

// ── Countdown (h:m:s — new questions each midnight) ────────────────
function CountdownBlock({ ms }: { ms: number }) {
  const { h, m, s } = formatMs(ms);
  const cells = [
    { v: h, label: "hrs" },
    { v: m, label: "min" },
    { v: s, label: "sec" },
  ];
  return (
    <div className="flex items-end gap-2 justify-center">
      {cells.map(({ v, label }, i) => (
        <div key={label} className="flex items-end gap-1">
          <div className="flex flex-col items-center">
            <div className="w-[52px] h-[52px] rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.14)" }}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={v}
                  initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="text-xl font-bold text-white tabular-nums" style={PF}>
                  {String(v).padStart(2, "0")}
                </motion.span>
              </AnimatePresence>
            </div>
            <p className="text-white/65 text-[9px] uppercase tracking-wider mt-1" style={QS}>{label}</p>
          </div>
          {i < 2 && <span className="text-white/60 text-lg mb-[14px] leading-none" style={PF}>:</span>}
        </div>
      ))}
    </div>
  );
}

// ── Single flip card with self-judgment buttons ────────────────────
function FlipCard({
  label, question,
  myName, myAnswer, myJudgment,
  partnerName, partnerAnswer, partnerJudgment,
  flipped, judgeable,
  onJudge,
}: {
  label: string; question: string;
  myName: string; myAnswer: string; myJudgment: boolean | null;
  partnerName: string; partnerAnswer: string; partnerJudgment: boolean | null;
  flipped: boolean; judgeable: boolean;
  onJudge: (correct: boolean) => void;
}) {
  const showButtons = judgeable && myJudgment === null;
  const minH = showButtons ? 240 : 186;

  return (
    <div style={{ perspective: 1100, width: "100%" }}>
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.78, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformStyle: "preserve-3d", position: "relative", minHeight: minH }}
      >
        {/* Front — question */}
        <div className="absolute inset-0 rounded-2xl p-4 flex flex-col justify-center"
          style={{ backfaceVisibility: "hidden", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)" }}>
          <p className="text-purple-400/60 text-[9px] uppercase tracking-widest mb-2" style={QS}>{label}</p>
          <p className="text-white leading-snug text-base" style={PF}>{question}</p>
          <p className="text-white/25 text-[10px] mt-3" style={QS}>Flipping…</p>
        </div>

        {/* Back — answers + judgment */}
        <div className="absolute inset-0 rounded-2xl p-4 flex flex-col gap-3"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.13)",
          }}>
          <p className="text-purple-300/50 text-[9px] uppercase tracking-widest" style={QS}>{label}</p>

          {/* Two answer panels */}
          <div className="flex gap-2">
            {/* My answer */}
            <div className="flex-1 rounded-xl p-2.5"
              style={{ background: "rgba(197,48,48,0.15)", border: "1px solid rgba(197,48,48,0.22)" }}>
              <p className="text-[#E88]/60 text-[8px] uppercase tracking-widest mb-1" style={QS}>{myName}</p>
              <p className="text-white/90 leading-snug" style={{ ...DS, fontSize: "1.1rem" }}>{myAnswer}</p>
              {myJudgment !== null && (
                <p className={`text-[10px] mt-1.5 font-semibold ${myJudgment ? "text-green-400" : "text-red-400"}`} style={QS}>
                  {myJudgment ? "✓ Got it" : "✗ Nope"}
                </p>
              )}
            </div>
            {/* Partner answer */}
            <div className="flex-1 rounded-xl p-2.5"
              style={{ background: "rgba(66,153,225,0.15)", border: "1px solid rgba(66,153,225,0.22)" }}>
              <p className="text-blue-300/60 text-[8px] uppercase tracking-widest mb-1" style={QS}>{partnerName}</p>
              <p className="text-white/90 leading-snug" style={{ ...DS, fontSize: "1.1rem" }}>{partnerAnswer || "…"}</p>
              {partnerJudgment !== null && (
                <p className={`text-[10px] mt-1.5 font-semibold ${partnerJudgment ? "text-green-400" : "text-red-400"}`} style={QS}>
                  {partnerJudgment ? "✓ Got it" : "✗ Nope"}
                </p>
              )}
            </div>
          </div>

          {/* Judgment buttons — only show while undecided */}
          {showButtons && (
            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => onJudge(true)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-green-300"
                style={{ background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.35)", ...QS }}>
                ✓ Got it
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => onJudge(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-red-300"
                style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", ...QS }}>
                ✗ Nope
              </motion.button>
            </div>
          )}

          {/* "Waiting for partner's verdict" hint */}
          {!showButtons && myJudgment !== null && partnerJudgment === null && (
            <p className="text-white/25 text-[10px] text-center" style={QS}>
              Waiting for {partnerName}'s verdict…
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Step progress dots ─────────────────────────────────────────────
function StepDots({ total, current, done }: { total: number; current: number; done: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div key={i}
          animate={{
            scale:   i === current ? 1.3 : 1,
            opacity: i < done ? 1 : i === current ? 1 : 0.3,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="rounded-full"
          style={{
            width:      i === current ? 10 : 7,
            height:     i === current ? 10 : 7,
            background: i < done
              ? "rgba(167,139,250,0.9)"
              : i === current
              ? "white"
              : "rgba(255,255,255,0.3)",
          }}
        />
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────
type Phase = "loading" | "answering" | "waiting" | "judging" | "waiting_judgment" | "revealed";
type Answers   = Record<number, string>;
type Judgments = Record<number, boolean>;

export default function TriviaPage() {
  const { profile, partnerProfile, tether } = useAuth();

  const dayKey       = getBrisbaneDate();
  const rawQuestions = getDayQuestions(dayKey);
  const slotNames    = getDaySlotNames(dayKey);
  const questions    = rawQuestions.map((q, i) => formatQ(q, slotNames[i])) as [string, string, string];
  const myId         = profile?.id ?? "";
  const myName       = profile?.full_name ?? "You";
  const partnerName  = partnerProfile?.full_name ?? "Partner";
  const partnerId    = partnerProfile?.id ?? null;

  const [phase,          setPhase]          = useState<Phase>("loading");
  const [step,           setStep]           = useState(0);
  const [myAnswers,      setMyAnswers]       = useState<Answers>({});
  const [partAnswers,    setPartAnswers]     = useState<Answers>({});
  const [myJudgments,    setMyJudgments]    = useState<Judgments>({});
  const [partnerJudgments, setPartnerJudgments] = useState<Judgments>({});
  const [draft,          setDraft]          = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [points,         setPoints]         = useState(0);
  const [pointsAwarded,  setPointsAwarded]  = useState(false);
  const [revealStep,     setRevealStep]     = useState(0);
  const [countdownMs,    setCountdown]      = useState(msUntilBrisbaneMidnight());

  // Refs for stale-closure safety in callbacks
  const myJudgmentsRef      = useRef<Judgments>({});
  const partnerJudgmentsRef = useRef<Judgments>({});
  const pointsAwardedRef    = useRef(false);
  const phaseRef            = useRef<Phase>("loading"); // always current phase
  const shouldAnimateRef    = useRef(false); // true = run sequential flip animation on phase change

  // Keep phaseRef in sync with phase state
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Live countdown
  useEffect(() => {
    const id = setInterval(() => setCountdown(msUntilBrisbaneMidnight()), 1_000);
    return () => clearInterval(id);
  }, []);

  // ── Award points (called once both have judged) ────────────────
  const awardPoints = useCallback(async (mj: Judgments, pj: Judgments) => {
    if (pointsAwardedRef.current || !tether) return;
    pointsAwardedRef.current = true;
    setPointsAwarded(true);

    const myCorrect   = Object.values(mj).filter(Boolean).length;
    const partCorrect = Object.values(pj).filter(Boolean).length;
    const total = myCorrect + partCorrect;
    const pts   = total === 0 ? 5 : total * 5;

    setPoints(prev => prev + pts);
    playSound("risingSwell");

    // Read current DB value to avoid stale add
    const { data: tet } = await supabase.from("tethers")
      .select("trivia_points").eq("id", tether.id).single();
    const cur = tet?.trivia_points ?? 0;
    await supabase.from("tethers").update({
      trivia_points: cur + pts,
      trivia_last_points_week: dayKey,
    }).eq("id", tether.id);

    // Celebratory feedback
    if (total === 6) { haptic("celebration"); fireConfetti("full"); }
    else if (total >= 4) { haptic("success");     fireConfetti("light"); }
    else                 { haptic("success"); }
  }, [tether, dayKey]);

  // ── Fetch today's data on mount ────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!tether || !myId) return;

    const [{ data: rows }, { data: tet }] = await Promise.all([
      supabase.from("trivia_answers").select("*")
        .eq("tether_id", tether.id).eq("day_key", dayKey),
      supabase.from("tethers").select("trivia_points, trivia_last_points_week")
        .eq("id", tether.id).single(),
    ]);

    if (tet) setPoints(tet.trivia_points ?? 0);

    const mine    = (rows ?? []).filter(r => r.user_id === myId);
    const partner = (rows ?? []).filter(r => r.user_id === partnerId);

    const myMap: Answers = {};
    mine.forEach(r => { myMap[r.question_index] = r.answer; });
    const partMap: Answers = {};
    partner.forEach(r => { partMap[r.question_index] = r.answer; });
    setMyAnswers(myMap);
    setPartAnswers(partMap);

    const myDone   = mine.length   === QUESTION_COUNT;
    const partDone = partner.length === QUESTION_COUNT;

    if (myDone && partDone) {
      // Build judgment maps from is_correct column
      const myJMap: Judgments   = {};
      mine.filter(r => r.is_correct !== null && r.is_correct !== undefined)
          .forEach(r => { myJMap[r.question_index] = r.is_correct; });
      const pjMap: Judgments    = {};
      partner.filter(r => r.is_correct !== null && r.is_correct !== undefined)
             .forEach(r => { pjMap[r.question_index] = r.is_correct; });

      myJudgmentsRef.current      = myJMap;
      partnerJudgmentsRef.current = pjMap;
      setMyJudgments(myJMap);
      setPartnerJudgments(pjMap);

      const myJudged   = Object.keys(myJMap).length   === QUESTION_COUNT;
      const partJudged = Object.keys(pjMap).length    === QUESTION_COUNT;

      // On load, skip flip animation — cards show already flipped
      shouldAnimateRef.current = false;
      setRevealStep(3);

      if (myJudged && partJudged) {
        pointsAwardedRef.current = tet?.trivia_last_points_week === dayKey;
        setPointsAwarded(tet?.trivia_last_points_week === dayKey);
        setPhase("revealed");
      } else if (myJudged) {
        setPhase("waiting_judgment");
      } else {
        setPhase("judging");
      }
    } else if (myDone) {
      setPhase("waiting");
    } else {
      const nextUnanswered = [0, 1, 2].find(i => myMap[i] === undefined) ?? 0;
      setStep(nextUnanswered);
      setPhase("answering");
    }
  }, [tether, myId, partnerId, dayKey]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Realtime: partner answering + partner judging ──────────────
  useEffect(() => {
    if (!tether) return;

    const handleInsert = (row: Record<string, unknown>) => {
      if (row.day_key !== dayKey || row.user_id === myId) return;
      setPartAnswers(prev => {
        const next = { ...prev, [row.question_index as number]: row.answer as string };
        if (Object.keys(next).length === QUESTION_COUNT) {
          haptic("envelope");
          // Only animate when coming from "waiting" — guard against late/duplicate events
          if (phaseRef.current === "waiting") {
            shouldAnimateRef.current = true;
            setRevealStep(0);
            setPhase("judging");
          }
        }
        return next;
      });
    };

    const handleUpdate = (row: Record<string, unknown>) => {
      // Skip our own rows and rows without is_correct
      if (row.user_id === myId) return;
      if (row.day_key !== dayKey) return;
      if (row.is_correct === null || row.is_correct === undefined) return;
      setPartnerJudgments(prev => {
        const next = { ...prev, [row.question_index as number]: row.is_correct as boolean };
        partnerJudgmentsRef.current = next;
        return next;
      });
    };

    const ch = supabase
      .channel(`trivia-day-${tether.id}-${dayKey}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "trivia_answers",
        filter: `tether_id=eq.${tether.id}`,
      }, payload => handleInsert(payload.new as Record<string, unknown>))
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "trivia_answers",
        filter: `tether_id=eq.${tether.id}`,
      }, payload => handleUpdate(payload.new as Record<string, unknown>))
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [tether, myId, dayKey]);

  // ── Drive phase forward based on judgment counts ───────────────
  // This single effect is the ONLY source of truth for judgment-based
  // phase transitions, eliminating all timing races from callbacks.
  useEffect(() => {
    const myDone   = Object.keys(myJudgments).length   === QUESTION_COUNT;
    const partDone = Object.keys(partnerJudgments).length === QUESTION_COUNT;

    if (phaseRef.current === "judging" && myDone) {
      if (partDone) {
        awardPoints(myJudgments, partnerJudgments);
        setPhase("revealed");
      } else {
        setPhase("waiting_judgment");
      }
    }

    if (phaseRef.current === "waiting_judgment" && myDone && partDone) {
      awardPoints(myJudgments, partnerJudgments);
      setPhase("revealed");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myJudgments, partnerJudgments]);

  // ── Sequential flip animation when entering "judging" ─────────
  useEffect(() => {
    if (phase !== "judging") return;
    if (!shouldAnimateRef.current) return; // skip on page load
    shouldAnimateRef.current = false;

    const t0 = setTimeout(() => { haptic("reveal"); setRevealStep(1); }, 500);
    const t1 = setTimeout(() => { haptic("reveal"); setRevealStep(2); }, 1_400);
    const t2 = setTimeout(() => { haptic("reveal"); setRevealStep(3); }, 2_300);

    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
  }, [phase]);

  // ── Submit one answer ──────────────────────────────────────────
  const submitAnswer = useCallback(async () => {
    if (!draft.trim() || !tether || submitting) return;
    setSubmitting(true);
    haptic("light");

    const { error } = await supabase.from("trivia_answers").insert({
      tether_id:      tether.id,
      day_key:        dayKey,
      question_index: step,
      user_id:        myId,
      answer:         draft.trim(),
    });

    if (error) { setSubmitting(false); return; }

    haptic("success");
    const saved = draft.trim();
    setDraft("");
    setSubmitting(false);

    const newMyAnswers = { ...myAnswers, [step]: saved };
    setMyAnswers(newMyAnswers);

    if (step < QUESTION_COUNT - 1) {
      setStep(step + 1);
    } else {
      if (Object.keys(partAnswers).length === QUESTION_COUNT) {
        shouldAnimateRef.current = true;
        setRevealStep(0);
        setPhase("judging");
      } else {
        setPhase("waiting");
        if (tether) {
          import("@/lib/notifications").then(({ sendTriviaNotification }) => {
            sendTriviaNotification(tether.id, myId, myName).catch(() => {});
          });
        }
      }
    }
  }, [draft, tether, submitting, dayKey, step, myId, myName, myAnswers, partAnswers]);

  // ── Self-judge one answer ──────────────────────────────────────
  // Phase transitions are driven by the judgment-count useEffect above.
  // This callback only updates local state + DB.
  const submitJudgment = useCallback(async (qi: number, isCorrect: boolean) => {
    if (!tether) return;
    // Prevent double-judging the same card
    if (myJudgmentsRef.current[qi] !== undefined) return;

    haptic("light");

    const newMJ = { ...myJudgmentsRef.current, [qi]: isCorrect };
    myJudgmentsRef.current = newMJ;
    setMyJudgments({ ...newMJ });

    if (Object.keys(newMJ).length === QUESTION_COUNT) haptic("success");

    // Persist to DB — the realtime UPDATE event will update the partner's state
    await supabase.from("trivia_answers")
      .update({ is_correct: isCorrect })
      .eq("tether_id", tether.id)
      .eq("day_key",   dayKey)
      .eq("question_index", qi)
      .eq("user_id", myId);
  }, [tether, dayKey, myId]);

  const currentQuestion = questions[step] ?? "";
  const myAnswerCount   = Object.keys(myAnswers).length;
  const myCorrectCount  = Object.values(myJudgments).filter(Boolean).length;
  const ptCorrectCount  = Object.values(partnerJudgments).filter(Boolean).length;
  const totalCorrect    = myCorrectCount + ptCorrectCount;

  return (
    <PullToRefresh onRefresh={fetchData} className="trivia-bg flex flex-col h-full overscroll-none">

      {/* GPU-composited animated background layer — zero repaint */}
      <div className="trivia-bg-layer" />

      {/* Ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl opacity-40"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)" }} />
        <div className="absolute bottom-20 -right-16 w-64 h-64 rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, #C53030 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10 flex flex-col gap-5 px-5 pt-4 pb-8">

        {/* Connection Points */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <PointsCounter points={points} />
        </motion.div>

        {/* Daily label */}
        <motion.div className="flex flex-col items-center gap-0.5"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}>
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-white/10 max-w-[40px]" />
            <p className="text-white/65 text-[10px] uppercase tracking-[0.25em]" style={QS}>Daily Challenge</p>
            <div className="h-px flex-1 bg-white/10 max-w-[40px]" />
          </div>
          <p className="text-white/60 text-[9px]" style={QS}>{dayKey} · 3 questions</p>
        </motion.div>

        {/* ── Phase content ── */}
        <AnimatePresence mode="wait">

          {/* LOADING */}
          {phase === "loading" && (
            <motion.div key="loading" className="flex items-center justify-center py-16"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="w-8 h-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            </motion.div>
          )}

          {/* ANSWERING — step through Q1, Q2, Q3 */}
          {phase === "answering" && (
            <motion.div key="answering"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-4">

              {/* Progress */}
              <div className="flex flex-col items-center gap-2">
                <StepDots total={QUESTION_COUNT} current={step} done={myAnswerCount} />
                <p className="text-white/65 text-[10px]" style={QS}>
                  Question {step + 1} of {QUESTION_COUNT}
                </p>
              </div>

              {/* Question card — slides in from right on each step */}
              <AnimatePresence mode="wait">
                <motion.div key={step}
                  initial={{ opacity: 0, x: 55 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -35 }}
                  transition={{ type: "spring", stiffness: 300, damping: 28 }}>

                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
                    style={{ ...GLASS, willChange: "transform" }} className="p-5 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-purple-400 text-xs">✦</span>
                      <p className="text-white/40 text-[10px] uppercase tracking-widest" style={QS}>
                        Question {step + 1}
                      </p>
                    </div>
                    <p className="text-white text-[1.1rem] leading-snug" style={PF}>{currentQuestion}</p>
                  </motion.div>

                  {/* Answer form */}
                  <div style={GLASS} className="p-5 flex flex-col gap-3">
                    <p className="text-white/45 text-[10px] uppercase tracking-widest" style={QS}>Your answer</p>
                    <textarea
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      placeholder="Type your answer…"
                      rows={3}
                      className="w-full rounded-xl px-4 py-3 text-white placeholder-white/25 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400/40"
                      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", ...DS, fontSize: "1.25rem" }}
                    />
                    <motion.button
                      onClick={() => { haptic("light"); submitAnswer(); }}
                      disabled={!draft.trim() || submitting}
                      whileTap={{ scale: 0.95 }}
                      className="w-full py-3.5 rounded-xl font-semibold text-white text-sm tracking-wide disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg, #7c3aed, #C53030)", boxShadow: "0 4px 20px rgba(124,58,237,0.35)", ...QS }}>
                      {submitting
                        ? "Saving…"
                        : step < QUESTION_COUNT - 1
                        ? `Next Question →`
                        : "Submit All Answers ✦"}
                    </motion.button>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Previously answered (mini recap) */}
              {myAnswerCount > 0 && (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: myAnswerCount }).map((_, i) => (
                    <div key={i} className="rounded-xl px-4 py-2.5 flex items-start gap-2"
                      style={{ background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.18)" }}>
                      <span className="text-purple-400/85 text-[10px] mt-0.5" style={QS}>Q{i + 1}</span>
                      <p className="text-white/80 leading-snug flex-1" style={{ ...DS, fontSize: "1.05rem" }}>
                        {myAnswers[i]}
                      </p>
                      <span className="text-purple-400/50 text-xs">✓</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* WAITING — I answered all 3, waiting for partner */}
          {phase === "waiting" && (
            <motion.div key="waiting"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              className="flex flex-col gap-4">

              {/* My 3 answers recap */}
              <div style={GLASS} className="p-5 flex flex-col gap-3">
                <p className="text-white/70 text-[10px] uppercase tracking-widest" style={QS}>Your answers</p>
                {questions.map((q, i) => (
                  <div key={i} className="rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(167,139,250,0.10)", border: "1px solid rgba(167,139,250,0.18)" }}>
                    <p className="text-purple-300/80 text-[9px] uppercase tracking-widest mb-1" style={QS}>Q{i + 1}</p>
                    <p className="text-white/80 leading-snug" style={{ ...DS, fontSize: "1.2rem" }}>{myAnswers[i]}</p>
                  </div>
                ))}
              </div>

              {/* Waiting indicator */}
              <div style={GLASS} className="p-5 flex flex-col items-center gap-3 text-center">
                <div className="relative w-12 h-12">
                  <motion.div animate={{ rotate: 360 }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-2 border-purple-400/30 border-t-purple-400" />
                  <span className="absolute inset-0 flex items-center justify-center text-xl">✉️</span>
                </div>
                <p className="text-white font-semibold text-sm" style={PF}>
                  Waiting for {partnerName}…
                </p>
                <p className="text-white/65 text-xs" style={QS}>
                  Once {partnerName} finishes all 3, you'll both get to judge your own answers
                </p>
                {Object.keys(partAnswers).length > 0 && (
                  <p className="text-purple-300/85 text-xs" style={QS}>
                    {partnerName} has answered {Object.keys(partAnswers).length} of 3 so far…
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* JUDGING — cards flip in, then each player marks their own answer */}
          {phase === "judging" && (
            <motion.div key="judging"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-3">

              <div className="text-center">
                <p className="text-white/60 text-sm" style={PF}>
                  {revealStep < 3 ? "Revealing your answers…" : "Did you get it right?"}
                </p>
                {revealStep === 3 && (
                  <p className="text-white/65 text-xs mt-1" style={QS}>
                    Judge each of your own answers honestly ✦
                  </p>
                )}
              </div>

              {questions.map((q, i) => (
                <FlipCard key={i}
                  label={`Question ${i + 1}`}
                  question={q}
                  myName={myName}
                  myAnswer={myAnswers[i] ?? ""}
                  myJudgment={myJudgments[i] ?? null}
                  partnerName={partnerName}
                  partnerAnswer={partAnswers[i] ?? ""}
                  partnerJudgment={partnerJudgments[i] ?? null}
                  flipped={revealStep > i}
                  judgeable={revealStep > i}
                  onJudge={isCorrect => submitJudgment(i, isCorrect)}
                />
              ))}

              {/* Progress hint */}
              {revealStep === 3 && Object.keys(myJudgments).length < QUESTION_COUNT && (
                <p className="text-white/60 text-center text-[11px]" style={QS}>
                  {QUESTION_COUNT - Object.keys(myJudgments).length} answer{Object.keys(myJudgments).length < 2 ? "s" : ""} left to judge
                </p>
              )}
            </motion.div>
          )}

          {/* WAITING_JUDGMENT — I've judged all 3, waiting for partner to judge */}
          {phase === "waiting_judgment" && (
            <motion.div key="waiting_judgment"
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 24 }}
              className="flex flex-col gap-4">

              {/* My judgments recap */}
              <div style={GLASS} className="p-5 flex flex-col gap-3">
                <p className="text-white/40 text-[10px] uppercase tracking-widest" style={QS}>Your verdicts</p>
                {questions.map((q, i) => (
                  <div key={i} className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                    style={{
                      background: myJudgments[i] ? "rgba(52,211,153,0.10)" : "rgba(239,68,68,0.10)",
                      border: myJudgments[i] ? "1px solid rgba(52,211,153,0.22)" : "1px solid rgba(239,68,68,0.22)",
                    }}>
                    <span className={`text-sm ${myJudgments[i] ? "text-green-400" : "text-red-400"}`}>
                      {myJudgments[i] ? "✓" : "✗"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/40 text-[9px] uppercase tracking-widest mb-0.5" style={QS}>Q{i + 1}</p>
                      <p className="text-white/75 leading-snug truncate" style={{ ...DS, fontSize: "1.05rem" }}>{myAnswers[i]}</p>
                    </div>
                  </div>
                ))}
                <p className="text-white/40 text-xs text-center" style={QS}>
                  You got {myCorrectCount} of 3 right
                </p>
              </div>

              {/* Waiting for partner */}
              <div style={GLASS} className="p-5 flex flex-col items-center gap-3 text-center">
                <div className="relative w-12 h-12">
                  <motion.div animate={{ rotate: 360 }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-2 border-purple-400/30 border-t-purple-400" />
                  <span className="absolute inset-0 flex items-center justify-center text-xl">⚖️</span>
                </div>
                <p className="text-white font-semibold text-sm" style={PF}>
                  Waiting for {partnerName}'s verdicts…
                </p>
                <p className="text-white/35 text-xs" style={QS}>
                  Results appear the moment {partnerName} finishes judging
                </p>
                {Object.keys(partnerJudgments).length > 0 && (
                  <p className="text-purple-300/60 text-xs" style={QS}>
                    {partnerName} has judged {Object.keys(partnerJudgments).length} of 3…
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* REVEALED — full results + countdown */}
          {phase === "revealed" && (
            <motion.div key="revealed"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col gap-4">

              {/* Score banner */}
              <motion.div style={GLASS} className="p-4 flex flex-col items-center gap-2"
                initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}>
                {totalCorrect === 6 && (
                  <p className="text-yellow-300 font-bold tracking-widest text-sm" style={PF}>
                    ✦ PERFECT ROUND! ✦
                  </p>
                )}
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-white text-2xl font-bold tabular-nums" style={PF}>{myCorrectCount}/3</p>
                    <p className="text-white/65 text-[9px] uppercase tracking-widest" style={QS}>{myName}</p>
                  </div>
                  <div className="w-px h-10 bg-white/15" />
                  <div className="text-center">
                    <p className="text-white text-2xl font-bold tabular-nums" style={PF}>{ptCorrectCount}/3</p>
                    <p className="text-white/65 text-[9px] uppercase tracking-widest" style={QS}>{partnerName}</p>
                  </div>
                </div>
                <p className="text-white/70 text-xs" style={QS}>
                  {totalCorrect === 6 ? "You both nailed it! 🎉"
                   : totalCorrect >= 4 ? "Amazing round together!"
                   : totalCorrect >= 2 ? "Nice effort!"
                   : "Every round brings you closer ♡"}
                  {" "}+{totalCorrect === 0 ? 5 : totalCorrect * 5} pts
                </p>
              </motion.div>

              {/* 3 result cards */}
              {questions.map((q, i) => {
                const myOk   = myJudgments[i]      === true;
                const partOk = partnerJudgments[i] === true;
                const bothOk = myOk && partOk;
                return (
                  <div key={i} style={{
                    ...GLASS,
                    border:     bothOk ? "1px solid rgba(255,210,60,0.40)" : GLASS.border,
                    boxShadow:  bothOk ? "0 0 24px rgba(255,200,50,0.20)" : GLASS.boxShadow,
                  }} className="p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      <p className="text-purple-300/50 text-[9px] uppercase tracking-widest" style={QS}>Q{i + 1}</p>
                      {bothOk && <span className="text-yellow-400 text-[9px]">✦ Both got it!</span>}
                    </div>
                    <p className="text-white/55 text-xs italic mb-3 leading-snug" style={PF}>"{q}"</p>
                    <div className="flex gap-2">
                      <div className="flex-1 rounded-xl px-3 py-2"
                        style={{
                          background: myOk ? "rgba(52,211,153,0.12)" : "rgba(197,48,48,0.12)",
                          border:     myOk ? "1px solid rgba(52,211,153,0.25)" : "1px solid rgba(197,48,48,0.20)",
                        }}>
                        <p className="text-[#E88]/50 text-[8px] uppercase tracking-widest mb-1" style={QS}>{myName}</p>
                        <p className="text-white/85 leading-snug" style={{ ...DS, fontSize: "1.1rem" }}>{myAnswers[i]}</p>
                        <p className={`text-[10px] mt-1 font-semibold ${myOk ? "text-green-400" : "text-red-400"}`} style={QS}>
                          {myOk ? "✓ Got it" : "✗ Nope"}
                        </p>
                      </div>
                      <div className="flex-1 rounded-xl px-3 py-2"
                        style={{
                          background: partOk ? "rgba(52,211,153,0.12)" : "rgba(66,153,225,0.12)",
                          border:     partOk ? "1px solid rgba(52,211,153,0.25)" : "1px solid rgba(66,153,225,0.20)",
                        }}>
                        <p className="text-blue-300/50 text-[8px] uppercase tracking-widest mb-1" style={QS}>{partnerName}</p>
                        <p className="text-white/85 leading-snug" style={{ ...DS, fontSize: "1.1rem" }}>{partAnswers[i]}</p>
                        <p className={`text-[10px] mt-1 font-semibold ${partOk ? "text-green-400" : "text-red-400"}`} style={QS}>
                          {partOk ? "✓ Got it" : "✗ Nope"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Countdown to next questions */}
              <div style={GLASS} className="p-5 flex flex-col items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-purple-400/60 text-xs">✦</span>
                  <p className="text-white/70 text-[10px] uppercase tracking-widest" style={QS}>
                    New questions at midnight
                  </p>
                  <span className="text-purple-400/60 text-xs">✦</span>
                </div>
                <CountdownBlock ms={countdownMs} />
                <p className="text-white/60 text-[9px]" style={QS}>
                  Come back tomorrow for 3 new questions
                </p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </PullToRefresh>
  );
}
