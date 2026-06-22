/* Momentum OS - Public landing page (pre-auth marketing) */
(function(){
'use strict';
var ACCENT='#6f8f72';
function css(){
if(document.getElementById('mol-style'))return;
var s=document.createElement('style');
s.id='mol-style';
s.textContent=[
'.mol-landing{position:fixed;inset:0;z-index:10000;overflow-y:auto;background:#f6f4ee;color:#2f3a31;font-family:General Sans,sans-serif;}',
'.mol-wrap{max-width:1080px;margin:0 auto;padding:0 24px;}',
'.mol-nav{display:flex;align-items:center;gap:14px;padding:20px 0;}',
'.mol-logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:1.15rem;font-family:Cabinet Grotesk,sans-serif;}',
'.mol-logo .dot{width:30px;height:30px;border-radius:50%;background:#6f8f72;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.8rem;}',
'.mol-nav .spacer{margin-left:auto;}',
'.mol-btn{background:#6f8f72;color:#fff;border:none;border-radius:999px;padding:13px 26px;font-weight:700;cursor:pointer;font-size:.95rem;font-family:inherit;}',
'.mol-btn.ghost{background:transparent;color:#2f3a31;border:1px solid #d8ded3;}',
'.mol-section{padding:60px 0;border-bottom:1px solid #e4ebdd;}',
'.mol-kicker{text-transform:uppercase;letter-spacing:.08em;font-size:.75rem;font-weight:700;color:#6f8f72;margin-bottom:12px;}',
'.mol-h1{font-family:Cabinet Grotesk,sans-serif;font-size:3rem;line-height:1.05;font-weight:800;margin:0 0 18px;}',
'.mol-h2{font-family:Cabinet Grotesk,sans-serif;font-size:2rem;font-weight:800;margin:0 0 28px;}',
'.mol-lead{font-size:1.15rem;color:#5c655d;max-width:620px;margin:0 0 28px;line-height:1.5;}',
'.mol-hero{padding:70px 0 60px;display:flex;flex-direction:column;align-items:flex-start;}',
'.mol-cta-row{display:flex;gap:14px;flex-wrap:wrap;}',
'.mol-grid{display:grid;gap:18px;}',
'.mol-grid.cols-3{grid-template-columns:repeat(3,1fr);}',
'.mol-grid.cols-2{grid-template-columns:repeat(2,1fr);}',
'.mol-card{background:#fff;border:1px solid #e4ebdd;border-radius:18px;padding:24px;}',
'.mol-card .emoji{font-size:1.8rem;display:block;margin-bottom:12px;}',
'.mol-card h3{margin:0 0 8px;font-size:1.1rem;font-weight:700;}',
'.mol-card p{margin:0;color:#5c655d;font-size:.95rem;line-height:1.5;}',
'.mol-step{display:flex;gap:16px;align-items:flex-start;margin-bottom:22px;}',
'.mol-step .num{flex:0 0 auto;width:36px;height:36px;border-radius:50%;background:#6f8f72;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;}',
'.mol-step h3{margin:0 0 4px;font-size:1.05rem;}',
'.mol-step p{margin:0;color:#5c655d;font-size:.95rem;}',
'.mol-price{background:#fff;border:2px solid #e4ebdd;border-radius:18px;padding:26px 22px;text-align:center;position:relative;}',
'.mol-price.feat{border-color:#6f8f72;}',
'.mol-price .tier{font-weight:700;font-size:1.1rem;margin-bottom:6px;}',
'.mol-price .amt{font-size:2.2rem;font-weight:800;}',
'.mol-price .per{color:#6e776f;font-size:.85rem;margin-bottom:16px;}',
'.mol-price ul{list-style:none;padding:0;margin:0 0 20px;text-align:left;}',
'.mol-price li{padding:6px 0;font-size:.9rem;border-bottom:1px solid #eef0ea;}',
'.mol-badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#6f8f72;color:#fff;padding:4px 14px;border-radius:999px;font-size:.72rem;font-weight:700;}',
'.mol-final{text-align:center;padding:70px 0;}',
'.mol-foot{text-align:center;color:#8a938b;font-size:.8rem;padding:28px 0;}',
'@media(max-width:760px){.mol-grid.cols-3,.mol-grid.cols-2{grid-template-columns:1fr;}.mol-h1{font-size:2.2rem;}}'
].join('');
document.head.appendChild(s);
}
function productCards(){
var items=[
['\uD83D\uDCDD','Daily story check-in','A guided, one-tap survey that captures sleep, energy, drive, mood and focus in under a minute.'],
['\u2600\uFE0F','Morning entry','Set energy, focus and readiness for the day - plus a Morning Focus lock-in to commit to one thing.'],
['\uD83C\uDF19','Evening review','Reflect, review and reset at end of day so tomorrow starts clear.'],
['\uD83E\uDDED','AI coach','Personalized guidance that does not sugar-coat it, grounded in your own numbers.'],
['\uD83D\uDCC8','History & trends','Track your day streak and overall momentum score over time with simple charts.'],
['\uD83C\uDFAF','Momentum score','One number that reflects how your week is really going - at a glance.']
];
return items.map(function(it){
return '<div class="mol-card"><span class="emoji">'+it[0]+'</span><h3>'+it[1]+'</h3><p>'+it[2]+'</p></div>';
}).join('');
}
function priceCards(){
var tiers=[
['Free','$0','forever',['Dashboard & momentum score','Morning & evening tracking','Basic journal','7-day history','3 AI coach messages / day'],false],
['Pro','$9','per month',['Everything in Free','Unlimited AI coach','30-day history & trends','Journal analysis','CSV data export'],true],
['Premium','$19','per month',['Everything in Pro','AI coach with memory','Unlimited history & exports','PDF reports','Priority support'],false]
];
return tiers.map(function(t){
var feats=t[3].map(function(f){return '<li>'+f+'</li>';}).join('');
var badge=t[5]?'<span class="mol-badge">Most popular</span>':'';
return '<div class="mol-price'+(t[5]?' feat':'')+'">'+badge+'<div class="tier">'+t[0]+'</div><div class="amt">'+t[1]+'</div><div class="per">'+t[2]+'</div><ul>'+feats+'</ul></div>';
}).join('');
}
function steps(){
var arr=[
['1','Check in','Answer a quick daily story survey - sleep, energy, drive, mood, focus.'],
['2','Track','Your answers feed your dashboard, momentum score and history automatically.'],
['3','Get coached','An AI coach reads your numbers and tells you the next honest move.']
];
return arr.map(function(s){
return '<div class="mol-step"><div class="num">'+s[0]+'</div><div><h3>'+s[1]+'</h3><p>'+s[2]+'</p></div></div>';
}).join('');
}
function enter(){
try{localStorage.setItem('momentum_entered','1');}catch(e){}
var n=document.getElementById('mol-landing');
if(n&&n.parentNode){n.parentNode.removeChild(n);}
document.body.style.overflow='';
}
function render(){
if(document.getElementById('mol-landing'))return;
css();
var root=document.createElement('div');
root.className='mol-landing';
root.id='mol-landing';
var why=[
['\uD83D\uDD12','Private by default','Your data is yours. Track honestly without performing for anyone.'],
['\u26A1','Under a minute','A daily check-in that respects your time and still captures what matters.'],
['\uD83D\uDCAC','No sugar-coating','A coach that gives it to you straight, based on your real numbers.']
].map(function(w){return '<div class="mol-card"><span class="emoji">'+w[0]+'</span><h3>'+w[1]+'</h3><p>'+w[2]+'</p></div>';}).join('');
root.innerHTML=''+
'<div class="mol-wrap">'+
'<div class="mol-nav"><div class="mol-logo"><span class="dot">MO</span> Momentum OS</div><span class="spacer"></span><button class="mol-btn ghost" id="mol-login">Log in</button><button class="mol-btn" id="mol-start">Get started</button></div>'+
'</div>'+
'<div class="mol-wrap"><div class="mol-hero"><div class="mol-kicker">Daily momentum, tracked honestly</div><h1 class="mol-h1">Reset. Refocus. Move.</h1><p class="mol-lead">Momentum OS turns a one-minute daily check-in into a clear picture of your health, drive and mental clarity - with an AI coach that does not sugar-coat it.</p><div class="mol-cta-row"><button class="mol-btn" id="mol-start2">Get started free</button><button class="mol-btn ghost" id="mol-login2">I already have an account</button></div></div></div>'+
'<div class="mol-section"><div class="mol-wrap"><div class="mol-kicker">How it works</div><h2 class="mol-h2">Three steps, every day</h2>'+steps()+'</div></div>'+
'<div class="mol-section"><div class="mol-wrap"><div class="mol-kicker">Why Momentum</div><h2 class="mol-h2">Built for the daily-walk version of you</h2><div class="mol-grid cols-3">'+why+'</div></div></div>'+
'<div class="mol-section"><div class="mol-wrap"><div class="mol-kicker">Product preview</div><h2 class="mol-h2">Everything you get inside</h2><div class="mol-grid cols-3">'+productCards()+'</div></div></div>'+
'<div class="mol-section"><div class="mol-wrap"><div class="mol-kicker">Pricing</div><h2 class="mol-h2">Start free, upgrade when ready</h2><div class="mol-grid cols-3">'+priceCards()+'</div></div></div>'+
'<div class="mol-final"><div class="mol-wrap"><h2 class="mol-h2">Ready to build momentum?</h2><p class="mol-lead" style="margin-left:auto;margin-right:auto;">Create a free account and your first check-in takes under a minute.</p><button class="mol-btn" id="mol-start3">Start free</button></div></div>'+
'<div class="mol-foot">Momentum OS</div>';
document.body.appendChild(root);
document.body.style.overflow='hidden';
['mol-start','mol-start2','mol-start3','mol-login','mol-login2'].forEach(function(id){
var b=document.getElementById(id);
if(b)b.addEventListener('click',enter);
});
}
function hasSession(){
try{
for(var i=0;i<localStorage.length;i++){
var k=localStorage.key(i);
if(k&&k.indexOf('-auth-token')>-1){var v=localStorage.getItem(k);if(v&&v.indexOf('access_token')>-1)return true;}
}
}catch(e){}
return false;
}
function shouldShow(){
try{if(localStorage.getItem('momentum_entered'))return false;}catch(e){return false;}
if(hasSession())return false;
return true;
}
function maybeLanding(){
if(shouldShow())render();
}
window.openLanding=render;
window.dismissLanding=enter;
if(document.readyState==='loading'){
document.addEventListener('DOMContentLoaded',maybeLanding);
}else{
maybeLanding();
}
})();
