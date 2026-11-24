"use strict";
const assert=require("node:assert/strict");
const {Pool}=require("pg");
const {createBoundary}=require("./server-boundary.cjs");
const {createPgStore}=require("./pg-store.cjs");
// Explicit loopback-only fixture, never read PGHOST/DATABASE_URL or live credentials.
async function verifyPersistentReplay({policy,verifier,schoolId,capture}){
 if(process.env.RUN4_DISPOSABLE_POSTGRES!=="1")throw Error("fixture_only");
 const pool=new Pool({host:"127.0.0.1",port:54329,user:"service_role",password:"run4_fixture_only",database:"run4_fixture",ssl:false,max:2,connectionTimeoutMillis:3000,statement_timeout:10000});
 const actor={level:1,hash:"d".repeat(64)},sid="55555555-5555-4555-8555-555555555555";
 try{
  const identity=await pool.query("select current_database() as db,current_user as role");
  assert.deepEqual(identity.rows,[{db:"run4_fixture",role:"service_role"}]);
  const store=createPgStore(pool);
  const boundary=createBoundary({policy,authenticate:async c=>c==="fixture-lv1"?actor:c==="other"?{level:1,hash:"e".repeat(64)}:null,
   resolveSchool:async id=>id===schoolId?{eligible:true,difficulty:"easy"}:null,store,replayVerifier:verifier,newId:()=>sid,seed:()=>capture.seed});
  const issued=await boundary.start({credentials:"fixture-lv1",schoolId});
  assert.equal(issued.session,sid);assert.equal(issued.seed,capture.seed);
  const row=await store.get(sid);assert.equal(row.actorHash,actor.hash);assert.equal(row.seed,capture.seed);assert.equal(row.submitted,false);
  // Only in the disposable DB: account for the accelerated 190s browser fixture.
  await pool.query("update public.arcade_run4_sessions_candidate set started_at=clock_timestamp()-interval '191 seconds' where id=$1 and actor_hash=$2",[sid,actor.hash]);
  await assert.rejects(()=>boundary.submit({credentials:"other",sessionId:sid,replay:capture.events}),/session_expired/);
  await assert.rejects(()=>boundary.submit({credentials:"fixture-lv1",sessionId:sid,replay:[{tick:0,action:"leave",choice:20},{tick:60,action:"stop"}]}),/invalid_leave/);
  assert.equal((await store.get(sid)).submitted,false);
  const result=await boundary.submit({credentials:"fixture-lv1",sessionId:sid,replay:capture.events,score:999999,verified:true});
  assert.equal(result.score,capture.result.score);assert.equal(result.retired,true);
  const persisted=await pool.query("select result,verification_status from public.arcade_run4_records_candidate where session_id=$1",[sid]);
  assert.equal(persisted.rowCount,1);assert.equal(persisted.rows[0].verification_status,"verified");assert.deepEqual(persisted.rows[0].result,capture.result);
  assert.equal((await store.get(sid)).submitted,true);
  await assert.rejects(()=>boundary.submit({credentials:"fixture-lv1",sessionId:sid,replay:capture.events}),/session_expired/);
  const list=await pool.query("select * from public.arcade_run4_verified_candidate where score=$1 and difficulty='easy'",[result.score]);
  assert.equal(list.rowCount,1);assert.equal(list.rows[0].boss_count,5);
  for(const key of ["actor_hash","school_id","session_id","result","replay_seed"])assert.ok(!(key in list.rows[0]));
  console.log("PASS RUN4_PERSISTENT_REPLAY "+JSON.stringify({score:result.score,retired:result.retired,bosses:list.rows[0].boss_count,stored:1,db:"disposable-loopback"}));
 }finally{await pool.end();}
}
module.exports={verifyPersistentReplay};
