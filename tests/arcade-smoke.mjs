import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const base="https://baeguindex.com";
const api="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard";
const origin={"Origin":base,"Content-Type":"application/json"};
const html=await readFile("index.html","utf8");
const volley=await readFile("teacher-volleyball.html","utf8");
const runner=await readFile("teacher-run.html","utf8");
const shared=await readFile("js/arcade-leaderboard-v1.js","utf8");
const picker=await readFile("js/arcade-school-picker-v1.js","utf8");
for(const h of [volley,runner]){
 const inline=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
 assert.equal(inline.length,1,"expected one inline game script");
 new Function(inline[0]);
}
new Function(shared);
new Function(picker);
assert.match(volley,/new window\.ArcadeSchoolPicker/);
assert.match(runner,/new window\.ArcadeSchoolPicker/);
assert.match(runner,/difficultyScale=\{easy/);
assert.match(volley,/diffScale=\{easy/);
assert.match(shared,/arcade-rank-school/);
assert.ok(html.indexOf('id="teacher-game-frame"')<html.indexOf('id="teacher-run-frame"'));
assert.match(volley,/SPEED_MULTIPLIER=2/);
assert.match(volley,/AUTO_SPIKE_SPEED=8/,"automatic spike requires fast movement");
assert.match(volley,/impactSpeed >= AUTO_SPIKE_SPEED/,"contact fires automatic spike");
assert.doesNotMatch(volley,/data-key="spike"/,"separate spike button removed");
assert.doesNotMatch(volley,/keys\.spike/,"manual spike input removed");

assert.match(volley,/R = 48;/,"volleyball radius enlarged 1.5x from 32 to 48");
assert.match(volley,/NET_TOP = 354/,"net height reduced from 146 to 97");
assert.match(volley,/43 \* \.75 : 42 \* \.75/,"player contact reach reduced to 3/4");
assert.doesNotMatch(volley,/data-key="jump"/,"touch jump button removed");
assert.doesNotMatch(volley,/class="touch"/,"empty touch control region removed");
assert.match(volley,/touchControl\.targetY/,"volleyball touch flight has vertical axis");
assert.match(volley,/flyingStep|flightStep/,"volleyball flight movement is implemented");
assert.match(runner,/pointerY=target\.y/,"survival game tracks 2D touch target");
assert.match(runner,/player\.y\+=Math\.sign\(dy\)/,"survival game flies vertically");
assert.match(volley,/ranking\?\.finish/);
assert.match(runner,/ranking\?\.finish/);
console.log("PASS: home order, game scripts, score hooks, 2x controls");

const timeout=(ms=12000)=>AbortSignal.timeout(ms);
async function requestWithRetry(url,expected=200,options={},times=3){
 for(let i=0;i<times;i++){
  try{
   const r=await fetch(url,{...options,signal:timeout()});
   const body=await r.text();
   if(r.status===expected)return {response:r,body};
   if(i===times-1)throw new Error(url+" -> HTTP "+r.status+": "+body.slice(0,220));
  }catch(e){
   if(i===times-1)throw e;
  }
  await new Promise(resolve=>setTimeout(resolve,2500));
 }
}
// Pages deployment and the smoke workflow run in parallel: poll until the
// published home matches this commit instead of failing on the previous build.
async function waitForPublishedHome() {
 for(let attempt=0;attempt<20;attempt++){
  const site=await requestWithRetry(base+"/",200,{},3);
  if(site.body.includes("teacher-volleyball.html?v=20261118-school-tier1")&&
     site.body.includes("teacher-run.html?v=20261118-school-tier1"))return site;
  await new Promise(resolve=>setTimeout(resolve,8000));
 }
 throw new Error("Published game iframe versions did not update");
}
const [site,topVolley,topRun]=await Promise.all([
 waitForPublishedHome(),
 requestWithRetry(api+"?game=volleyball",200,{headers:origin}),
 requestWithRetry(api+"?game=teacher_run",200,{headers:origin})
]);
assert.match(site.body,/teacher-volleyball\.html\?v=20261118-school-tier1/);
assert.match(site.body,/teacher-run\.html\?v=20261118-school-tier1/);
for(const response of [topVolley,topRun]){
 const parsed=JSON.parse(response.body);
 assert.ok(Array.isArray(parsed.top10));
 assert.ok(parsed.top10.length<=10);
 for(const row of parsed.top10){
  assert.match(row.nickname,/^[A-Z]{2,8}$/);
  assert.ok(Number.isInteger(row.score)&&row.score>0);
 }
}
console.log("PASS: deployed home and live shared Top 10 for both games");

// Public school search returns canonical name and region, but never raw percentiles.
const searched=await requestWithRetry(api+"?schools="+encodeURIComponent("거제"),200,{headers:origin});
const schools=JSON.parse(searched.body).schools;
assert.ok(schools.length>0,"school search must return real elementary schools");
assert.ok(schools.every(s=>typeof s.school_id==="string" && typeof s.school_name==="string"));
const canonical=schools[0];
const lookup=await requestWithRetry(api+"?school_id="+encodeURIComponent(canonical.school_id),200,{headers:origin});
const school=JSON.parse(lookup.body).school;
assert.equal(school.school_name,canonical.school_name);
assert.ok(["easy","normal","hard"].includes(school.difficulty));
assert.equal("national_percentile" in school,false,"never return raw school survey percentile");
console.log("PASS: canonical school search and 3-tier difficulty (no raw percentile)");

const start=await requestWithRetry(api,200,{
 method:"POST",headers:origin,body:JSON.stringify({action:"start",game:"volleyball",school_id:school.school_id})
});
const started=JSON.parse(start.body);
const session=started.session;
assert.equal(started.school.school_id,school.school_id);
assert.equal(started.school.difficulty,school.difficulty);
assert.match(session,/^[0-9a-f-]{36}$/i);
const invalid=await requestWithRetry(api,400,{
 method:"POST",headers:origin,
 body:JSON.stringify({action:"submit",game:"volleyball",session,nickname:"123",stats:{player:7,cpu:0,spikes:0}})
});
assert.equal(JSON.parse(invalid.body).error,"invalid_name");
console.log("PASS: server binds canonical school to session and rejects non-English nickname");
