import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateWaterwayRun} from '../supabase/functions/_shared/waterway-run-v1.mjs';
const read=p=>fs.readFileSync(p,'utf8');
const gs=read('scripts/beagu-2026-noon-sync.gs');
const api=read('supabase/functions/beagu-2026-results-ingest/index.ts');
const sql=read('supabase/2026-waterway-run-telemetry-v1.sql');
const reports=[],scope={Logger:{log(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})}};
vm.createContext(scope);vm.runInContext(gs,scope);
scope.beagu26SendRunReport=r=>reports.push(JSON.parse(JSON.stringify(r)));
scope.readBeagu2026SourceSnapshot=()=>({values:[],schools:[]});
scope.refreshBeagu2026QuestionResults=()=>({basicReviewRows:0});
scope.refreshBeagu2026Stats=()=>({privateQaStatus:'SENT_1',publishStatus:'PUBLISHED'});
scope.refreshBeagu2026SchoolCulture=()=>{};
scope.refreshBeagu2026AllPrivateStats();
assert.equal(reports[0].stages.every(s=>s.status==='SUCCESS'),true);
// Synthetic empty fixture has no headers, so count remains unknown.
reports[0].source_rows=0;
validateWaterwayRun(reports[0]);
scope.refreshBeagu2026QuestionResults=()=>{throw Error('HTTP 401 secret-private-text');};
assert.throws(()=>scope.refreshBeagu2026AllPrivateStats(),/HTTP 401/);
assert.equal(reports[1].stages[1].reason,'HTTP_401');
assert.equal(reports[1].stages[2].status,'SUCCESS');
assert.ok(!JSON.stringify(reports[1]).includes('secret-private-text'));
validateWaterwayRun(reports[1]);
scope.readBeagu2026SourceSnapshot=()=>{throw Error('원본 오류');};
assert.throws(()=>scope.refreshBeagu2026AllPrivateStats(),/원본 오류/);
assert.equal(reports[2].stages[0].reason,'SOURCE_OR_SCHEMA');
validateWaterwayRun(reports[2]);
for(const change of [x=>x.raw_answer='private',x=>x.stages[1].reason='private',x=>x.stages[0].stage='OTHER',x=>x.source_rows=-1,x=>x.finished_at='2020-01-01']){
 const r=structuredClone(reports[0]);change(r);assert.throws(()=>validateWaterwayRun(r));
}
assert.ok(api.indexOf('if(diff)return send(401')<api.indexOf("parsed?.kind==='WATERWAY_RUN_V1'"));
assert.match(sql,/enable row level security/);
assert.match(sql,/old\.finished_at<excluded\.finished_at/);
assert.match(sql,/revoke all on function public\.beagu_2026_waterway_record_run_v1\(jsonb\) from public,anon,authenticated/);
console.log('PASS: bounded private heartbeat, safe reason codes, failure isolation, authentication and monotonic storage');
