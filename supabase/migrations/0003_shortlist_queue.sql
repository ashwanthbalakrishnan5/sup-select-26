-- Shortlist agent: every finished panel interview enqueues a re-rank job (Supabase Queues / pgmq).
-- The private Supabase Compute worker (supabase/compute/shortlist-worker) drains the queue, asks Claude to rank
-- all of the panel's interviews against the fund's criteria, and writes the result to panels.shortlist.
create extension if not exists pgmq;
select pgmq.create('shortlist') where not exists (select 1 from pgmq.list_queues() where queue_name = 'shortlist');

alter table public.panels
  add column if not exists shortlist jsonb,
  add column if not exists shortlist_at timestamptz;

create or replace function public.enqueue_shortlist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.panel_id is not null and new.status = 'ready' and (old.status is distinct from 'ready') then
    perform pgmq.send('shortlist', jsonb_build_object('panel_id', new.panel_id, 'session_id', new.id));
  end if;
  return new;
end $$;

drop trigger if exists pitch_sessions_shortlist on public.pitch_sessions;
create trigger pitch_sessions_shortlist after update of status on public.pitch_sessions
  for each row execute function public.enqueue_shortlist();

-- Worker API (service role only): claim up to n jobs for 120 s, then ack.
create or replace function public.claim_shortlist_jobs(n int default 5)
returns table (msg_id bigint, panel_id uuid)
language sql security definer set search_path = '' as $$
  select r.msg_id, (r.message ->> 'panel_id')::uuid from pgmq.read('shortlist', 120, n) r;
$$;

create or replace function public.ack_shortlist_job(id bigint) returns boolean
language sql security definer set search_path = '' as $$ select pgmq.archive('shortlist', id); $$;

-- Manual "re-rank now" from the app.
create or replace function public.request_shortlist(p uuid) returns bigint
language sql security definer set search_path = '' as $$
  select * from pgmq.send('shortlist', jsonb_build_object('panel_id', p));
$$;

revoke all on function public.claim_shortlist_jobs(int), public.ack_shortlist_job(bigint), public.request_shortlist(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_shortlist_jobs(int), public.ack_shortlist_job(bigint), public.request_shortlist(uuid)
  to service_role;
