(function () {
  const S = window.MomentumScores, $ = id => document.getElementById(id);
  function entries() { try { return JSON.parse(localStorage.getItem('momentum-daily-entries') || '[]'); } catch (_) { return []; } }
  function current() { return S.summary(entries()); }
  function put(id, value) { if ($(id)) $(id).textContent = value; }
  function ring(id, valueId, value, display, description) {
    const el=$(id), label=$(valueId);
    if (!el || !label) return;
    const pct=value===null?0:value;
    el.style.strokeDasharray=327; el.style.strokeDashoffset=327-(pct/100*327);
    label.textContent=display ?? (value===null?'Not logged':String(value));
    label.classList.toggle('ring-empty',value===null);
    el.closest('.progress-ring').setAttribute('role','img');
    el.closest('.progress-ring').setAttribute('aria-label',description);
  }
  const avg = values => { const valid=values.filter(v=>v!==null); return valid.length?Math.round(valid.reduce((a,b)=>a+b,0)/valid.length):null; };
  function render() {
    const s=current(), consistency=s.consistency;
    ring('healthProgressRing','healthProgressValue',s.readiness,null,`Readiness: ${s.readiness??'not logged'}${s.readiness===null?'':' out of 100'}. Saved morning ratings only.`);
    ring('personalProgressRing','personalProgressValue',s.followThrough,s.legacyEvening?'Update review':null,`Follow-through: ${s.followThrough??(s.legacyEvening?'older review needs clearer answers':'not logged')}. Saved evening answers only.`);
    ring('overallProgressRing','overallProgressValue',consistency.completed?consistency.percent:null,consistency.completed?`${consistency.completed}/14`:'Not logged',`Consistency: ${consistency.completed} of 14 possible morning and evening check-ins over seven calendar days including today.`);
    put('overallScoreState',`${Number(s.today.morning)+Number(s.today.evening)}/2 today · ${consistency.todayInProgress?'in progress':'complete'}`);
    if ($('overallScoreState')) $('overallScoreState').className='score-pill';
    put('currentHealthScore',s.readiness??'Not logged');
    put('currentPersonalScore',s.followThrough??(s.legacyEvening?'Update review':'Not logged'));
    put('health7DayAvg',avg(consistency.days.map(d=>d.readiness))??'Not logged');
    put('personalWeeklyAvg',avg(consistency.days.map(d=>d.followThrough))??'Not logged');
    const valid=consistency.days.map(d=>d.followThrough).filter(v=>v!==null);
    put('personalBest',valid.length?Math.max(...valid):'Not logged');
    renderDrivers();
    const strip=$('consistencyDays');
    if (strip) {
      strip.replaceChildren();
      consistency.days.forEach(d => {
        const box=document.createElement('div'), date=new Date(d.date+'T12:00:00');
        box.className='consistency-day';
        const name=document.createElement('span');name.textContent=date.toLocaleDateString(undefined,{weekday:'short'});box.appendChild(name);
        for(const [k,label] of [['morning','Morning'],['evening','Evening']]) {
          const mark=document.createElement('span');mark.className='consistency-slot'+(d[k]?' complete':'');
          mark.textContent=label.slice(0,1);
          mark.setAttribute('aria-label',`${d.date} ${label}: ${d[k]?'logged':'not logged'}`);
          mark.title=mark.getAttribute('aria-label');box.appendChild(mark);
        }
        strip.appendChild(box);
      });
    }
  }
  function renderDrivers() {
    const e=S.dayMap(entries()).get(S.key(new Date()));
    for(const [name,field] of [['Sleep','sleepQuality'],['Energy','energy'],['Mood','mood'],['Discipline','stress']]) {
      const v=S.number(e?.[field]), el=$('driver'+name+'Ring'), txt=$('driver'+name+'Value');
      if(!el||!txt)continue;
      const c=2*Math.PI*30;el.style.strokeDasharray=c;el.style.strokeDashoffset=c-(v??0)/10*c;
      txt.textContent=v??'–';
      el.closest('.progress-ring').setAttribute('role','img');
      el.closest('.progress-ring').setAttribute('aria-label',`${name==='Discipline'?'Stress':name}: ${v===null?'not logged today':v+' out of 10, saved today'}`);
    }
  }
  function history() {
    const es=[...S.dayMap(entries()).values()].sort((a,b)=>new Date(b.date)-new Date(a.date)), s=current();
    put('totalDays',es.filter(e=>S.morningComplete(e)||S.eveningComplete(e)).length);
    put('healthStreak',`${s.consistency.completed}/14`);
    put('avgScore',avg(s.consistency.days.map(d=>d.readiness))??'Not logged');
    put('bestScore',avg(s.consistency.days.map(d=>d.followThrough))??'Not logged');
    const host=$('historyList'); if(!host)return;
    host.replaceChildren();
    const intro=document.createElement('p');intro.className='foot-note';
    intro.textContent='Readiness and follow-through use the new, separate definitions. Original scores remain in your stored records and exports; they are not compared with these measures.';
    host.appendChild(intro);
    if(!es.length){const p=document.createElement('p');p.textContent='Your saved check-ins will appear here.';host.appendChild(p);}
    es.slice(0,10).forEach(e=>{
      const row=document.createElement('div');row.className='history-item';
      const main=document.createElement('div');const date=document.createElement('strong');date.textContent=new Date(e.date).toLocaleDateString();main.appendChild(date);
      for(const [label,value] of [['Reflection',e.journalNote],['Win',e.eveningReview?.win],['Challenge',e.eveningReview?.challenge],['Next action',e.tomorrowFocus]]){
        if(value){const p=document.createElement('p');p.className='foot-note er-history';p.textContent=label+': '+value;main.appendChild(p);}
      }
      row.appendChild(main);
      for(const [label,value] of [['Readiness',S.readiness(e)??'Not logged'],['Follow-through',S.followThrough(e)??(S.eveningComplete(e)?'Legacy rating':'Not logged')],['Check-ins',`${Number(S.morningComplete(e))+Number(S.eveningComplete(e))}/2`]]){
        const cell=document.createElement('div'),caption=document.createElement('div'),stat=document.createElement('div');
        caption.className='card-label';caption.textContent=label;stat.className='history-stat';stat.textContent=value;cell.append(caption,stat);row.appendChild(cell);
      }
      host.appendChild(row);
    });
  }
  function charts() {
    const s=current();
    for(const id of ['weeklyChart','monthlyChart']) {
      const host=$(id);if(!host)continue;
      host.classList.add('score-timeline');host.replaceChildren();
      const caption=document.createElement('p');caption.className='score-chart-legend';caption.textContent='Readiness (green) · Follow-through (blue). Blank = not logged.';host.appendChild(caption);
      s.consistency.days.forEach(d=>{
        const col=document.createElement('div');col.className='score-chart-day';
        const bars=document.createElement('div');bars.className='score-chart-bars';
        for(const [field,label] of [['readiness','Readiness'],['followThrough','Follow-through']]) {
          const bar=document.createElement('div');bar.className='score-chart-bar '+field;
          bar.style.height=d[field]===null?'0':Math.max(1,d[field])+'%';
          bar.setAttribute('role','img');bar.setAttribute('aria-label',`${d.date} ${label}: ${d[field]??'not logged'}`);bar.title=bar.getAttribute('aria-label');
          const value=document.createElement('span');value.textContent=d[field]??'';bar.appendChild(value);bars.appendChild(bar);
        }
        const label=document.createElement('span');label.textContent=new Date(d.date+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'});
        col.append(bars,label);host.appendChild(col);
      });
    }
  }
  function downloadSummary() {
    const s=current(), c=document.createElement('canvas');c.width=1200;c.height=700;const ctx=c.getContext('2d');
    ctx.fillStyle='#f4f6f0';ctx.fillRect(0,0,c.width,c.height);
    ctx.textAlign='center';ctx.fillStyle='#243b2c';ctx.font='600 42px sans-serif';ctx.fillText('Momentum OS',600,90);
    ctx.font='24px sans-serif';ctx.fillText(new Date().toLocaleDateString(),600,138);
    const data=[['Readiness',s.readiness,s.readiness??'Not logged'],['Follow-through',s.followThrough,s.followThrough??'Not logged'],['Consistency',s.consistency.percent,`${s.consistency.completed}/14`]];
    data.forEach(([label,value,display],i)=>{
      const x=220+i*380;ctx.lineWidth=18;ctx.strokeStyle='#dde4d9';ctx.beginPath();ctx.arc(x,345,110,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle='#45684b';ctx.beginPath();ctx.arc(x,345,110,-Math.PI/2,-Math.PI/2+Math.PI*2*(value??0)/100);ctx.stroke();
      ctx.fillStyle='#243b2c';ctx.font=typeof display==='string'&&display.length>5?'22px sans-serif':'600 44px sans-serif';ctx.fillText(display,x,360);
      ctx.font='26px sans-serif';ctx.fillText(label,x,500);
    });
    ctx.font='20px sans-serif';ctx.fillText('Saved check-ins only. Consistency covers seven days including today.',600,586);
    ctx.fillText(`Readiness describes capacity, not achievement. Today: ${Number(s.today.morning)+Number(s.today.evening)}/2 check-ins.`,600,620);
    const a=document.createElement('a');a.download=`momentum-rings-${s.date}.png`;a.href=c.toDataURL('image/png');a.click();
  }
  function mount() {
    const grid=$('overallProgressRing')?.closest('.grid');
    if(grid) {
      // Readiness first, followed by behaviour, then the routine.
      grid.append($('healthProgressRing').closest('.progress-ring').parentElement,$('personalProgressRing').closest('.progress-ring').parentElement,$('overallProgressRing').closest('.progress-ring').parentElement);
      const details=document.createElement('details');details.className='score-explainer';
      details.innerHTML=`<summary>What these rings measure</summary>
        <p><strong>Readiness:</strong> Sleep, energy and mood, plus stress reversed (10 minus your stress rating). Each counts equally. The average is multiplied by 10. These are self-ratings of capacity, not a medical assessment or an achievement grade.</p>
        <p><strong>Follow-through:</strong> Main intention 40%, deliberate responses 20%, movement or planned recovery 20%, nutrition 20%. Yes / partly / no and intentional / mixed / reactive map to 100 / 50 / 0. Training, light movement and planned recovery each get full movement credit; no movement gets 0. Nutrition mostly well / mixed / not so well maps to 100 / 50 / 0.</p>
        <p>Drive, mood and written reflections do not earn or lose follow-through points. Older numeric ratings are not silently converted into these new answer categories.</p>
        <p><strong>Consistency:</strong> Completed morning and evening check-ins across seven calendar days including today, out of 14 possible check-ins. Each counts once. Missing records are empty slots, not assumptions about how your day went. Today is still in progress. There is no streak bonus.</p>
        <p>Rings use saved answers only. Unsaved edits, missing answers and yesterday’s entries never fill today’s rings.</p>`;
      grid.after(details);
      const strip=document.createElement('div');strip.id='consistencyDays';strip.className='consistency-days';strip.setAttribute('aria-label','Seven-day check-in log');details.after(strip);
      const key=document.createElement('p');key.className='foot-note';key.textContent='M = morning · E = evening. Filled = logged. Today’s slots fill as you check in.';strip.after(key);
    }
    // Stress is a primary readiness input, not an unconfirmed optional extra.
    const stress=$('stress')?.closest('.range-row');if(stress)$('healthRangeList').appendChild(stress);
    const note=document.createElement('p');note.className='foot-note';note.textContent='Adjust all four ratings, then save to confirm. Sleep, energy and mood: 0 = very low, 10 = very high. Stress: 0 = none, 10 = intense. The ring updates only after saving.';
    $('healthRangeList')?.before(note);
    window.shareMomentum=downloadSummary;
    render();history();charts();
    const refresh=()=>{render();history();charts();};
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
    function rollDay() {
      const midnight=new Date();midnight.setHours(24,0,0,50);
      setTimeout(()=>{refresh();rollDay();},midnight.getTime()-Date.now());
    }
    rollDay();
  }
  window.ScoreRings={render,renderDrivers,history,charts,current};
  document.addEventListener('DOMContentLoaded',mount);
})();
