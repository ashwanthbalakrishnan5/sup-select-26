-- Sandbox Hill: one row per pitch meeting. All writes go through the Next.js server with the service-role key.
create table if not exists public.pitch_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid null references auth.users (id) on delete set null,
  status text not null default 'created'
    check (status in ('created', 'live', 'processing', 'ready', 'failed')),
  config jsonb not null,
  started_at timestamptz,
  ended_at timestamptz,
  ended_by text,
  timings jsonb,
  transcript jsonb,
  verdicts jsonb,
  fact_checks jsonb,
  delivery jsonb,
  hand_raises jsonb,
  metrics jsonb,
  report jsonb,
  recording_path text,
  error text
);

create index if not exists pitch_sessions_user_created_idx
  on public.pitch_sessions (user_id, created_at desc);

alter table public.pitch_sessions enable row level security;

-- P2 history page: signed-in users can read their own sessions. No other client access.
drop policy if exists "Users read own sessions" on public.pitch_sessions;
create policy "Users read own sessions"
  on public.pitch_sessions for select
  to authenticated
  using (user_id = (select auth.uid()));

-- P2 recordings (private bucket; uploads via signed URLs minted by the server).
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;
