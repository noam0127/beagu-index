const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const read=path=>fs.readFileSync(path,'utf8');
const js=read('js/beagu-referral-form-v1.js');
const sql=read('supabase/migrations/20261121093000_referral_funnel_private_v1.sql');
const checkin=read('supabase/functions/beagu-referral-checkin-v1/index.ts');
const admin=read('supabase/functions/beagu-admin-dashboard-v1/index.ts');
const dashboard=read('admin.html');
const adminJs=read('js/beagu-admin-access-v1.js');
for(const [file,source] of [['referral form',js],['admin frontend',adminJs]]){
  assert.doesNotThrow(()=>new vm.Script(source,{filename:file}),file+' JS syntax');
}
assert.match(sql,/enable row level security/);
assert.match(sql,/revoke all on beagu_private\.challenge_referral_funnel_events from public, anon, authenticated/);
assert.match(sql,/revoke all on function public\.beagu_admin_referral_funnel_v1\(text\) from public,anon,authenticated/);
assert.match(sql,/stage in \('open','proof','handoff'\)/);
assert.match(sql,/on conflict do nothing/,'per-browser/day idempotency');
assert.match(sql,/interval '31 days'/,'privacy retention');
assert.doesNotMatch(sql,/\b(user_agent|ip_address|email|school_answers)\s+(text|varchar|jsonb)\b/i,'no sensitive data columns');
assert.match(checkin,/beagu_referral_funnel_record_v1/);
assert.match(checkin,/BEAGU_REFERRAL_FUNNEL_BROWSER_V1/);
assert.match(checkin,/body\.action==='handoff'/);
assert.match(checkin,/BEAGU_REFERRAL_CHECKIN_V1\|/);
assert.ok(admin.indexOf("claims.aal!==\"aal2\"") < admin.indexOf("beagu_admin_referral_funnel_v1"),
  'MFA must be verified before the analytics RPC');
assert.ok(admin.indexOf("beagu_admin_active_mfa_session") < admin.indexOf("beagu_admin_referral_funnel_v1"),
  'live session must be checked before exposing any funnel counts');
assert.match(dashboard,/id="adminReferralFunnelRows"/);
assert.match(adminJs,/renderReferralFunnel\(data\.referral_funnel\)/);

async function test(){
 const proof='BR1.'+'a'.repeat(64)+'.ab8afb27-c498-42c1-8df6-064b6b8102a4.1795248000.'+'b'.repeat(64);
 for(const [path,search,hash] of [
   ['/r/','','#iQbnIaqI'],
   ['/survey.html','?ref='+'a'.repeat(64),'']
 ]){
   const calls=[],beacons=[],redirects=[];
   vm.runInNewContext(js,{
     window:{BEAGU_REFERRAL_FORM_CONFIG:{
       entryName:'entry.2096012680',
       formUrl:'https://docs.google.com/forms/d/e/FORM/viewform'}},
     document:{getElementById:()=>null,documentElement:{classList:{remove:()=>{}}}},
     location:{pathname:path,search,hash,replace:url=>redirects.push(url)},
     URLSearchParams,URL,Blob,navigator:{sendBeacon:(url,blob)=>{beacons.push({url,blob});return true;}},
     crypto:crypto.webcrypto,localStorage:{getItem:()=>null,setItem:()=>{}},
     fetch:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {
       ok:true,json:async()=>({proof})
     };}
   },{filename:path});
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal(calls.length,1,'only one signed check-in request');
   assert.equal(calls[0].body.action,'checkin');
   assert.equal(redirects.length,1,'auto navigation');
   const target=new URL(redirects[0]);
   assert.equal(target.hostname,'docs.google.com');
   assert.equal(target.searchParams.get('entry.2096012680'),proof);
   assert.equal(beacons.length,1,'handoff is attempted before navigation');
   const handoff=JSON.parse(await beacons[0].blob.text());
   assert.equal(handoff.action,'handoff');
   assert.equal(handoff.proof,proof);
 }
 console.log('PASS: private referral funnel schema, MFA-only admin access, auto-redirect and signed handoff');
}
test().catch(error=>{console.error(error);process.exitCode=1;});
