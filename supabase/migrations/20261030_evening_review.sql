-- Additive only. Apply before releasing the evening review frontend.
-- Existing rows, numeric scores, notes and journal entries are unchanged.
alter table public.daily_entries
  add column if not exists evening_review jsonb;
comment on column public.daily_entries.evening_review is
  'Versioned evening reflection: win, challenge, categorical answers and savedAt. Numeric metrics remain in existing columns.';
