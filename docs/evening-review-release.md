# Evening review release

## Changes
- Three short steps: Look back, Check in, Tomorrow.
- Follow-through against the full morning focus, or a meaningful no-focus question.
- Optional win, difficulty and one next action.
- Movement, nutrition, drive and control use anchored tap answers instead of vague dials.
- Existing numeric score formula and historical numeric values are preserved. New Drive/Control choices map to 2, 5 and 9; this can affect future score distributions compared with free-form dials.
- Instant, deterministic feedback uses selected answers and blockers. It is not presented as an AI-generated analysis or an inferred trend.
- The existing AI Coach receives evening review context. The user reviews/sends the question.
- Next-morning action reminder requires an explicit click and never replaces an existing focus.
- History, JSON export, Coach retrieval and weekly context include the new reflection.

## Release gates
- Apply `supabase/migrations/20261030_evening_review.sql` before the frontend release. This only adds a nullable JSONB column; do not rewrite existing rows.
- Count daily_entries before/after the migration.
- Merge/deploy only after production approval.
- Real signed-in cloud save/reload and AI-provider response remain separate acceptance gates from local browser and mocked transport tests.
- The app's existing device-local primary entry store is preserved. This release does not introduce cross-device account-history restoration.

## Storage
The browser stores a versioned `eveningReview` object and existing `tomorrowFocus` on the same daily entry. It does not overwrite `journalNote` or `notes`.

Supabase upserts send `evening_review` only for entries with a review, protecting it from legacy resync payloads. The next action uses the existing `tomorrow_focus` column. Failed cloud sync remains visibly distinct from local save, with a retry control. The migration must be present for these upserts to succeed.

## Rollback
Revert the application commit. Keep the additive database column. Existing builds ignore it, and existing rows and numeric fields remain compatible.

## Verification completed
- Eight Node tests: recap grounding, blocker-specific suggestions, legacy ratings, literal text, database row mapping, local dates, and the backend Coach sanitation/prompt path.
- Browser interactions: required-answer validation, no-morning-focus entry, save, reload, edit, Back/Next, navigation during edits, separate journal preservation, History rendering and literal HTML-like text.
- Legacy browser fixture: arbitrary existing 4/8/6/7/8 ratings and blocker detail retained on edit/save.
- Yesterday-to-morning carry-forward and prevention of focus overwrite.
- Midnight guard checked with the browser clock.
- Simulated Supabase failure: local review retained, error visible, retry successful, expected JSONB/next-action payload captured. No real account writes performed.
- Simulated local storage failure: error visible and entered text retained.
- Coach request/response transport tested with a labelled mock; real AI output not claimed.
- Desktop/375px and light/dark visually inspected; no horizontal overflow.
- Hosted private sample-data preview: fresh-context save with optional writing blank, saved recap and History checked; no page errors.
- Production and signed-in cloud acceptance remain pending, as described above.
