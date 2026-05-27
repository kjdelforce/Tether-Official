// ═══════════════════════════════════════════════════════════
//  naughtyBox.ts — All Naughty Question & Sex Box archive logic
//  Reuses the same column shape as daily_answers for consistency.
// ═══════════════════════════════════════════════════════════
import { supabase } from "./supabaseClient";

// ── Kyle's profile ID gate ────────────────────────────────
// We use name-based check throughout the app. For extra safety,
// also export the canonical name constant used in checks.
export const KYLE_NAME = "kyle";
export const isKyle = (fullName: string) =>
  fullName.trim().toLowerCase() === KYLE_NAME;

// ── Types ─────────────────────────────────────────────────
export interface NaughtyQuestion {
  id: string;
  tether_id: string;
  posted_by: string;
  question_text: string;
  created_at: string;
  expires_at: string;
}

export interface NaughtyAnswer {
  id: string;
  question_id: string;
  tether_id: string;
  user_id: string;
  answer_text: string;
  created_at: string;
}

export interface SexBoxEntry {
  question: NaughtyQuestion;
  answers: NaughtyAnswer[];
}

// ── Naughty Question CRUD ─────────────────────────────────
export async function postNaughtyQuestion(
  tetherId: string,
  postedBy: string,
  questionText: string,
): Promise<{ data: NaughtyQuestion | null; error: string | null }> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("naughty_questions")
    .insert({ tether_id: tetherId, posted_by: postedBy, question_text: questionText, expires_at: expiresAt })
    .select()
    .single();
  if (error) { console.error("postNaughtyQuestion", error); return { data: null, error: error.message }; }
  return { data: data as NaughtyQuestion, error: null };
}

export async function getActiveNaughtyQuestion(
  tetherId: string,
): Promise<NaughtyQuestion | null> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("naughty_questions")
    .select("*")
    .eq("tether_id", tetherId)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as NaughtyQuestion) ?? null;
}

export async function getNaughtyAnswers(questionId: string): Promise<NaughtyAnswer[]> {
  const { data } = await supabase
    .from("naughty_answers")
    .select("*")
    .eq("question_id", questionId);
  return (data ?? []) as NaughtyAnswer[];
}

export async function submitNaughtyAnswer(
  questionId: string,
  tetherId: string,
  userId: string,
  answerText: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("naughty_answers")
    .upsert(
      { question_id: questionId, tether_id: tetherId, user_id: userId, answer_text: answerText },
      { onConflict: "question_id,user_id" },
    );
  return { error: error?.message ?? null };
}

// ── Sex Box archive ────────────────────────────────────────
export async function getSexBoxArchive(tetherId: string): Promise<SexBoxEntry[]> {
  const now = new Date().toISOString();
  const { data: questions } = await supabase
    .from("naughty_questions")
    .select("*")
    .eq("tether_id", tetherId)
    .lte("expires_at", now)
    .order("created_at", { ascending: false });

  if (!questions?.length) return [];

  const ids = (questions as NaughtyQuestion[]).map(q => q.id);
  const { data: answers } = await supabase
    .from("naughty_answers")
    .select("*")
    .in("question_id", ids);

  return (questions as NaughtyQuestion[]).map(q => ({
    question: q,
    answers: ((answers ?? []) as NaughtyAnswer[]).filter(a => a.question_id === q.id),
  }));
}

// ── Time helpers ───────────────────────────────────────────
export function timeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}
