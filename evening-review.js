(function () {
  'use strict';
  const text = value => typeof value === 'string' ? value.trim() : '';
  const keyOf = date => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function recap(entry) {
    const e = entry || {}, r = e.eveningReview || {}, facts = [];
    if (e.disciplineAnswer === 'yes') facts.push('You followed through on what mattered today.');
    if (e.disciplineAnswer === 'partly') facts.push('You made some progress, even if not everything got done.');
    if (e.disciplineAnswer === 'no') facts.push('You did not follow through today. That is information for tomorrow, not a verdict on you.');
    if (e.exerciseAnswer === 'trained') facts.push('You made time to train.');
    if (e.exerciseAnswer === 'light') facts.push('You got some movement in.');
    if (e.exerciseAnswer === 'rest') facts.push('You chose planned recovery for your body.');
    if (e.nutritionAnswer === 'on') facts.push('You felt you ate mostly well.');
    let suggestion = 'Keep tomorrow manageable: choose one useful action and decide when you will start.';
    const blocker = text(e.disciplineBlocker).split(' · ')[0];
    if (e.disciplineAnswer === 'yes') suggestion = 'Notice what made follow-through possible today. Make that condition easier to repeat tomorrow.';
    if (e.disciplineAnswer === 'partly' || e.disciplineAnswer === 'no') {
      suggestion = 'Shrink the unfinished intention to a first step you can do in ten minutes. Choose a start time, not just an outcome.';
      if (blocker === 'Time') suggestion = 'Time got in the way. Give one small first step a specific slot tomorrow, before the day fills up.';
      if (blocker === 'Energy') suggestion = 'Energy got in the way. Choose a smaller first step and put it in the part of tomorrow when you usually feel most capable.';
      if (blocker === 'Forgot') suggestion = 'Make the next step visible: set one reminder or leave what you need where you will see it.';
      if (blocker === 'Other people') suggestion = 'Separate what you can do from what needs someone else. Make tomorrow’s first action something within your control.';
      if (blocker === "Didn't want to") suggestion = 'Check whether the intention still matters. If it does, make the starting step small enough to try without waiting for motivation.';
    } else if (e.desireAnswer === 'low') {
      suggestion = 'With little drive today, lower the starting effort tomorrow. Pick a small, concrete action rather than relying on motivation.';
    } else if (e.controlAnswer === 'reactive') {
      suggestion = 'For tomorrow’s likely pressure point, decide on one response in advance. A brief pause can be the first step.';
    }
    return { facts, suggestion, win: text(r.win), challenge: text(r.challenge), tomorrow: text(e.tomorrowFocus) };
  }
  globalThis.MomentumEvening = { recap, keyOf };
  if (typeof document === 'undefined') return;
  let mounted = false, step = 0, day = keyOf(new Date()), dirty = false, locked = false, signature = '';
  const $ = id => document.getElementById(id);
  function entries() { try { return JSON.parse(localStorage.getItem('momentum-daily-entries') || '[]'); } catch (_) { return []; } }
  function today() { return entries().find(e => keyOf(e.date) === keyOf(new Date())) || {}; }
  function read() {
    return {
      eveningReview: { version: 1, win: text($('erWin').value).slice(0, 500), challenge: text($('erChallenge').value).slice(0, 500), answers: window.tapEntryFields(), savedAt: new Date().toISOString() },
      tomorrowFocus: text($('erTomorrow').value).slice(0, 300)
    };
  }
  function showStep(index, focus) {
    step = Math.max(0, Math.min(2, index));
    document.querySelectorAll('.er-step').forEach((el, i) => { el.hidden = i !== step; });
    document.querySelectorAll('.er-progress li').forEach((el, i) => {
      if (i === step) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
    });
    $('erBack').hidden = step === 0; $('erNext').hidden = step === 2;
    $('savePersonalBtn').hidden = step !== 2;
    $('erNext').textContent = step === 0 ? 'Next: check in' : 'Next: tomorrow';
    if (focus) $('erStep' + step).querySelector('h3').focus();
  }
  function showQuestion(key) { showStep(key === 'discipline' ? 0 : 1); }
  function dayGuard() {
    if (day === keyOf(new Date())) return true;
    $('erStatus').textContent = 'A new day has started. Your unfinished review has not been saved to the new day. Reload to start today’s review.';
    $('erStatus').dataset.error = 'true'; return false;
  }
  function hydrate(saved) {
    if (!mounted) return;
    const e = today(), r = e.eveningReview || {}, nextSignature = JSON.stringify([e.date, r, e.tomorrowFocus]);
    if (!dirty && signature !== nextSignature) {
      $('erWin').value = text(r.win); $('erChallenge').value = text(r.challenge);
      $('erTomorrow').value = text(e.tomorrowFocus); signature = nextSignature;
    }
    locked = saved;
    $('erWizard').hidden = saved; $('erActions').hidden = saved; $('erSummary').hidden = !saved;
    if (saved) { dirty = false; renderSummary(e); } else showStep(step);
    renderCarry();
  }
  function addText(parent, tag, value) {
    const el = document.createElement(tag); el.textContent = value; parent.appendChild(el); return el;
  }
  function renderSummary(e) {
    const host = $('erSummary'), data = recap(e); host.replaceChildren();
    addText(host, 'h3', 'Day closed. Take the useful part forward.');
    addText(host, 'p', e.eveningReview ? 'Your recap, based on what you logged.' : 'Your earlier check-in is saved. Use Edit to add a win, a challenge or tomorrow’s action.');
    if (data.facts.length) { const list = document.createElement('ul'); data.facts.forEach(f => addText(list, 'li', f)); host.appendChild(list); }
    for (const [label, value] of [['A win to keep', data.win], ['What made it harder', data.challenge]]) {
      if (value) { addText(host, 'h4', label); addText(host, 'p', value); }
    }
    addText(host, 'h4', 'One thing to try'); addText(host, 'p', data.suggestion);
    addText(host, 'h4', 'Your next action'); addText(host, 'p', data.tomorrow || 'No action set. You can choose one in the morning.');
    const actions = document.createElement('div'); actions.className = 'er-actions'; host.appendChild(actions);
    const coach = addText(actions, 'button', 'Talk it through with Coach'); coach.type = 'button'; coach.className = 'btn btn-secondary';
    coach.addEventListener('click', () => {
      window.switchView('aiCoach');
      $('coachPrompt').value = 'Help me make sense of my latest evening review. Use what I actually logged, recognise progress without glossing over difficulty, and help me make my next action realistic. Do not infer a pattern from one day.';
      $('coachPrompt').focus();
    });
    const journal = addText(actions, 'button', 'Write a longer reflection'); journal.type = 'button'; journal.className = 'btn btn-secondary';
    journal.addEventListener('click', () => { window.switchView('journal'); $('journalText').focus(); });
  }
  function renderCarry() {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const e = entries().find(item => keyOf(item.date) === keyOf(yesterday)), action = text(e && e.tomorrowFocus);
    $('erCarry').hidden = !action; $('erCarryText').textContent = action;
    const focus = $('morningFocus'); $('erUseAction').disabled = !action || !!text(focus.value) || focus.readOnly;
    $('erCarryHelp').textContent = text(focus.value) || focus.readOnly ? 'Your morning focus is already set. This reminder will not replace it.' : 'Use this as your morning focus, or choose something different.';
  }
  function mount() {
    if (mounted) return;
    const panel = document.querySelector('#personal .section-card'), wizard = document.createElement('div');
    wizard.id = 'erWizard';
    wizard.innerHTML = `
      <ol class="er-progress" aria-label="Review progress"><li>Look back</li><li>Check in</li><li>Tomorrow</li></ol>
      <section class="er-step" id="erStep0"><h3 tabindex="-1">What mattered today?</h3><p>Start with what you intended. Then give the day a fair hearing.</p><div id="erFollow"></div>
        <label class="er-field"><span>What went well?</span><small>A small win counts. Optional, up to 500 characters.</small><textarea id="erWin" maxlength="500" placeholder="Something you handled well, enjoyed or made progress on…"></textarea></label>
        <label class="er-field"><span>What made today harder?</span><small>What happened, rather than a judgement about yourself. Optional, up to 500 characters.</small><textarea id="erChallenge" maxlength="500" placeholder="A difficulty, a distraction or something worth learning from…"></textarea></label>
      </section>
      <section class="er-step" id="erStep1" hidden><h3 tabindex="-1">How did you show up?</h3><p>A quick read on your habits and headspace. Pick what fits, not what you wish had happened.</p><div id="erChecks"></div></section>
      <section class="er-step" id="erStep2" hidden><h3 tabindex="-1">Make tomorrow a little easier.</h3><p>One realistic action is enough. You do not need to solve everything tonight.</p>
        <label class="er-field"><span>What is your one next action?</span><small>Include when or where you will start. Optional, up to 300 characters.</small><textarea id="erTomorrow" maxlength="300" placeholder="After breakfast, spend ten minutes on…"></textarea></label>
        <p class="er-help">This will be waiting in your next morning entry. Saving also gives you a short recap and a practical suggestion.</p>
      </section>`;
    panel.insertBefore(wizard, $('tapCards'));
    const actions = document.createElement('div'); actions.id = 'erActions'; actions.className = 'er-actions';
    actions.innerHTML = '<button type="button" class="btn btn-secondary" id="erBack">Back</button><button type="button" class="btn btn-primary" id="erNext">Next: check in</button>';
    panel.appendChild(actions);
    const oldRow = $('savePersonalBtn').parentElement; actions.appendChild($('savePersonalBtn')); oldRow.remove();
    const summary = document.createElement('section'); summary.id = 'erSummary'; summary.className = 'er-summary'; summary.hidden = true; panel.appendChild(summary);
    const status = document.createElement('p'); status.id = 'erStatus'; status.className = 'er-status'; status.setAttribute('role', 'status'); panel.appendChild(status);
    const retry = document.createElement('button'); retry.id = 'erRetry'; retry.type = 'button'; retry.className = 'btn btn-secondary'; retry.textContent = 'Retry cloud sync'; retry.hidden = true; panel.appendChild(retry);
    const scores = document.createElement('details'); scores.className = 'er-scores'; scores.innerHTML = '<summary>View scores and weekly trend</summary>'; scores.appendChild($('eveningScoreCards')); panel.appendChild(scores);
    $('personalRangeList').hidden = true;
    $('personalRangeList').querySelectorAll('input').forEach(el => { el.tabIndex = -1; });
    window.renderTapCards(false); $('erFollow').appendChild($('tc-discipline'));
    for (const key of ['exercise', 'nutrition', 'desire', 'control']) $('erChecks').appendChild($('tc-' + key));
    const carry = document.createElement('aside'); carry.id = 'erCarry'; carry.className = 'er-carry'; carry.hidden = true;
    carry.innerHTML = '<strong>From last night</strong><p id="erCarryText"></p><p id="erCarryHelp" class="er-help"></p><button type="button" id="erUseAction" class="btn btn-secondary">Use as today’s focus</button>';
    $('morningFocus').before(carry); mounted = true;
    ['erWin', 'erChallenge', 'erTomorrow'].forEach(id => $(id).addEventListener('input', () => { dirty = true; }));
    $('morningFocus').addEventListener('input', renderCarry);
    $('erUseAction').addEventListener('click', () => {
      if (text($('morningFocus').value) || $('morningFocus').readOnly) return;
      $('morningFocus').value = $('erCarryText').textContent;
      $('morningFocus').dispatchEvent(new Event('input', { bubbles: true })); $('morningFocus').focus();
    });
    $('erBack').addEventListener('click', () => showStep(step - 1, true));
    $('erNext').addEventListener('click', () => {
      if (!dayGuard()) return;
      for (const key of step === 0 ? ['discipline'] : ['exercise', 'nutrition', 'desire', 'control']) {
        const card = $('tc-' + key);
        if (!card.querySelector('.ft-opt[aria-pressed="true"]')) {
          card.querySelector('.ft-err').hidden = false; card.querySelector('button').focus(); return;
        }
      }
      showStep(step + 1, true);
    });
    $('savePersonalBtn').addEventListener('click', ev => {
      if (!dayGuard()) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
      $('erStatus').textContent = 'Saving…'; $('erStatus').dataset.error = 'false'; $('erRetry').hidden = true;
    }, true);
    $('personalEditBtn').addEventListener('click', () => { step = 0; showStep(0, true); $('erStatus').textContent = ''; });
    $('erRetry').addEventListener('click', async () => {
      retry.disabled = true;
      try { displaySync(await syncEntryToSupabase(today())); } catch (_) { displaySync({ ok: false }); }
      finally { retry.disabled = false; }
    });
    window.addEventListener('momentum:sync', ev => {
      if (keyOf(ev.detail.date) === day && today().eveningReview) displaySync(ev.detail);
    });
    hydratePersonalLockState();
    if (locked) $('erStatus').textContent = 'Saved on this device. Cloud status is confirmed when you save or retry.';
    const oldSwitch = window.switchView;
    window.switchView = function (view) { oldSwitch(view); renderCarry(); };
  }
  function displaySync(result) {
    $('erStatus').textContent = result.ok ? 'Saved on this device and synced to your account.' :
      result.localOnly ? 'Saved on this device only. Sign in to sync to your account.' :
      'Saved on this device. Cloud sync did not complete; your review is still here. Try again when you are online.';
    $('erStatus').dataset.error = String(!result.ok && !result.localOnly);
    $('erRetry').hidden = !!result.ok || !!result.localOnly;
  }
  window.EveningReview = { read, hydrate, showQuestion, saveError() {
    $('erStatus').textContent = 'Your review could not be saved on this device. Your answers are still in the form. Check available storage and try again.';
    $('erStatus').dataset.error = 'true';
  }};
  document.addEventListener('DOMContentLoaded', mount);
})();
