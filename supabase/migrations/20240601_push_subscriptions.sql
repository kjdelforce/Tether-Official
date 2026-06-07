-- Push Subscriptions table
-- Stores Web Push API subscription objects for each user.
-- Run this once in the Supabase SQL Editor (Database > SQL Editor).

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tether_id   uuid not null,
  subscription jsonb not null,
  updated_at  timestamptz not null default now()
);

-- One subscription per user (latest device wins).
create unique index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

-- Row Level Security: users can only manage their own subscription.
alter table public.push_subscriptions enable row level security;

create policy "Users can upsert own subscription"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role bypasses RLS, so the api-server can read partner subscriptions.
