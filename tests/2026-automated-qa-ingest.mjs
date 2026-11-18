import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(path,'utf8');
const app=read('scripts/beagu-2026-noon-sync.gs');
const handler=read('supabase/functions/beagu-2026-private-qa-ingest/index.ts');
const schema=read('supabase/migrations/20261119_2026_private_automated_review.sql');
const ingestSchema=read('supabase/migrations/20261119_2026_qa_ingest_staging.sql');
const ctx={Date,Map,Set,Number,Object,Array,String,Math,RegExp,JSON,Error};
runInNewContext(app,ctx,{timeout:2500,filename:'beagu-2026-noon-sync.gs'});
assert.match(app,/sendBeagu2026PrivateQaChecks\(groups\)/);
assert.match(app,/privateQaStatus=sendBeagu2026PrivateQaChecks\(groups\)/);
assert.match(app,/X-Beagu-Ingest-Token/);
assert.match(app,/core_valid_counts:Object\.fromEntries\(g\.counts\.map/);
assert.doesNotMatch(app,/JSON\.stringify\(\{[^}]*teacher_name/);
assert.match(handler,/BEAGU_2026_INGEST_TOKEN/);
assert.match(handler,/digest\(supplied\),await digest\(expected\)/);
assert.match(handler,/items\.length>60/);
assert.match(handler,/core_valid_counts:Object\.fromEntries\(qids\.map/);
assert.match(handler,/\.from\('beagu_2026_qa_ingest_staging'\)/);
assert.doesNotMatch(handler,/\.from\('beagu_release_metrics_v2'\)/);
assert.doesNotMatch(handler,/APPROVED/);
assert.match(schema,/beagu_2026_auto_review_status/);
assert.match(schema,/publication_status text NOT NULL DEFAULT 'WITHHELD'/);
assert.match(schema,/PUBLICATION_CONSENT_EVIDENCE_NOT_CONNECTED/);
assert.match(schema,/SMALL_CELL_REIDENTIFICATION_RISK/);
assert.match(schema,/cron\.schedule\(/);
assert.match(ingestSchema,/REVOKE ALL ON public\.beagu_2026_qa_ingest_staging FROM PUBLIC,anon,authenticated/);
assert.match(ingestSchema,/ENABLE ROW LEVEL SECURITY/);
assert.match(ingestSchema,/beagu_private\.sync_2026_qa_ingest_to_private/);
assert.match(ingestSchema,/publication_status='WITHHELD'/);
const fakeGroup={
 school:{school_id:'7331195'},rows:2,typeConflict:true,
 counts:Array.from({length:13},(_,i)=>i===0?1:2)
};
const requests=[];
const source={
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'x'.repeat(40)})},
 UrlFetchApp:{fetch:(url,options)=>{
   requests.push({url,options});
   return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,accepted:1})};
 }}
};
const scriptScope={...ctx,...source};
runInNewContext(app,scriptScope,{timeout:2500});
assert.equal(scriptScope.sendBeagu2026PrivateQaChecks(new Map([['7331195',fakeGroup]])),'SENT_1');
const posted=JSON.parse(requests[0].options.payload);
assert.equal(posted.schools[0].school_match_status,'NEEDS_REVIEW');
assert.equal(posted.schools[0].core_valid_counts.Q01,1);
assert.equal(posted.schools[0].core_valid_counts.Q13,2);
assert.equal(posted.schools[0].school_response_rows,2);
assert.equal(Object.keys(posted.schools[0]).length,4);
console.log('PASS: 2026 aggregate-only ingest, recurring private QA, no public release or raw response');
