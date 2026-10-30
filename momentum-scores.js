/* Shared, pure model. Browser rings and server context use these same rules. */
(function () {
  const version = 'readiness-followthrough-consistency-v1';
  const number = v => (v === null || v === undefined || (typeof v === 'string' && !v.trim()) || typeof v === 'boolean') ? null :
    (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 10 ? Number(v) : null);
  function key(date) {
    if (date === null || date === undefined || date === '') return null;
    const d = new Date(date);
    if (!Number.isFinite(d.getTime())) return null;
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function answers(e) { return { ...(e?.eveningReview?.answers || {}), ...Object.fromEntries(
    ['disciplineAnswer','controlAnswer','exerciseAnswer','nutritionAnswer'].filter(k => e?.[k] != null).map(k => [k,e[k]])
  ) }; }
  function readiness(e) {
    if (!e) return null;
    const vals = ['sleepQuality','energy','mood','stress'].map(k => number(e[k]));
    if (vals.some(v => v === null)) return null;
    return Math.round((vals[0] + vals[1] + vals[2] + (10-vals[3])) / 4 * 10);
  }
  function followThrough(e) {
    if (!e) return null;
    const a = answers(e), scales = [
      ['disciplineAnswer', .4, {yes:100,partly:50,no:0}],
      ['controlAnswer', .2, {intentional:100,mixed:50,reactive:0}],
      ['exerciseAnswer', .2, {trained:100,light:100,rest:100,none:0}],
      ['nutritionAnswer', .2, {on:100,mixed:50,off:0}]
    ];
    if (scales.some(([k,,map]) => !Object.hasOwn(map, a[k]))) return null;
    return Math.round(scales.reduce((sum,[k,w,map]) => sum + w*map[a[k]],0));
  }
  function morningComplete(e) { return readiness(e) !== null; }
  function eveningComplete(e) {
    return followThrough(e) !== null || ['desire','discipline','control','exercise','nutrition'].every(k => number(e?.[k]) !== null);
  }
  function dayMap(entries) {
    const result = new Map();
    // Merge duplicate fragments in chronological order; never count a day twice.
    [...(Array.isArray(entries) ? entries : [])].filter(e => e && key(e.date))
      .sort((a,b) => new Date(a.date)-new Date(b.date))
      .forEach(e => result.set(key(e.date), {...result.get(key(e.date)), ...e}));
    return result;
  }
  function summary(entries, now = new Date()) {
    const byDay = dayMap(entries), date = key(now), current = byDay.get(date) || null, days = [];
    for (let i=6;i>=0;i--) {
      const d = new Date(now); d.setDate(d.getDate()-i); const k = key(d), e = byDay.get(k);
      days.push({date:k,morning:morningComplete(e),evening:eveningComplete(e),readiness:readiness(e),followThrough:followThrough(e)});
    }
    const completed = days.reduce((n,d) => n+Number(d.morning)+Number(d.evening),0);
    return {version,date,readiness:readiness(current),followThrough:followThrough(current),
      legacyEvening:eveningComplete(current) && followThrough(current) === null,
      consistency:{completed,total:14,percent:Math.round(completed/14*100),days,todayInProgress:!(morningComplete(current)&&eveningComplete(current))},
      today:{morning:morningComplete(current),evening:eveningComplete(current)}};
  }
  globalThis.MomentumScores = {version,number,key,answers,readiness,followThrough,morningComplete,eveningComplete,dayMap,summary};
})();
