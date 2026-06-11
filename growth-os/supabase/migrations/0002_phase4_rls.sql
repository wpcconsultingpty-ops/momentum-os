-- Phase 4 — Row Level Security
-- Owner-isolation on profiles/content/leads/trials/attribution_events.
-- webhook_deliveries has RLS enabled with NO policies, so only the
-- service-role key (which bypasses RLS) can read/write it.

alter table public.profiles enable row level security;
alter table public.content enable row level security;
alter table public.leads enable row level security;
alter table public.trials enable row level security;
alter table public.attribution_events enable row level security;
alter table public.webhook_deliveries enable row level security;

-- profiles: user can see/update own row
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- content: full CRUD if auth.uid() = owner_id
create policy "content_owner_all" on public.content
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- leads: same
create policy "leads_owner_all" on public.leads
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- trials: same
create policy "trials_owner_all" on public.trials
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- attribution_events: read-only for owner; inserts only via service role
create policy "attr_events_select_own" on public.attribution_events
  for select using (auth.uid() = owner_id);
-- no insert/update/delete policy -> only service role can write

-- webhook_deliveries: no policies at all -> service-role only
