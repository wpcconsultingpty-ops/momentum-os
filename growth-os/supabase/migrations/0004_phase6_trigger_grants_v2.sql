-- Phase 6 fix v2: comprehensive grants + hardened function for the new-user
-- trigger.
--
-- The prior migration (0003) made anon-driven sign-ups work, but service-role
-- calls to auth.admin.createUser still tripped "Database error granting user".
-- Service role inserts directly into auth.users and then GoTrue creates an
-- identity + session in the same transaction; if ANY of those steps cannot
-- access public.profiles via the trigger, the whole transaction rolls back.
--
-- Belt-and-braces fix per Supabase docs:
--   1. Grant public schema usage + DML on profiles to every role that may end
--      up being the effective caller of the trigger (supabase_auth_admin,
--      service_role, authenticated, anon).
--   2. Re-create the function with `set search_path = ''` and a fully
--      qualified table reference so it works regardless of the caller's
--      search_path (Supabase recommended pattern).
--   3. Keep the function security definer, owned by postgres, and grant
--      execute to all relevant roles.
--
-- See: https://supabase.com/docs/guides/auth/managing-user-data

grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
grant select, insert, update, delete on public.profiles to authenticated, service_role;
grant insert on public.profiles to supabase_auth_admin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;
grant execute on function public.handle_new_user()
  to anon, authenticated, service_role, supabase_auth_admin;

-- Re-attach the trigger to pick up the new function definition.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
