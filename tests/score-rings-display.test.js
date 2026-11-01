import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import '../momentum-scores.js';

const source = readFileSync(new URL('../score-rings.js', import.meta.url), 'utf8');
function element() {
  const classes = new Set();
  return {
    style: {}, attributes: {}, textContent: '', className: '',
    classList: {
      toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    setAttribute(name, value) { this.attributes[name] = value; }
  };
}
function harness(initial = []) {
  let records = initial;
  const nodes = new Map();
  for (const [ring, value] of [
    ['healthProgressRing','healthProgressValue'],
    ['personalProgressRing','personalProgressValue'],
    ['overallProgressRing','overallProgressValue'],
    ...['Sleep','Energy','Mood','Discipline'].map(n => [`driver${n}Ring`,`driver${n}Value`])
  ]) {
    const container = element(), arc = element();
    arc.closest = () => container;
    nodes.set(ring, arc); nodes.set(value, element());
  }
  for (const id of ['readinessRingHint','followThroughRingHint','overallScoreState']) nodes.set(id, element());
  const window = { MomentumScores: globalThis.MomentumScores };
  vm.runInNewContext(source, {
    window, document: { getElementById: id => nodes.get(id), addEventListener() {} },
    localStorage: { getItem: () => JSON.stringify(records) }
  });
  return {
    node: id => nodes.get(id),
    render(next = records) { records = next; window.ScoreRings.render(); }
  };
}
const dated = fields => ({ date: new Date().toISOString(), ...fields });
test('empty main and driver dials have neutral state, centred dash and useful captions', () => {
  const h = harness(); h.render();
  for (const prefix of ['health','personal','overall']) {
    assert.equal(h.node(prefix+'ProgressValue').textContent, '–');
    assert.ok(h.node(prefix+'ProgressRing').closest().classList.contains('is-unrecorded'));
  }
  for (const name of ['Sleep','Energy','Mood','Discipline']) {
    assert.equal(h.node('driver'+name+'Value').textContent, '–');
    assert.ok(h.node('driver'+name+'Ring').closest().classList.contains('is-unrecorded'));
  }
  assert.equal(h.node('overallScoreState').textContent, 'Begins with your first check-in');
  assert.match(h.node('readinessRingHint').textContent, /morning entry/);
  assert.match(h.node('healthProgressRing').closest().attributes['aria-label'], /not logged/);
});
test('real zero remains numeric and keeps recorded styling; no records are modified', () => {
  const records = [dated({
    mood:0, energy:0, sleepQuality:0, stress:10,
    disciplineAnswer:'no',controlAnswer:'reactive',exerciseAnswer:'none',nutritionAnswer:'off'
  })], before = JSON.stringify(records), h = harness(records); h.render();
  for (const prefix of ['health','personal']) {
    assert.equal(h.node(prefix+'ProgressValue').textContent, '0');
    assert.equal(h.node(prefix+'ProgressRing').closest().classList.contains('is-unrecorded'), false);
  }
  assert.equal(h.node('overallProgressValue').textContent, '2/14');
  assert.equal(h.node('driverSleepRing').closest().classList.contains('is-unrecorded'), false);
  assert.equal(JSON.stringify(records), before);
});
test('empty and scored styles reset in both directions', () => {
  const h = harness(); h.render();
  h.render([dated({mood:6,energy:6,sleepQuality:6,stress:4})]);
  assert.equal(h.node('healthProgressValue').textContent, '60');
  assert.equal(h.node('healthProgressValue').classList.contains('ring-empty'), false);
  assert.match(h.node('readinessRingHint').textContent, /starting capacity/);
  h.render([]);
  assert.equal(h.node('healthProgressValue').textContent, '–');
  assert.equal(h.node('healthProgressValue').classList.contains('ring-empty'), true);
});
test('partial morning data does not invent readiness and legacy review stays explicit', () => {
  const h = harness([dated({mood:7,desire:4,discipline:5,control:5,exercise:5,nutrition:5})]); h.render();
  assert.equal(h.node('healthProgressValue').textContent, '–');
  assert.equal(h.node('driverMoodValue').textContent, 7);
  assert.equal(h.node('personalProgressValue').textContent, 'Update review');
  assert.ok(h.node('personalProgressValue').classList.contains('ring-empty-copy'));
  assert.equal(h.node('overallProgressValue').textContent, '1/14');
});
test('yesterday keeps consistency but does not fill today; legacy copy resets', () => {
  const h = harness(); const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
  h.render([{date:yesterday.toISOString(),mood:5,energy:5,sleepQuality:5,stress:5}]);
  assert.equal(h.node('healthProgressValue').textContent, '–');
  assert.equal(h.node('overallProgressValue').textContent, '1/14');
  assert.equal(h.node('personalProgressValue').classList.contains('ring-empty-copy'), false);
});
