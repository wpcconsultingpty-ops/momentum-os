import test from 'node:test';
import assert from 'node:assert/strict';
import '../momentum-scores.js';
process.env.OPENAI_API_KEY='unit-test-placeholder-no-network';
const { buildContext, buildChatUserPrompt }=await import('../api/coach.js');
const { summariseWeek, rowToEntry }=await import('../api/_lib/brief.js');
const S=globalThis.MomentumScores;
const morning={sleepQuality:5,energy:5,mood:5,stress:5};
const evening={disciplineAnswer:'yes',controlAnswer:'intentional',exerciseAnswer:'light',nutritionAnswer:'on'};
const today=new Date(2026,9,30,12);
test('empty history is unknown, not a default performance score',()=>{
  const s=S.summary([],today);assert.equal(s.readiness,null);assert.equal(s.followThrough,null);assert.equal(s.consistency.completed,0);assert.equal(s.consistency.total,14);
});
test('readiness has no floor, equal weighting and correct endpoints',()=>{
  assert.equal(S.readiness(morning),50);
  assert.equal(S.readiness({sleepQuality:0,energy:0,mood:0,stress:10}),0);
  assert.equal(S.readiness({sleepQuality:10,energy:10,mood:10,stress:0}),100);
  assert.equal(S.readiness({...morning,stress:1}),60);
});
test('missing and malformed values remain unknown; zero is valid',()=>{
  for(const value of [null,undefined,'', ' ',NaN,11,-1,true]) assert.equal(S.readiness({...morning,stress:value}),null);
  assert.equal(S.readiness({...morning,stress:0}),63);
});
test('hydration, motivation and streak do not influence readiness',()=>{
  assert.equal(S.readiness({...morning,hydration:10,desire:10,streak:100}),50);
});
test('follow-through weighting is 40/20/20/20',()=>{
  assert.equal(S.followThrough(evening),100);
  assert.equal(S.followThrough({...evening,disciplineAnswer:'no'}),60);
  for(const [field,value] of [['controlAnswer','reactive'],['exerciseAnswer','none'],['nutritionAnswer','off']]) assert.equal(S.followThrough({...evening,[field]:value}),80);
  assert.equal(S.followThrough({...evening,disciplineAnswer:'partly',controlAnswer:'mixed',nutritionAnswer:'mixed'}),60);
});
test('motivation and readiness are not behaviour penalties',()=>{
  assert.equal(S.followThrough({...evening,desire:0,desireAnswer:'low',energy:0,mood:0}),100);
});
test('planned recovery and light movement receive full movement credit',()=>{
  for(const value of ['trained','light','rest']) assert.equal(S.followThrough({...evening,exerciseAnswer:value}),100);
});
test('legacy numeric ratings count completion without invented categories',()=>{
  const legacy={desire:4,discipline:8,control:6,exercise:7,nutrition:8};
  assert.equal(S.followThrough(legacy),null);assert.equal(S.eveningComplete(legacy),true);
});
test('saved JSONB categories reproduce the same score on the server',()=>{
  assert.equal(S.followThrough({eveningReview:{answers:evening}}),100);
});
test('missing/unknown categories do not create partial scores',()=>{
  assert.equal(S.followThrough({...evening,controlAnswer:null}),null);
  assert.equal(S.followThrough({...evening,exerciseAnswer:'invented'}),null);
});
test('only the current day supplies the two daily rings',()=>{
  const s=S.summary([{date:'2026-10-29',...morning,...evening}],today);
  assert.equal(s.readiness,null);assert.equal(s.followThrough,null);assert.equal(s.consistency.completed,2);
});
test('journal-only or body-only entries do not count check-ins',()=>{
  const s=S.summary([{date:'2026-10-30',journalNote:'hello',weightKg:80,healthScore:80,personalScore:70}],today);
  assert.equal(s.consistency.completed,0);assert.equal(s.readiness,null);
});
test('duplicates count once; fragments merge; dates stay local',()=>{
  const s=S.summary([{date:'2026-10-30',...morning},{date:'2026-10-30',...evening}],today);
  assert.equal(s.readiness,50);assert.equal(s.followThrough,100);assert.equal(s.consistency.completed,2);
  assert.equal(S.key('2026-10-30'),'2026-10-30');
});
test('rolling seven-day window excludes old and future entries',()=>{
  const es=[];for(let i=-1;i<9;i++){const d=new Date(today);d.setDate(d.getDate()-i);es.push({date:d.toISOString(),...morning,...evening});}
  const s=S.summary(es,today);assert.equal(s.consistency.completed,14);assert.equal(s.consistency.percent,100);assert.equal(s.consistency.days.length,7);
});
test('model never mutates original ratings or stored scores',()=>{
  const e={date:'2026-10-30',...morning,...evening,healthScore:80,personalScore:90,overallScore:85};const before=JSON.stringify(e);
  S.summary([e],today);assert.equal(JSON.stringify(e),before);
});
test('Coach preserves missing as null and keeps the measures separate',()=>{
  const context=buildContext({overallScore:null,healthScore:null,personalScore:null,capacity:null,ringScores:S.summary([],today)});
  assert.equal(context.overallScore,null);assert.equal(context.capacity,null);assert.equal(context.ringScores.readiness,null);
  assert.match(buildChatUserPrompt(context),/never an overall grade/);
});
test('weekly summary uses persisted categories rather than legacy numeric scales',()=>{
  const e=rowToEntry({entry_date:'2026-10-30',sleep_quality:5,energy:5,mood:5,stress:5,evening_review:{answers:evening}});
  const s=summariseWeek([e],null,'2026-11-01');
  assert.equal(s.ringMeasures.days[0].readiness,50);assert.equal(s.ringMeasures.days[0].followThrough,100);
});
