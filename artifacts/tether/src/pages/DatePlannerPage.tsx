import { useAuth } from "@/lib/AuthContext";
import { supabase, DatePlan, TetherLike, TetherComment } from "@/lib/supabaseClient";
import { useEffect, useState, useRef, useCallback } from "react";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useToast } from "@/hooks/use-toast";
import { ReactionBar, CardReactionProps } from "@/components/ReactionBar";
import { haptic } from "@/lib/haptics";

const BUCKET = "tether-images";
const QS = { fontFamily: "'Quicksand', sans-serif" };
const PD = { fontFamily: "'Playfair Display', serif" };

function fmtQLD(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "Australia/Brisbane",
  });
}

function countdownLabel(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return null;
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "Today! 🎉";
  if (days === 1) return "Tomorrow ✨";
  return `In ${days} days`;
}

export default function DatePlannerPage() {
  const { profile, partnerProfile, tether } = useAuth();
  const { toast } = useToast();

  const [tab, setTab]                       = useState<"planner" | "bucket">("planner");
  const [plans, setPlans]                   = useState<DatePlan[]>([]);
  const [loading, setLoading]               = useState(true);
  const [showForm, setShowForm]             = useState(false);
  const [submitting, setSubmitting]         = useState(false);
  const [likesMap, setLikesMap]             = useState<Record<string, TetherLike[]>>({});
  const [commentsMap, setCommentsMap]       = useState<Record<string, TetherComment[]>>({});

  const [pTitle, setPTitle]                 = useState("");
  const [pDetails, setPDetails]             = useState("");
  const [pDateTime, setPDateTime]           = useState("");
  const [pFile, setPFile]                   = useState<File | null>(null);
  const [pPreview, setPPreview]             = useState<string | null>(null);
  const pFileRef = useRef<HTMLInputElement>(null);

  const [bTitle, setBTitle]                 = useState("");
  const [bDetails, setBDetails]             = useState("");

  useEffect(() => {
    if (!tether) { setLoading(false); return; }
    fetchPlans();
    loadReactions();
  }, [tether]);

  async function fetchPlans() {
    if (!tether) return;
    const { data, error } = await supabase
      .from("date_plans").select("*")
      .eq("tether_id", tether.id)
      .order("id", { ascending: false });
    if (!error && data) setPlans(data as DatePlan[]);
    setLoading(false);
  }

  async function loadReactions() {
    if (!tether) return;
    const [{ data: lks }, { data: cms }] = await Promise.all([
      supabase.from("tether_likes").select("*")
        .eq("tether_id", tether.id).eq("target_type", "plan"),
      supabase.from("tether_comments").select("*")
        .eq("tether_id", tether.id).eq("target_type", "plan")
        .order("created_at", { ascending: true }),
    ]);
    const lm: Record<string, TetherLike[]>    = {};
    const cm: Record<string, TetherComment[]> = {};
    lks?.forEach(l => { (lm[l.target_id] ??= []).push(l); });
    cms?.forEach(c => { (cm[c.target_id] ??= []).push(c); });
    setLikesMap(lm);
    setCommentsMap(cm);
  }

  async function toggleLike(planId: string) {
    if (!profile || !tether) return;
    const existing = (likesMap[planId] ?? []).find(l => l.user_id === profile.id);
    if (existing) {
      await supabase.from("tether_likes").delete().eq("id", existing.id);
    } else {
      await supabase.from("tether_likes").insert({
        tether_id: tether.id, target_type: "plan", target_id: planId, user_id: profile.id,
      });
    }
    loadReactions();
  }

  async function addComment(planId: string, text: string) {
    if (!profile || !tether) return;
    await supabase.from("tether_comments").insert({
      tether_id: tether.id, target_type: "plan", target_id: planId,
      author_id: profile.id, content: text,
    });
    loadReactions();
  }

  async function deleteComment(commentId: string) {
    await supabase.from("tether_comments").delete().eq("id", commentId);
    loadReactions();
  }

  async function deletePlan(planId: string) {
    await supabase.from("date_plans").delete().eq("id", planId);
    fetchPlans();
    loadReactions();
    toast({ title: "Deleted" });
  }

  function reactions(plan: DatePlan): CardReactionProps {
    return {
      likes:           likesMap[plan.id] ?? [],
      comments:        commentsMap[plan.id] ?? [],
      currentUserId:   profile?.id ?? "",
      isAuthor:        true,
      myName:          profile?.full_name ?? "Me",
      partnerName:     partnerProfile?.full_name ?? "Partner",
      onLike:          () => toggleLike(plan.id),
      onComment:       (text) => addComment(plan.id, text),
      onDeleteComment: deleteComment,
      onDelete:        () => deletePlan(plan.id),
    };
  }

  function handlePFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setPFile(file);
    const r = new FileReader();
    r.onload = ev => setPPreview(ev.target?.result as string);
    r.readAsDataURL(file);
  }

  function resetPlannerForm() { setPTitle(""); setPDetails(""); setPDateTime(""); setPFile(null); setPPreview(null); }
  function resetBucketForm()  { setBTitle(""); setBDetails(""); }
  function closeForm() { setShowForm(false); resetPlannerForm(); resetBucketForm(); }

  async function addConfirmed() {
    if (!tether || !pTitle.trim()) return;
    haptic("light");
    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (pFile) {
        const ext  = pFile.name.split(".").pop();
        const path = `${tether.id}/plans/${Date.now()}.${ext}`;
        const { error: ue } = await supabase.storage.from(BUCKET).upload(path, pFile, { upsert: false });
        if (ue) throw ue;
        const { data: ud } = supabase.storage.from(BUCKET).getPublicUrl(path);
        imageUrl = ud.publicUrl;
      }
      const { error } = await supabase.from("date_plans").insert({
        tether_id:    tether.id,
        title:        pTitle.trim(),
        description:  pDetails.trim() || null,
        is_completed: false,
        plan_type:    "confirmed",
        planned_date: pDateTime ? new Date(pDateTime).toISOString() : null,
        image_url:    imageUrl,
      });
      if (error) throw error;
      resetPlannerForm(); setShowForm(false); fetchPlans();
      toast({ title: "Date added to planner! 📅" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
    setSubmitting(false);
  }

  async function addBucket() {
    if (!tether || !bTitle.trim()) return;
    haptic("light");
    setSubmitting(true);
    const { error } = await supabase.from("date_plans").insert({
      tether_id:    tether.id,
      title:        bTitle.trim(),
      description:  bDetails.trim() || null,
      is_completed: false,
      plan_type:    "bucket",
      planned_date: null,
      image_url:    null,
    });
    if (error) {
      const isSchemaMissing = error.message?.includes("column") || error.code === "PGRST204" || error.code === "42703";
      toast({
        title: "Error adding idea",
        description: isSchemaMissing
          ? "Database needs a schema update — run the migration in Supabase (see README or ask for the SQL)."
          : error.message,
        variant: "destructive",
      });
    } else {
      resetBucketForm(); setShowForm(false); fetchPlans();
      toast({ title: "Added to bucket list! 🗺️" });
    }
    setSubmitting(false);
  }

  async function toggleDone(plan: DatePlan) {
    haptic("light");
    await supabase.from("date_plans").update({ is_completed: !plan.is_completed }).eq("id", plan.id);
    fetchPlans();
  }

  const confirmed   = plans.filter(p => p.plan_type === "confirmed")
    .sort((a, b) => {
      if (!a.planned_date && !b.planned_date) return 0;
      if (!a.planned_date) return 1; if (!b.planned_date) return -1;
      return new Date(a.planned_date).getTime() - new Date(b.planned_date).getTime();
    });
  const bucket      = plans.filter(p => p.plan_type !== "confirmed");
  const upcoming    = confirmed.filter(p => !p.is_completed && (!p.planned_date || new Date(p.planned_date) >= new Date()));
  const pastDates   = confirmed.filter(p => p.is_completed || (p.planned_date && new Date(p.planned_date) < new Date()));
  const nextId      = upcoming.find(p => p.planned_date)?.id ?? null;
  const bucketPending = bucket.filter(p => !p.is_completed);
  const bucketDone    = bucket.filter(p => p.is_completed);

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-white/90 text-xl font-bold" style={PD}>
              {tab === "planner" ? "Date Planner" : "Bucket List"}
            </h2>
            <p className="text-blue-300/55 text-[11px] tracking-widest uppercase" style={QS}>
              {tab === "planner" ? "confirmed plans" : "someday ideas"}
            </p>
          </div>
          <button
            onClick={() => { haptic("light"); setShowForm(v => !v); }}
            className="btn-crimson w-9 h-9 rounded-full flex items-center justify-center text-xl shadow-lg"
          >
            {showForm ? "×" : "+"}
          </button>
        </div>

        <div className="flex rounded-2xl p-1 gap-1"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <button onClick={() => { setTab("planner"); setShowForm(false); haptic("light"); }}
            className="flex-1 py-1.5 rounded-xl text-sm font-semibold transition-all"
            style={{ ...QS, background: tab === "planner" ? "rgba(197,48,48,0.75)" : "transparent", color: tab === "planner" ? "white" : "rgba(147,197,253,0.7)" }}>
            📅 Planner
          </button>
          <button onClick={() => { setTab("bucket"); setShowForm(false); haptic("light"); }}
            className="flex-1 py-1.5 rounded-xl text-sm font-semibold transition-all"
            style={{ ...QS, background: tab === "bucket" ? "rgba(197,48,48,0.75)" : "transparent", color: tab === "bucket" ? "white" : "rgba(147,197,253,0.7)" }}>
            🗺️ Bucket List
          </button>
        </div>
      </div>

      {/* ── Planner form ────────────────────────────────────────── */}
      {showForm && tab === "planner" && (
        <div className="mx-4 mb-3 flex-shrink-0 glass-card rounded-2xl p-4 space-y-3">
          <p className="text-white/80 text-sm font-semibold" style={PD}>Plan a Date</p>
          <input type="text" value={pTitle} onChange={e => setPTitle(e.target.value)}
            placeholder="What's the plan?" style={QS}
            className="w-full bg-white/10 text-white placeholder-blue-300/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C53030] border border-white/10" />
          <textarea value={pDetails} onChange={e => setPDetails(e.target.value)}
            placeholder="Details... (restaurant, address, ideas)" rows={2} style={QS}
            className="w-full bg-white/10 text-white placeholder-blue-300/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C53030] border border-white/10 resize-none" />
          <div className="space-y-1">
            <label className="text-blue-300/60 text-[11px] uppercase tracking-wider" style={QS}>Date & Time</label>
            <input type="datetime-local" value={pDateTime} onChange={e => setPDateTime(e.target.value)} style={QS}
              className="w-full bg-white/10 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C53030] border border-white/10" />
          </div>
          {pPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              <img src={pPreview} alt="Preview" className="w-full max-h-40 object-cover" />
              <button onClick={() => { setPFile(null); setPPreview(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">×</button>
            </div>
          ) : (
            <button onClick={() => pFileRef.current?.click()}
              className="w-full h-20 rounded-xl border border-dashed border-white/20 flex items-center justify-center gap-2 text-blue-300/70 text-sm active:scale-95 transition-transform" style={QS}>
              <span>📷</span> Add a photo (optional)
            </button>
          )}
          <input ref={pFileRef} type="file" accept="image/*" className="hidden" onChange={handlePFileChange} />
          <div className="flex gap-2">
            <button onClick={addConfirmed} disabled={submitting || !pTitle.trim()}
              className="btn-crimson flex-1 py-2.5 rounded-xl text-sm" style={QS}>
              {submitting ? "Saving..." : "Add to Planner"}
            </button>
            <button onClick={closeForm} className="py-2 px-4 rounded-xl bg-white/10 text-blue-200 text-sm" style={QS}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Bucket form ─────────────────────────────────────────── */}
      {showForm && tab === "bucket" && (
        <div className="mx-4 mb-3 flex-shrink-0 glass-card rounded-2xl p-4 space-y-3">
          <p className="text-white/80 text-sm font-semibold" style={PD}>New Bucket List Idea</p>
          <input type="text" value={bTitle} onChange={e => setBTitle(e.target.value)}
            placeholder="What's the dream date?" style={QS}
            className="w-full bg-white/10 text-white placeholder-blue-300/60 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C53030] border border-white/10" />
          <input type="text" value={bDetails} onChange={e => setBDetails(e.target.value)}
            placeholder="Details... (optional)" style={QS}
            className="w-full bg-white/10 text-white placeholder-blue-300/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C53030] border border-white/10" />
          <div className="flex gap-2">
            <button onClick={addBucket} disabled={submitting || !bTitle.trim()}
              className="btn-crimson flex-1 py-2.5 rounded-xl text-sm" style={QS}>
              {submitting ? "Adding..." : "Add Idea"}
            </button>
            <button onClick={closeForm} className="py-2 px-4 rounded-xl bg-white/10 text-blue-200 text-sm" style={QS}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Feed ────────────────────────────────────────────────── */}
      <PullToRefresh onRefresh={fetchPlans} className="flex-1 px-4 space-y-4">
        {loading && <p className="text-blue-300/60 text-sm text-center py-10" style={QS}>Loading...</p>}

        {/* PLANNER TAB */}
        {!loading && tab === "planner" && (
          <>
            {upcoming.length === 0 && pastDates.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">📅</div>
                <p className="text-white/60 text-sm" style={PD}>No dates planned yet.</p>
                <p className="text-blue-300/40 text-xs mt-1" style={QS}>Tap + to plan your first date!</p>
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="space-y-4">
                <p className="text-blue-300/55 text-[11px] uppercase tracking-widest font-semibold" style={QS}>Upcoming</p>
                {upcoming.map(plan => (
                  <DateCard key={plan.id} plan={plan} isNext={plan.id === nextId}
                    onToggle={toggleDone} fmtQLD={fmtQLD} countdownLabel={countdownLabel}
                    reactions={reactions(plan)} />
                ))}
              </div>
            )}
            {pastDates.length > 0 && (
              <div className="space-y-3">
                <p className="text-blue-300/40 text-[11px] uppercase tracking-widest font-semibold" style={QS}>Past Dates ✓</p>
                <div className="opacity-55 space-y-3">
                  {pastDates.map(plan => (
                    <DateCard key={plan.id} plan={plan} isNext={false}
                      onToggle={toggleDone} fmtQLD={fmtQLD} countdownLabel={countdownLabel}
                      reactions={reactions(plan)} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* BUCKET LIST TAB */}
        {!loading && tab === "bucket" && (
          <>
            {bucketPending.length === 0 && bucketDone.length === 0 && (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">🗺️</div>
                <p className="text-white/60 text-sm" style={PD}>Your bucket list is empty.</p>
                <p className="text-blue-300/40 text-xs mt-1" style={QS}>Tap + to add your first idea.</p>
              </div>
            )}
            {bucketPending.length > 0 && (
              <div className="space-y-2">
                <p className="text-blue-300/55 text-[11px] uppercase tracking-widest font-semibold" style={QS}>
                  Someday ({bucketPending.length})
                </p>
                {bucketPending.map(plan => (
                  <BucketCard key={plan.id} plan={plan} onToggle={toggleDone} reactions={reactions(plan)} />
                ))}
              </div>
            )}
            {bucketDone.length > 0 && (
              <div className="space-y-2 opacity-55">
                <p className="text-blue-300/40 text-[11px] uppercase tracking-widest font-semibold" style={QS}>
                  Done ✓ ({bucketDone.length})
                </p>
                {bucketDone.map(plan => (
                  <BucketCard key={plan.id} plan={plan} onToggle={toggleDone} reactions={reactions(plan)} />
                ))}
              </div>
            )}
          </>
        )}
      </PullToRefresh>
    </div>
  );
}

// ── Featured date card ─────────────────────────────────────────────
function DateCard({ plan, isNext, onToggle, fmtQLD, countdownLabel, reactions }: {
  plan: DatePlan; isNext: boolean;
  onToggle: (p: DatePlan) => void;
  fmtQLD: (s: string | null) => string;
  countdownLabel: (s: string | null) => string | null;
  reactions: CardReactionProps;
}) {
  const hasImg = !!plan.image_url;
  const cd     = countdownLabel(plan.planned_date);

  return (
    <div className="date-card">
      {hasImg && <img src={plan.image_url!} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      <div className="absolute inset-0"
        style={{ background: hasImg
          ? "linear-gradient(160deg, rgba(10,20,45,0.45) 0%, rgba(10,5,20,0.82) 100%)"
          : "linear-gradient(145deg, #1A2F5E 0%, #6B1414 100%)" }} />

      <div className="relative z-10 p-5 flex flex-col gap-2 min-h-[152px]">
        {/* Top content */}
        <div className="flex-1 space-y-1.5">
          {isNext && cd && <span className="countdown-badge">{cd}</span>}
          <h3 className="text-white text-lg font-bold leading-snug mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>
            {plan.title}
          </h3>
          {plan.description && (
            <p className="text-white/75 text-sm leading-relaxed" style={{ fontFamily: "'Quicksand', sans-serif" }}>
              {plan.description}
            </p>
          )}
        </div>

        {/* Date + checkbox row */}
        <div className="flex items-center justify-between">
          {plan.planned_date
            ? <p className="text-white/60 text-xs tracking-wide" style={{ fontFamily: "'Quicksand', sans-serif" }}>📅 {fmtQLD(plan.planned_date)}</p>
            : <span />}
          <button
            onClick={e => { e.stopPropagation(); onToggle(plan); }}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${plan.is_completed ? "bg-green-400 border-green-400" : "border-white/40"}`}
          >
            {plan.is_completed && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Reactions */}
        <ReactionBar variant="dark" {...reactions} />
      </div>
    </div>
  );
}

// ── Bucket list card ───────────────────────────────────────────────
function BucketCard({ plan, onToggle, reactions }: {
  plan: DatePlan; onToggle: (p: DatePlan) => void; reactions: CardReactionProps;
}) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <button
          onClick={e => { e.stopPropagation(); onToggle(plan); }}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${plan.is_completed ? "bg-green-500 border-green-500" : "border-white/40"}`}
        >
          {plan.is_completed && (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${plan.is_completed ? "line-through text-blue-300/60" : "text-white"}`}
            style={{ fontFamily: "'Quicksand', sans-serif" }}>
            {plan.title}
          </p>
          {plan.description && (
            <p className="text-blue-300/70 text-xs mt-0.5 leading-relaxed"
              style={{ fontFamily: "'Quicksand', sans-serif" }}>
              {plan.description}
            </p>
          )}
        </div>
      </div>
      <ReactionBar variant="dark" {...reactions} />
    </div>
  );
}
