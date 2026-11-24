const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {createBoundary}=require("./server-boundary.cjs");
const w={};vm.runInNewContext(fs.readFileSync("js/teacher-run-4-records-v1.js","utf8"),{window:w});
const policy=w.BeaguRun4Records;
(async()=>{
 const actor={level:1,hash:"a".repeat(64)},id="11111111-1111-4111-8111-111111111111";
 let time=0,session=null,stored=null;
 const opts={policy,authenticate:async c=>c,resolveSchool:async()=>({eligible:true,difficulty:"normal"}),now:()=>time,newId:()=>id,seed:()=>42,
 store:{createIfBelowLimit:async s=>{session=s;return true;},get:async()=>session,insertVerifiedOnce:async(s,r)=>{if(stored)return false;stored=r;return true;}}};
 const offline=createBoundary(opts);await assert.rejects(()=>offline.start({credentials:actor,schoolId:"1234567"}),/verification_unavailable/);assert.equal(session,null);
 const calculated={version:"4.0",game:policy.game,difficulty:"normal",baseScore:1000,score:3000,survivalSeconds:190,age:62,victory:true,bossIds:["confusion"],maxCombo:10,hits:2,crises:1,leaveDays:3,allies:2};
 // Stub ONLY to test the boundary; not evidence of a real server simulator.
 const api=createBoundary({...opts,replayVerifier:async()=>calculated});
 await assert.rejects(()=>api.start({credentials:{...actor,level:0},schoolId:"1234567"}),/unauthorized/);
 await assert.rejects(()=>api.start({credentials:{...actor,admin:true},schoolId:"1234567"}),/admin_excluded/);
 const start=await api.start({credentials:actor,schoolId:"1234567"});assert.equal(start.seed,42);
 const payload={credentials:actor,sessionId:id,replay:[{tick:0,action:"move",x:.5,y:1},{tick:11400,action:"end"}]};
 time=190000;
 await assert.rejects(()=>api.submit({...payload,credentials:{...actor,hash:"b".repeat(64)}}),/session_expired/);
 await assert.rejects(()=>api.submit({...payload,replay:[{tick:0,action:"move",x:2,y:0}]}),/invalid_replay/);
 await assert.rejects(()=>api.submit({...payload,replay:[{tick:0,action:"move",x:0,y:0,score:99999}]}),/invalid_replay/);
 const result=await api.submit({...payload,score:999999,verified:true});
 assert.equal(result.score,3000);assert.equal(stored.score,3000);
 await assert.rejects(()=>api.submit(payload),/session_expired/);
 console.log("PASS staged 4.0 server boundary, default denial, level/admin/session checks, invalid input and duplicate rejection; verifier stub only");
})().catch(e=>{console.error(e);process.exitCode=1});
