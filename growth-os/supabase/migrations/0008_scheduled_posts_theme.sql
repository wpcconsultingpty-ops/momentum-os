-- Phase 8 - slide brand theme on scheduled posts
-- Additive only: adds an optional light/dark slide theme used to render the
-- approvals preview and (later) the published image in the matching palette.
-- No RLS or policy changes; existing rows default to NULL and fall back to a
-- deterministic theme in the UI.

alter table public.scheduled_posts
add column if not exists theme text
check (theme is null or theme in ('light', 'dark'));
