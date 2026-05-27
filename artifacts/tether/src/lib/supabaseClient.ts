import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("[v0] Missing Supabase environment variables. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.");
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);

export type Tether = {
  id: string;
  invite_code: string;
  created_at: string;
  trivia_points: number | null;
  trivia_last_points_week: string | null;
};

export type TriviaAnswer = {
  id: string;
  tether_id: string;
  week_key: string;
  user_id: string;
  answer: string;
  submitted_at: string;
};

export type Profile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  tether_id: string | null;
  current_vibe: string | null;
};

export type Post = {
  id: string;
  tether_id: string;
  author_id: string;
  post_type: "nudge" | "note" | "image";
  content: string | null;
  image_url: string | null;
  created_at: string;
};

export type TetherLike = {
  id: string;
  tether_id: string;
  target_type: "post" | "plan";
  target_id: string;
  user_id: string;
  created_at: string;
};

export type TetherComment = {
  id: string;
  tether_id: string;
  target_type: "post" | "plan";
  target_id: string;
  author_id: string;
  content: string;
  created_at: string;
};

export type DatePlan = {
  id: string;
  tether_id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  // Extended fields — requires DB migration (see README)
  plan_type: "confirmed" | "bucket" | null;
  planned_date: string | null;
  image_url: string | null;
};
