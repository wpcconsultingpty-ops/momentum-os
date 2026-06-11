-- Phase 6 fix: grant the Supabase Auth admin role the privileges needed to
-- run our handle_new_user() trigger.
--
-- On a fresh local Supabase stack, GoTrue inserts into auth.users as the
-- `supabase_auth_admin` role. The on_auth_user_created trigger then runs
-- handle_new_user(), which inserts into public.profiles. Even though the
-- function is SECURITY DEFINER, it needs explicit USAGE on the public schema
-- and EXECUTE on the function itself for supabase_auth_admin, and the function
-- owner must be a role with insert rights on public.profiles. Without this,
-- the trigger throws, the auth.users insert rolls back, and GoTrue surfaces
-- it as the opaque "Database error granting user" on sign-in.
--
-- See: https://supabase.com/docs/guides/auth/managing-user-data#using-triggers

grant usage on schema public to supabase_auth_admin;
grant insert on public.profiles to supabase_auth_admin;

-- Ensure the function is owned by a role with full DML rights on public.profiles
-- and is callable by supabase_auth_admin. `postgres` is the standard superuser
-- in Supabase's local stack and already owns public.profiles via the migration.
alter function public.handle_new_user() owner to postgres;
grant execute on function public.handle_new_user() to supabase_auth_admin;
