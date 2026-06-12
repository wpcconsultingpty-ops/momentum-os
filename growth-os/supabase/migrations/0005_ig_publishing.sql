-- Phase 7 - outbound Instagram publishing
-- Additive only: new scheduled_posts table + RLS. Does not touch existing tables.
-- Owner-approval gate: a post must be 'approved' by the owner before it can publish.

create table if not exists public.scheduled_posts (
id uuid primary key default gen_random_uuid(),
owner_id uuid not null references public.profiles(id) on delete cascade,
content_id uuid references public.content(id) on delete set null,
ig_user_id text,
caption text not null,
image_url text not null,
status text not null default 'draft' check (status in ('draft','pending_approval','approved','publishing','published','failed')),
creation_id text,
ig_media_id text,
permalink text,
error text,
approved_at timestamptz,
published_at timestamptz,
scheduled_for timestamptz,
created_at timestamptz default now() not null
);
create index if not exists scheduled_posts_owner_created_idx on public.scheduled_posts (owner_id, created_at desc);
create index if not exists scheduled_posts_status_idx on public.scheduled_posts (status);

alter table public.scheduled_posts enable row level security;

-- owner can read/insert/update/delete own rows (service role bypasses RLS for publish writes)
create policy "scheduled_posts_owner_all" on public.scheduled_posts
for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
