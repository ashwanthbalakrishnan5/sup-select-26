-- Investor interview panels: a VC configures a panel once, tries it, then sends the invite link to startups.
create table if not exists public.panels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner text not null default 'demo', -- fake login: one shared demo workspace
  name text not null,
  config jsonb not null
);

create index if not exists panels_owner_created_idx on public.panels (owner, created_at desc);
alter table public.panels enable row level security; -- server-only access (service role)

-- A session is either founder practice, a startup's interview for a panel, or the VC trying their own panel.
alter table public.pitch_sessions
  add column if not exists panel_id uuid references public.panels (id) on delete set null,
  add column if not exists mode text not null default 'practice' check (mode in ('practice', 'interview', 'test')),
  add column if not exists candidate jsonb; -- { founderName, startupName, oneLiner, email?, consentAt }

create index if not exists pitch_sessions_panel_created_idx on public.pitch_sessions (panel_id, created_at desc);
