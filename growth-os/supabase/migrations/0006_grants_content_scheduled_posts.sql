-- Phase 7 fix: table-level grants for content + scheduled_posts.
-- RLS policies for these tables exist (0002_phase4_rls.sql defines
-- content_owner_all; 0005_ig_publishing.sql defines scheduled_posts_owner_all),
-- but the authenticated role was never granted table-level DML privileges.
-- In Postgres, RLS policies are ANDed with GRANTs - a policy alone does not
-- grant access - so signed-in server-action inserts failed with:
--   code 42501 "permission denied for table content"
-- This surfaced as integration CI failures in server-actions + webhooks suites.
--
-- Mirrors the grant pattern from 0004_phase6_trigger_grants_v2.sql.
-- Additive only: no schema or RLS policy changes.

grant select, insert, update, delete on public.content to authenticated, service_role;
grant select, insert, update, delete on public.scheduled_posts to authenticated, service_role;

-- Same gap on the remaining RLS-protected tables exercised by the
-- integration suite (leads, attribution_events, webhook_deliveries).
-- service_role bypasses RLS for server-side webhook/attribution writes;
-- authenticated stays constrained by existing owner policies.
grant select, insert, update, delete on public.leads to authenticated, service_role;
grant select, insert, update, delete on public.attribution_events to authenticated, service_role;
grant select, insert, update, delete on public.webhook_deliveries to authenticated, service_role;
