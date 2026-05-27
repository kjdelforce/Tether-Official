import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { haptic } from "@/lib/haptics";
import { playSound } from "@/lib/audioManager";
import { sendDailyConnectionNotification } from "@/lib/notifications";

// ── Background-sync helpers ────────────────────────────────────────
//
// `runIdle` schedules low-priority work using requestIdleCallback
// when available (so the silent poll doesn't compete with user
// input or animation frames), falling back to setTimeout(0) on
// browsers that lack idle scheduling (Safari).
//
// `sameAnswerSet` does a cheap structural compare on two answer
// arrays so we only re-render when something actually changed.
// We compare length, ids, and answer_text — that's the entire
// surface the UI binds to.  Stable identity → React skips the
// subtree, motion.div animations keep their existing loop, no
// flicker.
type IdleHandle = number;
function runIdle(fn: () => void): IdleHandle {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === "function") {
    return w.requestIdleCallback(fn, { timeout: 2000 });
  }
  return window.setTimeout(fn, 0) as unknown as number;
}
function sameAnswerSet(a: DailyAnswer[], b: DailyAnswer[]): boolean {
  if (a.length !== b.length) return false;
  // Order-insensitive compare keyed by question_index — at most 3
  // entries per side, so O(n²) is fine and avoids allocating a Map.
  for (const row of a) {
    const match = b.find(r => r.id === row.id);
    if (!match || match.answer_text !== row.answer_text) return false;
  }
  return true;
}

const PLAYFAIR = { fontFamily: "'Playfair Display', serif" };
const CAVEAT   = { fontFamily: "'Dancing Script', cursive" };
const QS       = { fontFamily: "'Quicksand', sans-serif" };

const RELATIONSHIP_QUESTIONS = [
  "What is one thing I do that makes you feel safest?",
  "What is a memory of us that always makes you smile?",
  "What is something you've never told me but always wanted to?",
  "What moment in our relationship made you fall deeper in love?",
  "What's a dream you have for our future together?",
  "What's something I do that you find incredibly attractive?",
  "If you could relive one day we've spent together, which would it be?",
  "What's a fear you have about us that you've never shared?",
  "What's the most romantic thing I've ever done for you?",
  "What does 'home' feel like when you're with me?",
  "What's something you admire about how I love you?",
  "What's a song that reminds you of us and why?",
  "What's one thing you wish we did more of together?",
  "What was going through your mind the first time you saw me?",
  "What's a quality of mine that you hope never changes?",
  "What's the hardest conversation we've had, and how did it make us stronger?",
  "What's a small gesture I make that means the world to you?",
  "If our love story were a movie, what would the title be?",
  "What's something you're grateful I introduced you to?",
  "What does your ideal morning with me look like?",
  "What's a vulnerability you've shown me that was hard but worth it?",
  "What's one thing about our relationship that surprises you?",
  "What's a place that holds a special memory for us?",
  "What's something I've taught you about love?",
  "What scent or sound instantly reminds you of me?",
  "What's a challenge we've overcome that you're proud of?",
  "What's your favorite inside joke between us?",
  "What's one thing you'd change about how we communicate?",
  "When do you feel most connected to me?",
  "What's a promise you've silently made to me?",
  "What do you love most about the way we fight?",
  "What's a tradition you want to start together?",
  "What's something about me that took time to understand but now you love?",
  "What does it feel like when we're apart for too long?",
  "What's the bravest thing you've done for our relationship?",
  "What's one thing about me that always makes you laugh?",
  "What moment made you realize 'this is the one'?",
  "What's a way I've grown since we've been together?",
  "What's something you want to experience with me before we're old?",
  "If you wrote me a love letter right now, what would the first line be?",
];

const ADULT_QUESTIONS = [
  "If we brought a third into the bedroom tonight, what is the first rule you would set?",
  "Describe your favorite sexual memory of us in 5 words.",
  "What's a fantasy you haven't told me about yet?",
  "What's the hottest thing I've ever whispered to you?",
  "If you could pick one new position to try tonight, what would it be?",
  "What's something I do in bed that drives you absolutely wild?",
  "Describe how you'd seduce me if we had the house to ourselves right now.",
  "What's the most unexpected place you've wanted to have sex with me?",
  "What's a kink you're curious about exploring together?",
  "If you could script our next intimate night from start to finish, what happens?",
  "What's the dirtiest text you've ever wanted to send me but didn't?",
  "What's a role-play scenario that turns you on?",
  "What part of my body do you think about most when I'm not around?",
  "What's something you've always wanted me to do to you but never asked?",
  "If we made a sex bucket list, what's the first three things on it?",
  "What's the most intense orgasm you've ever had with me, and what made it so good?",
  "What's something I wear that makes you instantly want to take it off?",
  "Describe the perfect foreplay session with me.",
  "What's a sexual compliment you've been holding back?",
  "If you could relive one sexual experience we've had, which one and why?",
];

function getLoganDate(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function seedRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function getQuestionsForDate(dateStr: string): string[] {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayNum = new Date(y, m - 1, d).getTime() / 86400000 | 0;
  const rng = seedRandom(dayNum * 7919 + 31337);

  const result: string[] = [];
  const adultSlot = Math.floor(rng() * 3);
  const usedRelIdx = new Set<number>();

  for (let i = 0; i < 3; i++) {
    if (i === adultSlot) {
      const idx = Math.floor(rng() * ADULT_QUESTIONS.length);
      result.push(ADULT_QUESTIONS[idx]);
    } else {
      let idx = Math.floor(rng() * RELATIONSHIP_QUESTIONS.length);
      let tries = 0;
      while (usedRelIdx.has(idx) && tries < 40) {
        idx = (idx + 1) % RELATIONSHIP_QUESTIONS.length;
        tries++;
      }
      usedRelIdx.add(idx);
      result.push(RELATIONSHIP_QUESTIONS[idx]);
    }
  }
  return result;
}

function fmtDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function fmtDateShort(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

interface DailyAnswer {
  id: string;
  user_id: string;
  question_date: string;
  question_index: number;
  answer_text: string;
}

interface ArchiveEntry {
  question_date: string;
  question_text: string;
  myAnswer: string;
  partnerAnswer: string;
}

function DailyConnectionCardInner({
  tetherId,
  myId,
  myName,
  partnerId,
  partnerName,
}: {
  tetherId: string;
  myId: string;
  myName: string;
  partnerId: string | null;
  partnerName: string;
}) {
  const [today, setToday] = useState(getLoganDate);

  // Memoised so the question array keeps stable identity between
  // renders for the same calendar day — prevents the `questions[i]`
  // strings from flickering (and motion's `key`s from churning) on
  // every state update.
  const questions = useMemo(() => getQuestionsForDate(today), [today]);

  const [myAnswers,      setMyAnswers]      = useState<DailyAnswer[]>([]);
  const [partnerAnswers, setPartnerAnswers] = useState<DailyAnswer[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [dbError,        setDbError]        = useState(false);
  const [draftText,      setDraftText]      = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [revealed,       setRevealed]       = useState<Record<number, boolean>>({});
  const [completedAnim,  setCompletedAnim]  = useState<Record<number, boolean>>({});

  useEffect(() => {
    const checkDate = () => {
      const now = getLoganDate();
      if (now !== today) {
        setToday(now);
        setMyAnswers([]);
        setPartnerAnswers([]);
        setRevealed({});
        setCompletedAnim({});
        setDraftText("");
      }
    };
    const iv = setInterval(checkDate, 30000);
    return () => clearInterval(iv);
  }, [today]);
  const [showArchive,    setShowArchive]    = useState(false);
  const [archive,        setArchive]        = useState<ArchiveEntry[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);

  // ── Fetch core ──────────────────────────────────────────────────
  // `fetchToday` runs the query and decides whether to commit the
  // result.  The `silent` flag controls two things at once:
  //
  //   silent=false  →  initial mount.  We toggle the loading
  //                    skeleton (correct UX on first paint).
  //   silent=true   →  background polls / realtime updates.  We
  //                    NEVER touch loading, and we only commit
  //                    state when the answer set actually changed
  //                    (per `sameAnswerSet`).  No new array
  //                    references → React skips the subtree → no
  //                    flicker, no animation restart.
  const fetchToday = useCallback(async (silent: boolean = false) => {
    if (!silent) setLoading(true);

    const userIds = partnerId ? [myId, partnerId] : [myId];
    const { data, error } = await supabase
      .from("daily_answers")
      .select("*")
      .eq("tether_id", tetherId)
      .eq("question_date", today)
      .in("user_id", userIds);

    if (error) {
      setDbError(true);
    } else if (data) {
      setDbError(false);
      const typed = data as DailyAnswer[];
      const nextMine    = typed.filter(r => r.user_id === myId);
      const nextPartner = partnerId ? typed.filter(r => r.user_id === partnerId) : [];

      // Diff before commit so identical payloads never trigger a
      // re-render.  Functional updaters are used so we always
      // compare against the latest state, not a stale closure.
      setMyAnswers(prev => sameAnswerSet(prev, nextMine) ? prev : nextMine);
      setPartnerAnswers(prev => sameAnswerSet(prev, nextPartner) ? prev : nextPartner);
    }

    if (!silent) setLoading(false);
  }, [tetherId, myId, partnerId, today]);

  // Initial mount fetch — shows the loading skeleton once.
  useEffect(() => {
    fetchToday(false);
  }, [fetchToday]);

  // Background sync — every 60s, scheduled as low-priority idle
  // work so it doesn't compete with input or animation frames.
  // Uses the silent code path so the UI doesn't flash.
  useEffect(() => {
    const iv = setInterval(() => {
      runIdle(() => { void fetchToday(true); });
    }, 60_000);
    return () => clearInterval(iv);
  }, [fetchToday]);

  const myAnswerFor    = (idx: number) => myAnswers.find(a => a.question_index === idx);
  const partAnswerFor  = (idx: number) => partnerAnswers.find(a => a.question_index === idx);
  const bothAnswered   = (idx: number) => !!(myAnswerFor(idx) && partAnswerFor(idx));

  let activeIndex = 0;
  for (let i = 0; i < 3; i++) {
    if (bothAnswered(i) && i < 2) activeIndex = i + 1;
    else { activeIndex = i; break; }
  }
  if (bothAnswered(2)) activeIndex = 2;

  const allComplete = bothAnswered(0) && bothAnswered(1) && bothAnswered(2);

  // Stable identity via `useCallback` so `<AnswerForm onSubmit={submitAnswer}>`
  // doesn't churn the child's memo'd props on every parent render.
  // We read the latest `draftText` / `submitting` from inside the
  // closure — both are deps so the function refreshes when they
  // change, but stays stable across unrelated renders.
  const submitAnswer = useCallback(async (questionIndex: number) => {
    if (!draftText.trim() || submitting) return;
    haptic("light");
    playSound("glassClick");
    setSubmitting(true);
    const { data, error } = await supabase
      .from("daily_answers")
      .insert({
        tether_id:      tetherId,
        user_id:        myId,
        question_date:  today,
        question_index: questionIndex,
        answer_text:    draftText.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setMyAnswers(prev => [...prev, data as DailyAnswer]);
      setDraftText("");
      haptic("success");

      sendDailyConnectionNotification(tetherId, myId, myName);
    }
    setSubmitting(false);
  }, [draftText, submitting, tetherId, myId, today, myName]);

  function handleReveal(idx: number) {
    haptic("medium");
    playSound("shimmer");
    setRevealed(prev => ({ ...prev, [idx]: true }));
  }

  function handleCompletedAnim(idx: number) {
    if (completedAnim[idx]) return;
    setCompletedAnim(prev => ({ ...prev, [idx]: true }));
  }

  async function loadArchive() {
    if (archiveLoading) return;
    setArchiveLoading(true);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 31);
    const since = thirtyDaysAgo.toISOString().split("T")[0];

    const userIds = partnerId ? [myId, partnerId] : [myId];
    const { data } = await supabase
      .from("daily_answers")
      .select("*")
      .eq("tether_id", tetherId)
      .in("user_id", userIds)
      .gte("question_date", since)
      .lt("question_date", today)
      .order("question_date", { ascending: false });

    if (data) {
      const typed = data as DailyAnswer[];
      const byDateQ: Record<string, Record<number, { mine?: DailyAnswer; theirs?: DailyAnswer }>> = {};
      for (const row of typed) {
        const key = row.question_date;
        if (!byDateQ[key]) byDateQ[key] = {};
        if (!byDateQ[key][row.question_index]) byDateQ[key][row.question_index] = {};
        if (row.user_id === myId) byDateQ[key][row.question_index].mine = row;
        else if (row.user_id === partnerId) byDateQ[key][row.question_index].theirs = row;
      }

      const entries: ArchiveEntry[] = [];
      for (const [date, qs] of Object.entries(byDateQ)) {
        const dayQuestions = getQuestionsForDate(date);
        for (const [idxStr, v] of Object.entries(qs)) {
          if (v.mine && v.theirs) {
            entries.push({
              question_date:  date,
              question_text:  dayQuestions[Number(idxStr)] ?? "...",
              myAnswer:       v.mine.answer_text,
              partnerAnswer:  v.theirs.answer_text,
            });
          }
        }
      }
      entries.sort((a, b) => b.question_date.localeCompare(a.question_date));
      setArchive(entries);
    }
    setArchiveLoading(false);
  }

  function toggleArchive() {
    haptic("light");
    if (!showArchive && archive.length === 0) loadArchive();
    setShowArchive(v => !v);
  }

  return (
    <div className="space-y-3" style={{ padding: "16px 24px 0 24px" }}>
      <div className="flex items-center justify-between">
        <p className="text-blue-300/80 text-[10px] uppercase tracking-widest font-semibold">
          Daily Connection
        </p>
        <button
          onClick={toggleArchive}
          className="text-blue-300/50 text-[10px] uppercase tracking-widest active:text-blue-200 transition-colors"
          style={QS}
        >
          {showArchive ? "Hide Archive" : "Previous Days"}
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2">
        {[0, 1, 2].map(i => {
          const done = bothAnswered(i);
          return (
            <div key={i} className="flex items-center gap-2">
              <motion.div
                animate={{
                  background: done
                    ? "linear-gradient(135deg, #D4A017, #F6E05E)"
                    : i === activeIndex
                      ? "linear-gradient(135deg, #C53030, #E53E3E)"
                      : "rgba(255,255,255,0.15)",
                  scale: i === activeIndex && !done ? [1, 1.15, 1] : 1,
                }}
                transition={i === activeIndex && !done ? { duration: 1.5, repeat: Infinity } : { duration: 0.3 }}
                style={{
                  width: 10, height: 10, borderRadius: "50%",
                  boxShadow: done ? "0 0 8px rgba(212,160,23,0.5)" : "none",
                }}
              />
              {i < 2 && (
                <div style={{
                  width: 24, height: 1.5,
                  background: done ? "rgba(212,160,23,0.5)" : "rgba(255,255,255,0.1)",
                  borderRadius: 1,
                }} />
              )}
            </div>
          );
        })}
        <span className="text-white/40 text-[10px] ml-2" style={QS}>
          {myAnswers.length + partnerAnswers.length}/6
        </span>
      </div>

      {/* Question cards */}
      {[0, 1, 2].map(i => {
        const isActive   = i === activeIndex;
        const isPast     = i < activeIndex || (i === activeIndex && bothAnswered(i));
        const isFuture   = i > activeIndex && !bothAnswered(i);
        const iAnswered  = !!myAnswerFor(i);
        const pAnswered  = !!partAnswerFor(i);
        const done       = iAnswered && pAnswered;
        const isRevealed = revealed[i];

        if (isFuture && !done) return (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              padding: "16px 20px",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-white/20 text-xs" style={QS}>Q{i + 1}</span>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
              <span className="text-white/20 text-[10px]" style={QS}>🔒 Locked</span>
            </div>
          </motion.div>
        );

        return (
          <motion.div
            key={i}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.4, delay: i * 0.1, scale: { type: "spring", stiffness: 500, damping: 30 } }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: done
                ? "rgba(212,160,23,0.08)"
                : "rgba(255,255,255,0.07)",
              backdropFilter: "blur(28px)",
              WebkitBackdropFilter: "blur(28px)",
              border: done
                ? "1px solid rgba(255,255,255,0.18)"
                : "1px solid rgba(255,255,255,0.18)",
              boxShadow: done
                ? "0 4px 24px rgba(0,0,0,0.28), 0 0 22px 4px rgba(212,160,23,0.22), inset 0 1.5px 0 rgba(255,255,255,0.42)"
                : "0 4px 24px rgba(0,0,0,0.28), 0 0 18px 3px rgba(147,197,253,0.18), inset 0 1.5px 0 rgba(255,255,255,0.38)",
              position: "relative",
              cursor: "default",
            }}
          >
            {/* Gold sweep animation */}
            {done && !completedAnim[i] && (
              <GoldSweep onComplete={() => handleCompletedAnim(i)} />
            )}

            {/* Question header */}
            <div
              className="px-6 py-5"
              style={{
                background: done
                  ? "linear-gradient(135deg, rgba(212,160,23,0.15) 0%, rgba(26,54,93,0.2) 100%)"
                  : "linear-gradient(135deg, rgba(197,48,48,0.18) 0%, rgba(26,54,93,0.3) 100%)",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                position: "relative",
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-blue-300/50 text-[10px] uppercase tracking-widest" style={QS}>
                  {i === 0 ? fmtDate(today) : `Question ${i + 1}`}
                </p>
                {done && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-yellow-400 text-[10px] font-bold tracking-wider"
                    style={QS}
                  >
                    ✦ CONNECTED ✦
                  </motion.span>
                )}
              </div>

              {/* Blurred question until revealed */}
              {!isRevealed && !iAnswered ? (
                <div style={{ position: "relative" }}>
                  <p
                    className="text-white leading-snug text-[1.05rem] select-none"
                    style={{
                      ...PLAYFAIR,
                      filter: "blur(8px)",
                      WebkitFilter: "blur(8px)",
                      userSelect: "none",
                    }}
                  >
                    {questions[i]}
                  </p>
                  <motion.button
                    onClick={() => handleReveal(i)}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0,0,0,0.3)",
                      backdropFilter: "blur(4px)",
                      WebkitBackdropFilter: "blur(4px)",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ ...QS, color: "white", fontSize: "0.85rem", fontWeight: 600 }}>
                      Reveal Today's Question ✨
                    </span>
                  </motion.button>
                </div>
              ) : (
                <motion.p
                  initial={isRevealed && !iAnswered ? { opacity: 0, scale: 0.95 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="text-white leading-snug text-[1.05rem]"
                  style={PLAYFAIR}
                >
                  {questions[i]}
                </motion.p>
              )}
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {dbError ? (
                <div className="text-center py-3">
                  <p className="text-white/40 text-xs" style={QS}>
                    Database table not set up yet.
                  </p>
                  <p className="text-blue-300/30 text-[10px] mt-1" style={QS}>
                    Run the SQL migration in Supabase to enable this feature.
                  </p>
                </div>
              ) : loading ? (
                <div className="space-y-2">
                  <div className="h-4 w-full rounded bg-white/[0.08] animate-pulse" />
                  <div className="h-4 w-2/3 rounded bg-white/[0.08] animate-pulse" />
                </div>
              ) : done ? (
                <BothAnsweredView
                  myName={myName}
                  partnerName={partnerName}
                  myAnswer={myAnswerFor(i)!.answer_text}
                  partnerAnswer={partAnswerFor(i)!.answer_text}
                />
              ) : iAnswered ? (
                <WaitingView
                  myAnswer={myAnswerFor(i)!.answer_text}
                  partnerName={partnerName}
                />
              ) : (isRevealed || iAnswered) ? (
                /* `questionIndex` is passed as a primitive so the
                 * child can call `onSubmit(questionIndex)` itself.
                 * This keeps the prop surface free of inline
                 * arrow callbacks, which would create new
                 * function identities on every parent render and
                 * defeat AnswerForm's `memo` shallow compare. */
                <AnswerForm
                  questionIndex={i}
                  draftText={draftText}
                  onChange={setDraftText}
                  onSubmit={submitAnswer}
                  submitting={submitting}
                  partnerAnswered={pAnswered}
                  partnerName={partnerName}
                />
              ) : (
                <p className="text-white/30 text-sm text-center py-2" style={QS}>
                  Tap above to reveal the question
                </p>
              )}
            </div>
          </motion.div>
        );
      })}

      {/* All complete celebration */}
      <AnimatePresence>
        {allComplete && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl px-5 py-4 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(212,160,23,0.12) 0%, rgba(197,48,48,0.1) 100%)",
              border: "1px solid rgba(212,160,23,0.25)",
            }}
          >
            <p className="text-yellow-300 text-sm font-bold tracking-wider mb-1" style={PLAYFAIR}>
              ✦ Daily Connection Complete ✦
            </p>
            <p className="text-white/50 text-xs" style={QS}>
              All 3 questions answered. New questions at midnight.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Archive */}
      <AnimatePresence>
        {showArchive && (
          <motion.div
            key="archive"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <ArchiveList
              entries={archive}
              loading={archiveLoading}
              myName={myName}
              partnerName={partnerName}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Public export — memoised so a re-render of `HomePage` (e.g.
// presence ticks, weather refresh, partner status updates) does
// NOT re-paint this card unless one of its scalar props changed.
// All props here are primitives, so React's default shallow
// compare is exactly the right contract.
export const DailyConnectionCard = memo(DailyConnectionCardInner);

function GoldSweep({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    playSound("sparkle");
    const t = setTimeout(onComplete, 1200);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ x: "-100%" }}
      animate={{ x: "200%" }}
      transition={{ duration: 1.0, ease: "easeInOut" }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        pointerEvents: "none",
        background: "linear-gradient(90deg, transparent 0%, rgba(212,160,23,0.25) 40%, rgba(246,224,94,0.4) 50%, rgba(212,160,23,0.25) 60%, transparent 100%)",
      }}
    />
  );
}

// Leaf views are wrapped in `memo` so a parent state change that
// doesn't actually change THEIR props (e.g. the silent background
// poll, the date-tick effect) won't repaint them.  Each one binds
// only to primitives, so the default shallow compare is correct.
const AnswerForm = memo(AnswerFormInner);
const WaitingView = memo(WaitingViewInner);
const BothAnsweredView = memo(BothAnsweredViewInner);

function AnswerFormInner({
  questionIndex, draftText, onChange, onSubmit, submitting, partnerAnswered, partnerName,
}: {
  questionIndex: number;
  draftText: string;
  onChange: (v: string) => void;
  onSubmit: (questionIndex: number) => void;
  submitting: boolean;
  partnerAnswered: boolean;
  partnerName: string;
}) {
  const handleClick = () => onSubmit(questionIndex);
  return (
    <div className="space-y-3">
      {partnerAnswered && (
        <p className="text-yellow-300/70 text-xs" style={QS}>
          ✨ {partnerName} already answered — submit yours to reveal!
        </p>
      )}
      <textarea
        value={draftText}
        onChange={e => onChange(e.target.value)}
        placeholder="Share your answer…"
        rows={3}
        className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:ring-1 focus:ring-[#C53030]/50"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.1)",
          ...CAVEAT,
          fontSize: "1.35rem",
          lineHeight: "1.5",
        }}
      />
      <button
        onClick={handleClick}
        disabled={!draftText.trim() || submitting}
        className="w-full py-2.5 rounded-xl text-white text-sm font-semibold tracking-wide transition-all active:scale-95 disabled:opacity-40"
        style={{
          background: "rgba(197,48,48,0.28)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: [
            "0 0 18px rgba(197,48,48,0.28)",
            "0 4px 16px rgba(0,0,0,0.30)",
            "inset 0 1.5px 0 rgba(255,200,200,0.22)",
          ].join(", "),
          ...QS,
        }}
      >
        {submitting ? "Sending…" : "Share My Answer"}
      </button>
    </div>
  );
}

function WaitingViewInner({ myAnswer, partnerName }: { myAnswer: string; partnerName: string }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-blue-300/50 text-[10px] uppercase tracking-widest mb-1" style={QS}>
          Your answer
        </p>
        <p className="text-white/80 leading-relaxed" style={{ ...CAVEAT, fontSize: "1.35rem" }}>
          {myAnswer}
        </p>
      </div>
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.13)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        <motion.span
          className="text-xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        >
          💌
        </motion.span>
        <div>
          <p className="text-white/70 text-sm" style={QS}>Waiting for {partnerName}…</p>
          <p className="text-blue-300/40 text-[11px]" style={QS}>
            Their answer will appear once they reply
          </p>
        </div>
      </div>
    </div>
  );
}

function BothAnsweredViewInner({
  myName, partnerName, myAnswer, partnerAnswer,
}: {
  myName: string; partnerName: string; myAnswer: string; partnerAnswer: string;
}) {
  return (
    <motion.div
      className="space-y-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex gap-3">
        <div
          className="flex-1 rounded-xl p-3"
          style={{
            background: "rgba(197,48,48,0.15)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(197,48,48,0.3)",
            boxShadow: "0 4px 16px rgba(197,48,48,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-[#E88] text-[10px] font-bold uppercase tracking-widest mb-1.5" style={QS}>
            {myName}
          </p>
          <p className="text-white/85 leading-snug" style={{ ...CAVEAT, fontSize: "1.25rem" }}>
            {myAnswer}
          </p>
        </div>

        <div
          className="flex-1 rounded-xl p-3"
          style={{
            background: "rgba(66,153,225,0.12)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(66,153,225,0.25)",
            boxShadow: "0 4px 16px rgba(66,153,225,0.1), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-blue-300/80 text-[10px] font-bold uppercase tracking-widest mb-1.5" style={QS}>
            {partnerName}
          </p>
          <p className="text-white/85 leading-snug" style={{ ...CAVEAT, fontSize: "1.25rem" }}>
            {partnerAnswer}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function ArchiveList({
  entries, loading, myName, partnerName,
}: {
  entries: ArchiveEntry[];
  loading: boolean;
  myName: string;
  partnerName: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2 pt-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-20 rounded-xl bg-white/[0.05] animate-pulse" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-5 text-center"
        style={{
          background: "rgba(255,255,255,0.07)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.13)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <p className="text-white/40 text-sm" style={PLAYFAIR}>No archived conversations yet.</p>
        <p className="text-blue-300/30 text-xs mt-1" style={QS}>
          Once you both answer on the same day, it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-1">
      {entries.map((entry, i) => (
        <motion.div
          key={`${entry.question_date}-${i}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          className="rounded-xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.07)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.13)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="px-4 py-2.5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            <span className="text-blue-300/45 text-[10px] uppercase tracking-widest" style={QS}>
              {fmtDateShort(entry.question_date)}
            </span>
            <p className="text-white/65 text-[0.85rem] mt-0.5 leading-snug" style={PLAYFAIR}>
              {entry.question_text}
            </p>
          </div>
          <div className="flex gap-0 divide-x divide-white/5">
            <div className="flex-1 px-3 py-2.5">
              <p className="text-[#E88] text-[9px] font-bold uppercase tracking-widest mb-1" style={QS}>
                {myName}
              </p>
              <p className="text-white/70 leading-snug" style={{ ...CAVEAT, fontSize: "1.15rem" }}>
                {entry.myAnswer}
              </p>
            </div>
            <div className="flex-1 px-3 py-2.5">
              <p className="text-blue-300/70 text-[9px] font-bold uppercase tracking-widest mb-1" style={QS}>
                {partnerName}
              </p>
              <p className="text-white/70 leading-snug" style={{ ...CAVEAT, fontSize: "1.15rem" }}>
                {entry.partnerAnswer}
              </p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
