// Bounded aggregate-only heartbeat. No individual answers, identifiers or raw errors.
const stages=['SOURCE','QUESTION_RESULTS','CORE_AND_QA','SCHOOL_CULTURE'];
const reasons=['NONE','AUTH_CONFIG','HTTP_401','HTTP_403','HTTP_409','HTTP_429','HTTP_5XX','HTTP_OTHER','SOURCE_OR_SCHEMA','LOCK_BUSY','PARTIAL_SYNC','STAGE_ERROR','NOT_INSTALLED'];
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===keys.slice().sort().join('|');
const count=n=>n===null||(Number.isSafeInteger(n)&&n>=0&&n<=50000);
export function validateWaterwayRun(x,now=Date.now()){
 if(!exact(x,['kind','started_at','finished_at','source_rows','basic_review_rows','stages'])||x.kind!=='WATERWAY_RUN_V1'||
   !count(x.source_rows)||!count(x.basic_review_rows)||x.basic_review_rows!==null&&(x.source_rows===null||x.basic_review_rows>x.source_rows)||
   !Array.isArray(x.stages)||x.stages.length!==4)throw Error('INVALID_RUN');
 const start=Date.parse(x.started_at),end=Date.parse(x.finished_at);
 if(typeof x.started_at!=='string'||typeof x.finished_at!=='string'||!Number.isFinite(start)||!Number.isFinite(end)||start>end||end-start>30*60000||Math.abs(now-end)>30*60000)throw Error('INVALID_RUN_TIME');
 x.stages.forEach((s,i)=>{
  if(!exact(s,['stage','status','reason','duration_ms'])||s.stage!==stages[i]||
   !['SUCCESS','ERROR','SKIPPED'].includes(s.status)||!reasons.includes(s.reason)||
   !Number.isSafeInteger(s.duration_ms)||s.duration_ms<0||s.duration_ms>30*60000||
   (s.status==='SUCCESS')!==(s.reason==='NONE'))throw Error('INVALID_STAGE');
 });
 if(x.stages[0].status!=='SUCCESS'&&(x.source_rows!==null||x.basic_review_rows!==null||x.stages.slice(1).some(s=>s.status!=='SKIPPED')))throw Error('INVALID_SOURCE_STATE');
 return x;
}
