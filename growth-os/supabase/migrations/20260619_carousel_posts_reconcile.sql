-- Reconcile scheduled_posts carousel schema with production.
-- Background: production was hand-altered (lowercase media_type enum,
-- nullable slides, missing slides-count check) which drifted from
-- 20260619_carousel_posts.sql. This migration is idempotent and brings
-- any environment to the canonical shape: uppercase IMAGE/CAROUSEL,
-- NOT NULL media_type/slides, and the 2-10 slide count check.

-- Drop checks first so value normalization cannot trip the old constraint.
alter table public.scheduled_posts drop constraint if exists scheduled_posts_media_type_check;
alter table public.scheduled_posts drop constraint if exists scheduled_posts_carousel_slides_chk;

-- Normalize legacy lowercase values and backfill nullable slides.
update public.scheduled_posts set media_type = upper(media_type) where media_type in ('image', 'carousel');
update public.scheduled_posts set slides = '[]'::jsonb where slides is null;

-- Tighten columns to the canonical definition.
alter table public.scheduled_posts alter column media_type set default 'IMAGE';
alter table public.scheduled_posts alter column media_type set not null;
alter table public.scheduled_posts alter column slides set default '[]'::jsonb;
alter table public.scheduled_posts alter column slides set not null;

-- Re-add checks in canonical (uppercase) form.
alter table public.scheduled_posts add constraint scheduled_posts_media_type_check check (media_type in ('IMAGE', 'CAROUSEL'));
alter table public.scheduled_posts add constraint scheduled_posts_carousel_slides_chk check ((media_type = 'IMAGE') or (media_type = 'CAROUSEL' and jsonb_array_length(slides) between 2 and 10));
