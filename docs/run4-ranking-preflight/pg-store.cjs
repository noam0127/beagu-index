"use strict";
// Review-only adapter. A trusted server provides a service-only PostgreSQL pool.
// No client credentials, no environment auto-connect, no production URL.
function createPgStore(pool){
 if(!pool||typeof pool.query!=="function")throw Error("invalid_store");
 return Object.freeze({
  async createIfBelowLimit(s,limit){
   if(limit.windowMs!==900000||limit.max!==40)throw Error("unsupported_limit");
   const r=await pool.query("select run4_internal_candidate.start_session($1,$2,$3,$4,$5,$6) as ok",[s.id,s.actorHash,s.schoolId,s.difficulty,s.seed,new Date(s.startedAt)]);return r.rows[0]?.ok===true;
  },
  async get(id){
   const r=await pool.query("select s.id,s.rules_version as version,s.actor_hash as actor_hash,s.school_id,s.difficulty,s.started_at,s.replay_seed,exists(select 1 from public.arcade_run4_records_candidate r where r.session_id=s.id) as submitted from public.arcade_run4_sessions_candidate s where s.id=$1 and s.replay_seed is not null",[id]);
   const s=r.rows[0];if(!s)return null;return {id:s.id,version:s.version,actorHash:s.actor_hash,schoolId:s.school_id,difficulty:s.difficulty,startedAt:new Date(s.started_at).getTime(),seed:Number(s.replay_seed),submitted:s.submitted};
  },
  async insertVerifiedOnce(s,result){
   const r=await pool.query("select run4_internal_candidate.save_verified($1,$2,$3::jsonb) as ok",[s.id,s.actorHash,JSON.stringify(result)]);return r.rows[0]?.ok===true;
  }
 });
}
module.exports={createPgStore};
