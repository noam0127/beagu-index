import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(path,'utf8');
const sessionSource=read('js/beagu-lv3-session-v1.js');
const widget=read('js/beagu-lv3-school-facts-v1.js');
const search=read('js/level-search.js');
const html=read('search-lv1.html');
const server=read('supabase/functions/beagu-lv3-school-facts-v1/index.ts');
const migration=read('supabase/migrations/20261122004000_beagu_lv3_2026_official_school_facts_v1.sql');
const code='b'.repeat(64);
const lv3='a'.repeat(64);
const schoolId='B123456';
const source2026={status:'verified',referenceYear:2026,school:{
 school_id:schoolId,reference_year:2026,school_name:'가상검증초등학교',
 student_count:120,student_reference_date:'2026-04-01',
 junior_teacher_ratio:14.5,male_teacher_ratio:11.3,
 housing_price_won:125000000,housing_reference_date:'2026-01-01'
}};
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
function harness({schoolStatus=200,schoolBody=source2026}={}){
 const calls=[];
 let revoked=false;
 let authHandlers=[];
 const client={auth:{
  getSession:async()=>({data:{session:{access_token:'mock-jwt',
   user:{email_confirmed_at:'2026-01-01',is_anonymous:false}}},error:null}),
  onAuthStateChange:handler=>{authHandlers.push(handler);}
 }};
 const ctx={
  window:{},
  sessionStorage:{getItem:()=>code},
  console,
  fetch:async()=>{throw Error('No implicit external fetch allowed');}
 };
 vm.runInNewContext(sessionSource,ctx);
 const request=async(endpoint,init)=>{
  const action=JSON.parse(init.body).action;
  calls.push({endpoint,action,headers:init.headers,cache:init.cache,referrerPolicy:init.referrerPolicy,body:JSON.parse(init.body)});
  if(endpoint.endsWith('/beagu-lv3-school-facts-v1'))
   return response(schoolBody,schoolStatus);
  if(action==='issue')return response({ok:true,level:3,token:lv3});
  if(action==='verify')return revoked
   ?response({ok:false,level:2,verified:false},403)
   :response({ok:true,level:3,verified:true});
  return response({ok:false},400);
 };
 const session=ctx.window.BeaguLv3Session.create({
  client,levelToken:()=>code,request
 });
 return {session,calls,ctx,client,logout:()=>authHandlers.forEach(f=>f('SIGNED_OUT')),
  revoke:()=>{revoked=true}};
}

test('24: signed-in Lv2 without a server-issued Lv3 token cannot request official school facts',async()=>{
 const h=harness();
 await assert.rejects(()=>h.session.schoolFacts(schoolId),/LV3_NOT_VERIFIED/);
 assert.equal(h.calls.filter(x=>x.endpoint.endsWith('/beagu-lv3-school-facts-v1')).length,0);
 assert.deepEqual(Object.keys(h.session.getState()).sort(),['level','verified']);
});

test('24: a server-verified Lv3 token accesses only the exact school over no-store POST',async()=>{
 const h=harness();
 assert.equal(await h.session.issue(),true);
 const item=await h.session.schoolFacts(schoolId);
 assert.equal(item.status,'verified');
 assert.equal(item.school.reference_year,2026);
 const facts=h.calls.filter(x=>x.endpoint.endsWith('/beagu-lv3-school-facts-v1'));
 assert.equal(facts.length,1);
 assert.equal(facts[0].body.schoolId,schoolId);
 assert.equal(facts[0].body.action,'school');
 assert.equal(facts[0].headers['X-Beagu-Level-Session'],code);
 assert.equal(facts[0].headers['X-Beagu-Lv3-Token'],lv3);
 assert.equal(facts[0].headers.Authorization,'Bearer mock-jwt');
 assert.equal(facts[0].cache,'no-store');
 assert.equal(facts[0].referrerPolicy,'no-referrer');
 assert.equal(JSON.stringify(h.session.getState()).includes(lv3),false);
 await assert.rejects(()=>h.session.schoolFacts('B123456?'),/INVALID_SCHOOL_ID/);
 assert.equal(h.calls.filter(x=>x.endpoint.endsWith('/beagu-lv3-school-facts-v1')).length,1);
});

test('24: server 403 revokes local Lv3 session and forbids stale facts',async()=>{
 const h=harness({schoolStatus:403,schoolBody:{error:'LV3_REQUIRED'}});
 assert.equal(await h.session.issue(),true);
 await assert.rejects(()=>h.session.schoolFacts(schoolId),/LV3_REVOKED/);
 assert.equal(h.session.getState().verified,false);
 assert.equal(h.session.getState().level,null);
});

test('24: invalid 2026 evidence or mismatched school must fail closed',async()=>{
 const cases=[
  {status:'verified',referenceYear:2025,school:{school_id:schoolId,reference_year:2026}},
  {status:'verified',referenceYear:2026,school:{school_id:'B765432',reference_year:2026}},
  {status:'verified',referenceYear:2026,school:{school_id:schoolId,reference_year:2025}}
 ];
 for(const invalid of cases){
  const h=harness({schoolBody:invalid});
  assert.equal(await h.session.issue(),true);
  await assert.rejects(()=>h.session.schoolFacts(schoolId),/UNVERIFIED_SOURCE|MISMATCHED_SCHOOL/);
 }
});

test('24: browser module is opt-in and never exposes raw source, secrets or 2025 facts as 2026',()=>{
 assert.doesNotThrow(()=>new vm.Script(sessionSource));
 assert.doesNotThrow(()=>new vm.Script(widget));
 assert.match(widget,/if\(!await session\.issue\(\)\)throw Error\('LV3_NOT_AVAILABLE'\)/);
 assert.match(widget,/const result=await session\.schoolFacts\(entry\.schoolId\)/);
 assert.match(widget,/getTier\(\)<2/);
 assert.match(widget,/textContent=String\(value\)/);
 assert.match(widget,/if\(result\.status==='not_verified'\|\|!result\.school\)/);
 assert.match(widget,/이전 연도 값으로 대체하지 않습니다/);
 assert.match(widget,/visibilitychange/);
 assert.match(widget,/SIGNED_OUT/);
 assert.match(widget,/TOKEN_REFRESHED/);
 assert.doesNotMatch(widget,/localStorage\.setItem|sessionStorage\.setItem|innerHTML\s*=|service_role|SUPABASE_SERVICE_ROLE_KEY|source_digest|reviewer_user_id|approval_evidence/);
 assert.doesNotMatch(sessionSource,/localStorage\.setItem|sessionStorage\.setItem|document\.cookie|location\.search\s*=/);
 for(const column of ['student_count','junior_teacher_ratio','male_teacher_ratio','housing_price_won'])
  assert.ok(widget.includes('item.'+column));
 assert.doesNotMatch(widget,/item\.beagu_percentile_2025|item\.view_count/);
});

test('24: legacy school search is preserved, only Lv2 may attach a new independent Lv3 disclosure',()=>{
 assert.match(search,/window\.BeaguLv3SchoolFacts\?\.clear\(\)/);
 assert.match(search,/window\.BeaguLv3SchoolFacts\?\.attachCard\(card,school,\(\)=>verifiedTier\)/);
 assert.match(widget,/function attachCard\(card,school,getTier\)/);
 assert.match(widget,/getTier\(\)<2\)return;/);
 const scripts=[
  'js/supabase-config.js',
  'js/beagu-lv3-session-v1.js',
  'js/beagu-lv3-school-facts-v1.js',
  'js/level-search.js'
 ];
 const locations=scripts.map(s=>html.indexOf('src="'+s));
 assert.ok(locations.every(n=>n>=0));
 assert.deepEqual(locations,[...locations].sort((a,b)=>a-b));
 assert.match(html,/styles\/beagu-lv3-school-facts-v1\.css/);
 assert.match(search,/api\('ranked_schools'/);
 assert.match(search,/showDetails\(detail,data\.rows/);
});

test('24: backend continues to enforce 2026 verified source and active Auth+Lv2+Lv3',()=>{
 assert.match(server,/db\.auth\.getUser\(jwt\[1\]\)/);
 assert.match(server,/beagu_member_live_session_v1/);
 assert.match(server,/beagu_2026_verified_visitor_level_v1/);
 assert.match(server,/beagu_lv3_verify_session_v1/);
 assert.match(server,/if\(!await currentLv3\(req\)\.catch\(\(\)=>false\)\)/);
 assert.match(server,/return reply\(origin,200,\{status:"not_verified",referenceYear:2026,school:null\}\)/);
 assert.match(server,/const columns="school_id,school_name/);
 assert.doesNotMatch(server,/select\('\*'\)|select\("\*"\)|reviewer_user_id|approval_evidence/);
 assert.match(migration,/f\.review_status='APPROVED'/);
 assert.match(migration,/f\.personal_data_reviewed/);
 assert.match(migration,/f\.reidentification_reviewed/);
 assert.match(migration,/gate\.singleton and gate\.enabled/);
 assert.match(migration,/revoke all on public\.beagu_lv3_2026_school_facts_v1\s+from public,anon,authenticated/);
});
