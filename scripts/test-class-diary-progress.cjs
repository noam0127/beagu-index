/* Identity-scoped progress client: no real credentials, no production writes. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const progress=require('../js/class-diary-progress-v1.js');
const novel=require('../js/class-diary-semester-v1.js');
const html=fs.readFileSync(path.join(__dirname,'..','teacher-class-diary-play.html'),'utf8');
const server=fs.readFileSync(path.join(__dirname,'..','supabase/functions/class-diary-progress-v1/index.ts'),'utf8');
const guest=fs.readFileSync(path.join(__dirname,'..','supabase/functions/class-diary-guest-access-v1/index.ts'),'utf8');
for(const key of ['id="guestResume"','id="guestResumeBtn"','id="guestNewBtn"',
 'class-diary-progress-v1.js','autoSaveProgress();',"progressSession.load()",
 'result.progressToken',"guestResumeSummary"]){
 assert(html.includes(key),'Missing save UI: '+key);
}
assert(!html.includes('id="guestCode"'),'Guest code must only be entered on home');
assert(!server.includes('identity_code'),'Progress API must never read/store raw codes');
assert(guest.includes("p_code:code"),'Verified identity code must be mapped server-side');
assert(guest.includes('class-diary-progress-v1:'),'Guest and progress endpoints must agree on HMAC purpose');
assert(server.includes('class-diary-progress-v1:'),'Progress signature purpose must match');
assert(server.includes("p_expected_revision:body.expectedRevision"),'Optimistic concurrency is required');
assert(server.includes('if(!data)return reply({error:\'SAVE_CONFLICT\'},409'),'Conflicts must not overwrite other device progress');
const base={schoolName:'가상의 초등학교',
 profile:{name:'새봄',partner:'woman',experience:'mid',gender:'undisclosed',mbti:'INFP'},
 stats:{affection:35,trust:42,agency:42,fatigue:35,voice:45,boundary:48,support:67}};
const beginning=novel.createGame(base);
assert(progress.compatible(beginning));
assert(!progress.compatible({...beginning,version:'forged'}));
const afterChoice=novel.choose(beginning,'1');
const afterAdvance=novel.advance(afterChoice);
let revision=0,saveRequests=[],status=[];
global.fetch=async(url,opts)=>{
 assert(url.endsWith('/class-diary-progress-v1'));
 const body=JSON.parse(opts.body);
 assert(!JSON.stringify(body).includes('BG26-'),'No identity code in save network payload');
 if(body.action==='load')return {ok:true,json:async()=>({ok:true,progress:null})};
 if(body.action==='save'){
  saveRequests.push(body);
  if(body.expectedRevision!==revision)return {ok:false,status:409,json:async()=>({error:'SAVE_CONFLICT'})};
  revision++;
  return {ok:true,json:async()=>({ok:true,revision,updatedAt:'2026-11-20T00:00:00Z'})};
 }
 throw Error('Unexpected action');
};
(async()=>{
 const session=progress.create('p1.abc.xyz',s=>status.push(s));
 assert.equal(await session.load(),null);
 const [one,two]=await Promise.all([session.save(beginning),session.save(afterChoice)]);
 assert.equal(one,true);assert.equal(two,true);
 assert.deepEqual(saveRequests.map(x=>x.expectedRevision),[0,1]);
 assert.equal(session.getRevision(),2);
 assert.equal(saveRequests[1].state.phase,'semester_reflection');
 // Another-device write must stop this session and prevent further overwrites.
 revision=5;
 assert.equal(await session.save(afterAdvance),false);
 assert.equal(session.isBlocked(),true);
 const calls=saveRequests.length;
 assert.equal(await session.save(afterAdvance),false);
 assert.equal(saveRequests.length,calls);
 assert(status.includes('conflict'));
 console.log('PASS class diary progress: shape, front-end wiring, queued revisions, conflicts, no raw code');
})().catch(e=>{console.error(e);process.exitCode=1});
