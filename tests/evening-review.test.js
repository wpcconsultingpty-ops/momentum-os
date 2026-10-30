import test from 'node:test';
import assert from 'node:assert/strict';
import '../evening-review.js';
import { rowToEntry } from '../api/_lib/brief.js';
// The API module constructs its SDK client on import. These tests only exercise
// pure context builders and never invoke a provider.
process.env.OPENAI_API_KEY = 'unit-test-placeholder-no-network';
const { buildContext, buildChatUserPrompt } = await import('../api/coach.js');

const { recap, keyOf } = globalThis.MomentumEvening;
test('empty review does not invent wins, struggles, or a next action', () => {
  const result = recap({});
  assert.deepEqual(result.facts, []);
  assert.equal(result.win, '');
  assert.equal(result.challenge, '');
  assert.equal(result.tomorrow, '');
});
test('specific blocker drives practical feedback', () => {
  for (const blocker of ['Time', 'Energy', 'Forgot', 'Other people', "Didn't want to"]) {
    const result = recap({ disciplineAnswer: 'partly', disciplineBlocker: blocker });
    assert.equal(result.facts.length, 1);
    assert.notEqual(result.suggestion, recap({}).suggestion);
  }
});
test('positive and difficult days are grounded in selected answers', () => {
  assert.equal(recap({ disciplineAnswer: 'yes', exerciseAnswer: 'trained', nutritionAnswer: 'on' }).facts.length, 3);
  assert.match(recap({ disciplineAnswer: 'no' }).facts[0], /not a verdict/);
  assert.match(recap({ desireAnswer: 'low' }).suggestion, /little drive/);
  assert.match(recap({ controlAnswer: 'reactive' }).suggestion, /pressure point/);
});
test('legacy numeric values are not relabelled as categorical answers', () => {
  assert.deepEqual(recap({ discipline: 9, exercise: 9, nutrition: 9 }).facts, []);
});
test('writing remains literal; no invented analysis of the challenge', () => {
  const r = recap({ eveningReview: { win: '<script>literal</script>', challenge: '  Requests  ' }, tomorrowFocus: '  Walk  ' });
  assert.equal(r.win, '<script>literal</script>');
  assert.equal(r.challenge, 'Requests');
  assert.equal(r.tomorrow, 'Walk');
});
test('cloud rows retain evening reflection and next action for weekly context', () => {
  const r = rowToEntry({ entry_date: '2026-10-30', evening_review: { version: 1, win: 'Finished' }, tomorrow_focus: 'Walk' });
  assert.equal(r.eveningReview.win, 'Finished');
  assert.equal(r.tomorrowFocus, 'Walk');
});
test('local date keys are calendar dates rather than UTC date truncation', () => {
  assert.equal(keyOf(new Date(2026, 9, 30, 0, 1)), '2026-10-30');
});
test('evening reflection survives backend sanitation into AI prompt', () => {
  const context = buildContext({
    freeText: 'Help with my review',
    historySignals: { eveningReviews: [{ date: '2026-10-30', win: 'Finished proposal', challenge: 'Interruptions', nextAction: 'Plan after breakfast' }] },
    retrievedContext: [{ date: '2026-10-30', eveningReview: { win: 'Finished proposal', challenge: 'Interruptions', nextAction: 'Plan after breakfast' } }]
  });
  const prompt = buildChatUserPrompt(context);
  assert.match(prompt, /Finished proposal/);
  assert.match(prompt, /Plan after breakfast/);
  assert.equal(context.retrievedContext[0].eveningReview.challenge, 'Interruptions');
});
