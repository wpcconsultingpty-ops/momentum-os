-- Diagnosable publish failures + reliable stuck-publishing sweep.
--
-- 1) error_meta: structured Graph API error envelope (code/subcode/status/
--    user_title/user_message/fbtrace_id) written by /api/ig/publish so the
--    Approvals dashboard can show the real cause instead of a bare "Fatal".
-- 2) updated_at: the stuck-publishing sweep (/api/cron/sweep-publishing)
--    queries scheduled_posts where status = 'publishing' and
--    updated_at <= cutoff. That column did not exist, so the sweep could
--    never recover orphaned rows. Add it plus a trigger that maintains it.
-- Additive and idempotent: safe to run on existing data.

alter table public.scheduled_posts
  add column if not exists error_meta jsonb,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.scheduled_posts.error_meta is
  'Structured Graph API error envelope for failed publishes: { code, subcode, status, user_title, user_message, fbtrace_id }.';
comment on column public.scheduled_posts.updated_at is
  'Last write timestamp; maintained by trigger. Used by the stuck-publishing sweep to detect orphaned rows.';

-- Keep updated_at current on every row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scheduled_posts_set_updated_at on public.scheduled_posts;
create trigger scheduled_posts_set_updated_at
  before update on public.scheduled_posts
  for each row
  execute function public.set_updated_at();

-- Helps the sweep query scan only candidate rows.
create index if not exists scheduled_posts_status_updated_idx
  on public.scheduled_posts (status, updated_at);
