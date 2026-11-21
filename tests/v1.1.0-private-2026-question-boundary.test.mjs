import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {catalog} from '../supabase/functions/_shared/questionnaire-2026.mjs';
import {
  isPublic2026QuestionId,isPublic2026MetricKey
} from '../supabase/functions/_shared/2026-public-question-policy.mjs';
import {publicQuestionResults} from '../supabase/functions/_shared/results-2026.mjs';
import {releaseMetrics} from '../supabase/functions/_shared/release-policy.mjs';

const read=p=>fs.readFileSync(p,'utf8');
const migration=read('supabase/migrations/20261122031000_beagu_2026_nonpublic_question_api_guard_v1.sql');
const edge=read('supabase/functions/beagu-2026-tiered-results-v1/index.ts');
const level=read('supabase/functions/beagu-level-api/index.ts');
const policy=read('supabase/functions/_shared/release-policy.mjs');
const sqlRole=/revoke all on function public\.beagu_2026_(?:tiered_released_question_results_v1|released_question_results|lv2_released_question_results)/;

const question=(id,fields={})=>{
 const def=catalog[id]||catalog.Q01;
 const choices=def.kind==='grid'?def.columns:def.options;
 const counts=choices.map((_,i)=>i===0?1:0);
 return {id,row:def.kind==='grid'?0:-1,valid:1,invalid:0,counts,
  minutes_sum:0,...fields};
};
const metric=(id,year=2026)=>({
 survey_year:year,question_id:id,access_level:2,value:'75',
 release_version:'synthetic-1',approval_status:'APPROVED',privacy_status:'PASSED',
 identity_reviewed:true,question_reviewed:true,small_cell_reviewed:true,
 differencing_reviewed:true,
 approved_at:new Date(Date.now()-26*3600000).toISOString(),
 approved_by:'reviewer',approval_evidence:'synthetic exact approval'
});
const definition=(id,year=2026)=>({
 survey_year:year,question_id:id,access_level:2,verified:true,
 value_type:'number',minimum:0,maximum:100,label:'Closed survey metric',
 meaning:'Synthetic vetted metric',interpretation:'Synthetic vetted aggregate',
 direction:'higher',unit:'점',spatial_scope:'school'
});

test('B-01: 2026 public questionnaire allowlist refuses sensitive Q31/Q51, suffixed identities and unknown keys',()=>{
 for(let n=1;n<=50;n++){
  const id='Q'+String(n).padStart(2,'0');
  assert.equal(isPublic2026QuestionId(id),n!==31,id);
 }
 for(const id of [
  'Q31','Q51','Q31.1','Q31_private','Q31-sensitive','Q51_TEXT',
  'Q00','Q52','Q99','respondent_email','school_response_rows',
  'phone','teacher_name','Q01.2','q31','',null,{},1
 ]){
  assert.equal(isPublic2026QuestionId(id),false,String(id));
  assert.equal(isPublic2026MetricKey(id),false,String(id));
 }
 assert.equal(isPublic2026MetricKey('percentile'),true);
 assert.equal(isPublic2026MetricKey('Q30'),true);
 assert.equal(isPublic2026MetricKey('Q32'),true);
});

test('B-01: serialization returns fixed catalogue labels only; never raw IDs, counts, metadata or free text',()=>{
 const privateAnswer='PERSON_IDENTIFIER_DO_NOT_LEAK';
 const fields={
  respondent_email:privateAnswer,
  raw_text:privateAnswer,
  school_response_rows:1,
  source_row_id:privateAnswer,
  user_id:privateAnswer,
  full_name:privateAnswer,
  counts:[1,0,0,0,0,0]
 };
 const output=publicQuestionResults([
  question('Q01',fields),
  question('Q31',{raw_text:privateAnswer,counts:[1,0]}),
  {id:'Q51',row:-1,valid:1,invalid:0,counts:[1],raw_text:privateAnswer},
  {id:'Q31.private',row:-1,valid:1,invalid:0,counts:[1],raw_text:privateAnswer},
  {id:'Q99',row:-1,valid:1,invalid:0,counts:[1],raw_text:privateAnswer},
  null,undefined,'Q01',{}
 ]);
 assert.deepEqual(output,[{questionId:'Q01',row:-1,values:['전혀 그렇지 않다']}]);
 const json=JSON.stringify(output);
 for(const privateField of [privateAnswer,'counts','invalid','valid','school_response_rows','source_row_id','Q31','Q51','Q99','respondent'])
  assert.equal(json.includes(privateField),false,privateField);
});

test('B-01: invalid row, invalid counts, invalid fraction or unapproved answer never escapes',()=>{
 const good=question('Q01');
 assert.deepEqual(publicQuestionResults([good]),[{questionId:'Q01',row:-1,values:['전혀 그렇지 않다']}]);
 for(const unsafe of [
  {...good,row:0}, {...good,row:undefined}, {...good,valid:1.5},
  {...good,invalid:1}, {...good,invalid:undefined},
  {...good,counts:null}, {...good,counts:['1',0,0,0,0,0]},
  {...good,counts:[0,0,0,0,0,0]}, {...good,counts:[2,0,0,0,0,0]},
  {...good,counts:[1,0,0,0,0,0,0]}, {...good,counts:[1,-1,1,0,0,0]}
 ]){
  assert.deepEqual(publicQuestionResults([unsafe]),[],'bad data must fail closed: '+JSON.stringify(unsafe));
 }
 assert.deepEqual(publicQuestionResults(null),[]);
 assert.deepEqual(publicQuestionResults({}),[]);
 const clock={id:'Q19',row:-1,valid:1,invalid:0,counts:[],minutes_sum:550};
 assert.deepEqual(publicQuestionResults([clock]),[{questionId:'Q19',row:-1,values:['09:10']}]);
 assert.deepEqual(publicQuestionResults([{...clock,minutes_sum:1500}]),[]);
});

test('B-01: malicious catalogue approval cannot release private/unknown 2026 numeric metrics',()=>{
 for(const id of ['Q31','Q51','Q31_private','Q51.text','Q99','respondent_email']){
  const res=releaseMetrics([metric(id)],[definition(id)],2,false);
  assert.deepEqual(res,[],id);
 }
 assert.deepEqual(releaseMetrics([metric('Q20')],[definition('Q20')],2,false).map(x=>x.key),['Q20']);
 // Percentile is Lv1-only; a fabricated Lv2 entry cannot override it.
 assert.deepEqual(releaseMetrics(
  [{...metric('percentile'),access_level:1}],
  [{...definition('percentile'),access_level:1}],1,false
 ).map(x=>x.key),['percentile']);
 // This B-01 policy applies to 2026 only, never retroactively recodes
 // the 2023–2025 historical question identifiers.
 assert.deepEqual(releaseMetrics([metric('Q31',2025)],[definition('Q31',2025)],2,false).map(x=>x.key),['Q31']);
});

test('B-01: all 2026 school API variants use redaction before JSON serialization',()=>{
 assert.match(edge,/const safe=publicQuestionResults\(data\)/);
 assert.match(edge,/questions:safe/);
 assert.match(level,/Array\.isArray\(released2026\)\?publicQuestionResults\(released2026\):\[\]/);
 assert.match(policy,/!isPublic2026MetricKey\(r\.question_id\)/);
 assert.doesNotMatch(edge,/questions:\s*data|JSON\.stringify\(data\)|console\.log/);
 assert.match(migration,/q\.value->>'id' not in \('Q31','Q51'\)/);
 assert.ok(migration.includes("q.value->>'id' ~ '^Q(0[1-9]|[1-4][0-9]|50)$'"));
 assert.match(migration,/create or replace function public\.beagu_2026_released_question_results/);
 assert.match(migration,/select public\.beagu_2026_tiered_released_question_results_v1\(p_school_id,1\)/);
 assert.match(migration,/select public\.beagu_2026_tiered_released_question_results_v1\(p_school_id,2\)/);
 assert.match(migration,sqlRole);
 assert.match(migration,/grant execute on function public\.beagu_2026_released_question_results\(text\)\s+to service_role/);
});
