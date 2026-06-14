-- Phase 7 fix: allow the 'rejected' status on scheduled_posts.
-- The approvals server action (app/dashboard/approvals/actions.ts > rejectPost)
-- writes status = 'rejected', but the original CHECK constraint from
-- 0005_ig_publishing.sql omitted that value, so every owner rejection failed
-- at the DB layer with a check_violation (SQLSTATE 23514).
--
-- Additive only: widen the allowed status set. No data is rewritten and the
-- column default ('draft') is unchanged.

alter table public.scheduled_posts
  drop constraint if exists scheduled_posts_status_check;

alter table public.scheduled_posts
  add constraint scheduled_posts_status_check
  check (status in (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'publishing',
    'published',
    'failed'
  ));
