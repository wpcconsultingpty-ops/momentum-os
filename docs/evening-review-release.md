# Evening review release

## Approved ring redesign
The user selected readiness, follow-through and consistency instead of the blended overall/morning/evening rings.

- Readiness: equal weights for saved sleep quality, energy, mood and reversed stress (`10 - stress`), averaged then multiplied by ten. The morning scales now accept 0–10; saving confirms the four visible ratings. Hydration is separate context.
- Follow-through: main intention 40%, deliberate response 20%, movement/planned recovery 20%, nutrition 20%. Yes/partly/no and intentional/mixed/reactive map to 100/50/0. Training, light movement and planned recovery each earn full movement credit; no movement earns zero. Nutrition mostly well/mixed/not so well maps to 100/50/0.
- Drive, readiness and written reflection do not add or remove follow-through points.
- Consistency: completed AM/PM check-ins in the last seven local calendar days including today, shown as a count out of 14. No streak bonus or grace-day inflation. Each day/session counts at most once, and today's completion is labelled separately.
- Missing data stays unscored, yesterday never supplies today's rings, and unsaved form edits cannot change saved rings.
- Legacy numeric reviews count as completed check-ins but cannot generate a categorical follow-through score without the new answers. They display “Update review” today or “Legacy rating” in History.
- Original historical scores remain stored and exported. The historical score functions are retained only for the old database contract, not used by current rings, history metrics, trends or Coach score context. New partial entries no longer fabricate the missing half of a day.
- `momentum-scores.js` supplies the shared pure model for the browser and weekly server context. Categorical answers persist inside `evening_review.answers`; no additional database column is needed.
- Dashboard mini-rings show today's saved Sleep, Energy, Mood and Stress. Old performance badges and the separate streak card are hidden to avoid conflicting messages.
- History, seven-day charts, physical-trend readiness overlay, downloadable ring summary, Coach chat and Today's Moves use the new definitions. Legacy score fields are not relabelled as new metrics.
- API missing values remain null rather than becoming numeric zero.

### Ring verification
- 25 combined Node tests cover empty data, true zero, endpoints, weights, low drive, planned recovery, duplicate dates, rolling windows, stale/future days, JSONB persistence, unchanged legacy values, Coach sanitation and weekly context.
- Browser: fresh rings unscored; all-5 morning saves to 50; low-drive/planned-recovery evening can score 100; consistency advances 1/14 then 2/14; unsaved edits do not affect rings; saved zero energy is retained; reload and dashboard refresh agree.
- Browser Coach requests for both chat and Today's Moves carry separate ring measures, null legacy totals and genuine zero capacity. Provider responses are mocked for this test.
- Downloaded ring-summary PNG was opened and visually inspected. Desktop/mobile, light/dark and updated History were checked.
- Production deployment and real signed-in/cloud acceptance remain pending.

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
- Original eight evening-review tests plus seventeen ring-model tests: all pass.
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
