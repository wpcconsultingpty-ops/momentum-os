-- Phase 4 — schema init
-- Tables: profiles, content, leads, trials, attribution_events, webhook_deliveries
-- plus the handle_new_user() trigger that creates a profile per auth.users insert.

-- profiles: 1:1 with auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz default now() not null
);

-- content (Instagram posts the user publishes)
create table public.content (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('instagram','linkedin','tiktok','youtube','other')),
  external_id text,                          -- e.g. ig media id
  permalink text,
  caption text,
  utm_campaign text,                         -- canonical tag for attribution
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  published_at timestamptz,
  created_at timestamptz default now() not null,
  unique (platform, external_id)
);
create index on public.content (owner_id, created_at desc);
create index on public.content (utm_campaign);

-- leads (people captured via survey/landing)
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  email text,
  full_name text,
  source text,                               -- 'instagram','survey','manual', etc.
  utm_campaign text,
  utm_source text,
  utm_medium text,
  ig_user_handle text,                       -- @handle if known
  ig_user_id text,
  status text not null default 'new' check (status in ('new','qualified','contacted','converted','disqualified')),
  attributed_content_id uuid references public.content(id) on delete set null,
  created_at timestamptz default now() not null,
  unique (owner_id, email)
);
create index on public.leads (owner_id, created_at desc);
create index on public.leads (utm_campaign);
create index on public.leads (ig_user_handle);

-- trials (downstream conversion)
create table public.trials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  email text not null,
  plan text,
  started_at timestamptz default now() not null,
  ended_at timestamptz,
  converted_to_paid boolean default false,
  attributed_content_id uuid references public.content(id) on delete set null,
  created_at timestamptz default now() not null
);
create index on public.trials (owner_id, started_at desc);

-- attribution_events (immutable event log)
create table public.attribution_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('ig_engagement','survey_submit','trial_start','trial_convert')),
  source text not null,                       -- webhook source: 'instagram','survey','trial'
  content_id uuid references public.content(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  trial_id uuid references public.trials(id) on delete set null,
  utm_campaign text,
  payload jsonb not null,                     -- raw verified webhook body
  occurred_at timestamptz not null default now(),
  created_at timestamptz default now() not null
);
create index on public.attribution_events (owner_id, occurred_at desc);
create index on public.attribution_events (event_type, occurred_at desc);

-- webhook_deliveries (idempotency + audit)
create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('instagram','survey','trial')),
  delivery_id text not null,                  -- header-supplied or hash
  signature text,
  status text not null check (status in ('received','processed','failed','duplicate')),
  error text,
  payload jsonb,
  created_at timestamptz default now() not null,
  unique (source, delivery_id)
);

-- Profile auto-create trigger
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
