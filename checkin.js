/* Momentum OS - Daily Check-in (story-style) */
(function () {
  'use strict';

  var CSS = '\
#checkin .moci-stage{max-width:480px;margin:0 auto;}\
.moci-overlay{position:fixed;inset:0;background:#e9e6df;display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;}\
.moci-card{position:relative;width:100%;max-width:430px;min-height:640px;background:linear-gradient(180deg,#fbfaf7,#eef0ea);border-radius:28px;box-shadow:0 20px 60px rgba(47,58,49,.18);padding:22px;display:flex;flex-direction:column;color:#1f2a22;}\
.moci-card.dark{background:linear-gradient(180deg,#1f2a22,#0e150f);color:#f3f1ea;}\
.moci-top{display:flex;align-items:center;gap:10px;margin-bottom:8px;}\
.moci-badge{width:38px;height:38px;border-radius:50%;background:#88a08b;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.8rem;}\
.moci-meta strong{display:block;font-size:.85rem;}.moci-meta span{font-size:.72rem;color:#6e776f;}\
.moci-card.dark .moci-meta span{color:#b9c2ba;}\
.moci-ctrls{margin-left:auto;display:flex;gap:14px;}\
.moci-ctrls button{background:none;border:none;cursor:pointer;font-size:1rem;color:inherit;opacity:.7;}\
.moci-bars{display:flex;gap:4px;margin:10px 0 18px;}\
.moci-bars i{flex:1;height:3px;border-radius:2px;background:rgba(110,119,111,.25);}\
.moci-bars i.on{background:#88a08b;}\
.moci-q{text-align:center;font-family:Cabinet Grotesk,sans-serif;font-size:1.5rem;font-weight:700;margin:8px 0 4px;}\
.moci-sub{text-align:center;color:#6e776f;font-size:.9rem;margin-bottom:18px;}\
.moci-card.dark .moci-sub{color:#c3ccc4;}\
.moci-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px;}\
.moci-opt{background:#f4f3ee;border:1px solid #e1e0d8;border-radius:16px;padding:26px 8px;cursor:pointer;text-align:center;transition:.15s;}\
.moci-opt:hover{border-color:#88a08b;transform:translateY(-2px);}\
.moci-opt .e{font-size:1.8rem;display:block;margin-bottom:10px;}.moci-opt .l{font-weight:600;font-size:.9rem;}\
.moci-slidewrap{margin:30px 6px;}.moci-slidewrap input{width:100%;}\
.moci-slidelabels{display:flex;justify-content:space-between;color:#6e776f;font-size:.85rem;margin-top:10px;}\
.moci-pct{text-align:center;font-size:2rem;font-weight:700;color:#88a08b;margin-top:6px;}\
.moci-stars{display:flex;justify-content:center;gap:10px;margin:24px 0;}\
.moci-stars span{font-size:2rem;cursor:pointer;color:#cfd4cc;}.moci-stars span.on{color:#e8b54a;}\
.moci-hint{text-align:center;color:#9aa29a;font-size:.78rem;margin-top:auto;padding-top:14px;}\
.moci-narr{font-family:Cabinet Grotesk,sans-serif;font-size:1.9rem;font-weight:800;line-height:1.1;margin:18px 0 12px;}\
.moci-narr-body{color:#d5ddd5;font-size:.95rem;line-height:1.5;}\
.moci-list{margin-top:18px;display:flex;flex-direction:column;gap:10px;}\
.moci-list div{background:rgba(255,255,255,.08);border-radius:12px;padding:12px 14px;font-size:.9rem;font-weight:600;}\
.moci-btn{margin-top:auto;background:#88a08b;color:#fff;border:none;border-radius:999px;padding:15px;font-weight:700;cursor:pointer;font-size:1rem;}\
.moci-card.dark .moci-btn{background:#fbfaf7;color:#1f2a22;}\
.moci-recap-row{display:flex;justify-content:space-between;align-items:center;background:#f4f3ee;border-radius:14px;padding:14px 16px;margin-bottom:8px;}\
.moci-recap-row .k{font-size:.72rem;letter-spacing:.05em;text-transform:uppercase;color:#6e776f;}.moci-recap-row .v{font-weight:700;}\
.moci-altbtns{display:flex;gap:10px;margin-top:10px;}\
.moci-altbtns button{flex:1;background:#f4f3ee;border:none;border-radius:999px;padding:13px;font-weight:600;cursor:pointer;}';

  // Each question maps an answer onto an existing Momentum OS metric slider (1-10) or the morningFocus textarea.
  var QUESTIONS = [
    { q: 'How did you sleep last night?', sub: "Be honest - no one's watching.", target: 'sleepQuality', type: 'cards',
      opts: [ {e:'\uD83D\uDE35',l:'Wrecked',v:2}, {e:'\uD83D\uDE34',l:'Solid 8',v:9}, {e:'\uD83C\uDF19',l:'Light, broken',v:5}, {e:'\u26A1',l:'Barely slept',v:3} ] },
    { q: 'Physical energy - right now?', sub: 'Slide to where you are.', target: 'energy', type: 'slider', left:'Cooked', right:'Firing' },
    { q: "How's your drive lately?", sub: 'Ambition, hunger to do things.', target: 'personalDesire', type: 'cards',
      opts: [ {e:'\uD83D\uDD25',l:'Fired up',v:9}, {e:'\uD83E\uDDED',l:'Steady',v:7}, {e:'\uD83D\uDE10',l:'Flat',v:4}, {e:'\uD83D\uDCA8',l:'Gone',v:2} ] },
    { q: 'Your head, right now.', sub: 'Pick the closest match.', target: 'mood', type: 'cards',
      opts: [ {e:'\uD83C\uDF0A',l:'Clear',v:9}, {e:'\u26F0\uFE0F',l:'Focused',v:8}, {e:'\uD83C\uDF00',l:'Scattered',v:5}, {e:'\uD83C\uDF2B\uFE0F',l:'Foggy',v:3} ] },
    { q: 'Sex & intimacy this week - gut call?', sub: 'One word. Whatever lands first.', target: 'personalConnection', type: 'cards',
      opts: [ {e:'\uD83D\uDD25',l:'Connected',v:9}, {e:'\uD83D\uDE4C',l:'Healthy',v:7}, {e:'\uD83E\uDD75',l:'Tense',v:4}, {e:'\uD83D\uDE36',l:'Absent',v:2} ] },
    { q: 'How clear is your thinking today?', sub: 'Tap a star.', target: 'personalControl', type: 'stars' },
    { q: 'One thing to lock in this week.', sub: 'Pick one. Just one.', target: 'morningFocus', type: 'lock',
      opts: [ {e:'\uD83D\uDEB6',l:'20-min walk daily'}, {e:'\uD83D\uDCD3',l:'Journal 3 lines nightly'}, {e:'\uD83D\uDE34',l:'Lights out by 10'}, {e:'\uD83C\uDFCB\uFE0F',l:'Train / lift 3x'} ] }
  ];

  var NARRATIVE = [
    { tag:'SOUND FAMILIAR?', e:'\uD83C\uDF2B\uFE0F', title:"You're running on fumes more often than you'd admit.", body:"Sleep dips. Drive flatlines. The head gets foggy. You tell yourself you'll reset - and the week rolls on.", list:["Sleep that doesn't fully refill the tank","Drive you'd rather not track out loud","A head that won't quite clear"] },
    { tag:'MEET MOMENTUM', e:'\uD83E\uDDED', title:'Reset. Refocus. Move.', body:'A private space to track what actually matters - and a coach in your pocket that does not sugar-coat it.', list:['Track health, drive, mental clarity','Journal what is actually going on','AI coach that does not sugar-coat it'] },
    { tag:'YOUR MOVE', e:'\uD83D\uDE80', title:'Built for the daily-walk version of you.', body:'What you just answered comes with you. Momentum picks it up and keeps the streak honest.', list:[] }
  ];

  var RECAP_LABELS = { sleepQuality:'Sleep', energy:'Energy', personalDesire:'Drive', mood:'Headspace', personalConnection:'Intimacy', personalControl:'Mental clarity', morningFocus:"This week's lock-in" };

  var answers = {}; // target -> { value, label }
  var step = 0;     // 0..QUESTIONS.length-1 = questions, then narrative, then recap
  var overlay = null;

  function el(html){ var d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }
  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

  function header(label){
    var total = QUESTIONS.length;
    var bars = '';
    for (var i=0;i<total;i++){ bars += '<i class="'+(i<=step?'on':'')+'"></i>'; }
    return '<div class="moci-top"><div class="moci-badge">MO</div><div class="moci-meta"><strong>momentum</strong><span>'+label+'</span></div>'+
      '<div class="moci-ctrls"><button title="Restart" data-act="restart">\u21BA</button><button title="Close" data-act="close">\u2715</button></div></div>'+
      '<div class="moci-bars">'+bars+'</div>';
  }

  function renderQuestion(){
    var Q = QUESTIONS[step];
    var body = '';
    if (Q.type === 'cards' || Q.type === 'lock'){
      var cells = Q.opts.map(function(o){ return '<div class="moci-opt" data-label="'+o.l+'"'+(o.v!=null?' data-val="'+o.v+'"':'')+'><span class="e">'+o.e+'</span><span class="l">'+o.l+'</span></div>'; }).join('');
      body = '<div class="moci-grid">'+cells+'</div>';
    } else if (Q.type === 'slider'){
      body = '<div class="moci-slidewrap"><input type="range" min="0" max="100" value="50" class="moci-range">'+
        '<div class="moci-slidelabels"><span>'+Q.left+'</span><span>'+Q.right+'</span></div>'+
        '<div class="moci-pct"><span class="moci-pctv">50</span>%</div></div>'+
        '<button class="moci-btn moci-sendslider">Send \u2192</button>';
    } else if (Q.type === 'stars'){
      body = '<div class="moci-stars">'+[1,2,3,4,5].map(function(n){return '<span data-n="'+n+'">\u2605</span>';}).join('')+'</div><div class="moci-hint">Tap a star</div>';
    }
    var card = el('<div class="moci-card">'+header('Question '+(step+1)+' of '+QUESTIONS.length)+
      '<div class="moci-q">'+Q.q+'</div><div class="moci-sub">'+Q.sub+'</div>'+body+'</div>');
    wireControls(card);

    if (Q.type === 'cards' || Q.type === 'lock'){
      card.querySelectorAll('.moci-opt').forEach(function(opt){
        opt.addEventListener('click', function(){
          var label = opt.getAttribute('data-label');
          var val = opt.getAttribute('data-val');
          answers[Q.target] = { value: (val!=null? parseInt(val,10) : label), label: label };
          next();
        });
      });
    } else if (Q.type === 'slider'){
      var range = card.querySelector('.moci-range');
      var pctv = card.querySelector('.moci-pctv');
      range.addEventListener('input', function(){ pctv.textContent = range.value; });
      card.querySelector('.moci-sendslider').addEventListener('click', function(){
        var pct = parseInt(range.value,10);
        answers[Q.target] = { value: clamp(Math.round(pct/10),1,10), label: pct+'%' };
        next();
      });
    } else if (Q.type === 'stars'){
      card.querySelectorAll('.moci-stars span').forEach(function(s){
        s.addEventListener('click', function(){
          var n = parseInt(s.getAttribute('data-n'),10);
          answers[Q.target] = { value: clamp(n*2,1,10), label: '\u2605'.repeat(n) };
          next();
        });
      });
    }
    show(card);
  }

  function wireControls(card){
    card.querySelectorAll('.moci-ctrls button').forEach(function(b){
      b.addEventListener('click', function(){
        var act = b.getAttribute('data-act');
        if (act === 'close') closeOverlay();
        else if (act === 'restart'){ answers = {}; step = 0; renderQuestion(); }
      });
    });
  }

  function renderNarrative(){
    var idx = step - QUESTIONS.length;
    var N = NARRATIVE[idx];
    var list = N.list.map(function(t){ return '<div>'+t+'</div>'; }).join('');
    var isLast = idx === NARRATIVE.length - 1;
    var card = el('<div class="moci-card dark">'+
      '<div class="moci-top"><div class="moci-badge">MO</div><div class="moci-meta"><strong>'+N.tag+'</strong><span>'+(idx+1)+' of '+NARRATIVE.length+'</span></div>'+
      '<div class="moci-ctrls"><button data-act="close">\u2715</button></div></div>'+
      '<div style="font-size:2.4rem;margin:10px 0">'+N.e+'</div>'+
      '<div class="moci-narr">'+N.title+'</div><div class="moci-narr-body">'+N.body+'</div>'+
      (list?'<div class="moci-list">'+list+'</div>':'')+
      '<button class="moci-btn moci-adv">'+(isLast?'See your recap \u2192':'Continue \u2192')+'</button></div>');
    wireControls(card);
    card.querySelector('.moci-adv').addEventListener('click', next);
    show(card);
  }

  function renderRecap(){
    var rows = Object.keys(RECAP_LABELS).map(function(k){
      if (!answers[k]) return '';
      return '<div class="moci-recap-row"><span class="k">'+RECAP_LABELS[k]+'</span><span class="v">'+answers[k].label+'</span></div>';
    }).join('');
    var card = el('<div class="moci-card">'+header('Recap')+
      '<div class="moci-q">Here\u2019s your check-in</div><div class="moci-sub">Saved straight into your Morning entry.</div>'+
      '<div style="overflow:auto;margin-top:6px">'+rows+'</div>'+
      '<button class="moci-btn moci-continue">Continue to Momentum \u2192</button>'+
      '<div class="moci-altbtns"><button class="moci-replay">Replay</button></div></div>');
    wireControls(card);
          card.querySelector('.moci-continue').addEventListener('click', function(){ applyAnswers(); try { localStorage.setItem('moci_onboarded','1'); } catch(e){} closeOverlay(); if (window.switchView) window.switchView('dashboard'); });
    card.querySelector('.moci-replay').addEventListener('click', function(){ answers = {}; step = 0; renderQuestion(); });
    show(card);
  }

  function applyAnswers(){
    Object.keys(answers).forEach(function(target){
      var node = document.getElementById(target);
      if (!node) return;
      var a = answers[target];
      if (target === 'morningFocus'){
        node.value = 'Lock-in: ' + a.label;
        node.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        node.value = a.value;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    try { if (typeof window.saveCurrentData === 'function') window.saveCurrentData(); } catch (e) {}
  }

  function show(card){
    if (!overlay){ overlay = el('<div class="moci-overlay"></div>'); document.body.appendChild(overlay); }
    overlay.innerHTML = '';
    overlay.appendChild(card);
  }

  function closeOverlay(){
    if (overlay && overlay.parentNode){ overlay.parentNode.removeChild(overlay); }
    overlay = null;
  }

  function next(){
    step++;
    if (step < QUESTIONS.length){ renderQuestion(); }
    else if (step < QUESTIONS.length + NARRATIVE.length){ renderNarrative(); }
    else { renderRecap(); }
  }

  function start(){ answers = {}; step = 0; renderQuestion(); }

    function injectStyle(){
    if (document.getElementById('moci-style')) return;
    var s = document.createElement('style');
    s.id = 'moci-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

// Inject a 'Check-in' nav link into the existing sidebar, after Dashboard.
  function injectNav(){
    var list = document.querySelector('.nav-list');
    if (!list || document.getElementById('moci-nav')) return;
    var btn = document.createElement('button');
    btn.id = 'moci-nav';
    btn.className = 'nav-link';
    btn.innerHTML = '<div class="nav-dot"></div><div class="nav-copy"><strong>Check-in</strong><span>Daily story check-in</span></div>';
    btn.addEventListener('click', start);
    var dash = list.querySelector('button');
    if (dash && dash.nextSibling){ list.insertBefore(btn, dash.nextSibling); } else { list.appendChild(btn); }
  }

  window.openCheckin = start;
  injectStyle();

  // First-login onboarding flow: landing -> sign up/login -> survey -> dashboard.
  // The survey must ONLY run for an authenticated user who has not onboarded yet.
  // A logged-out visitor sees the landing/login first; the survey never fires pre-auth.
  var ONBOARD_KEY = 'moci_onboarded';

  function alreadyOnboarded(){
    try { return !!localStorage.getItem(ONBOARD_KEY); } catch (e) { return true; }
  }

  // Detect an active Supabase auth session from localStorage (same check the
  // landing page uses). Returns true only when a real access_token is present.
  function hasSession(){
    try {
      for (var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if (k && k.indexOf('supabase') > -1 && k.indexOf('auth') > -1){
          var v = localStorage.getItem(k);
          if (v && v.indexOf('access_token') > -1) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  var onboardStarted = false;
  function tryStartOnboarding(){
    if (onboardStarted) return true;
    if (alreadyOnboarded()) return true;   // returning user -> straight to dashboard
    if (!hasSession()) return false;       // not logged in yet -> wait
    onboardStarted = true;
    start();
    return true;
  }

  // Because login/sign-up completes asynchronously (Supabase onAuthStateChange),
  // a one-time check on load is not enough. Poll briefly for a session appearing
  // right after the user signs up or logs in, then launch the survey. The poll
  // stops as soon as onboarding starts, the user is already onboarded, or after
  // a safety timeout.
  function watchForLogin(){
    if (tryStartOnboarding()) return;
    var attempts = 0;
    var timer = setInterval(function(){
      attempts++;
      if (tryStartOnboarding() || attempts > 600){ clearInterval(timer); }
    }, 500);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', watchForLogin);
  } else {
    watchForLogin();
  }
})();
