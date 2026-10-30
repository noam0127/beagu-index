import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {releaseMetrics,legacyRows} from '../supabase/functions/_shared/release-policy.mjs';
import {prepareBatch,matchSchool} from '../admin/pipeline.mjs';
const keys=Array.from({length:13},(_,i)=>`Q${String(i+1).padStart(2,'0')}`);
const catalog=keys.map(question_id=>({question_id,survey_year:2026,verified:true,access_level:1,value_type:'number',minimum:0,maximum:100,label:question_id,meaning:'설명',interpretation:'해석',direction:'정방향',unit:'점',spatial_scope:'학교'}));
const rows=keys.map(question_id=>({question_id,survey_year:2026,access_level:1,value:'0',release_version:'v1',approval_status:'APPROVED',privacy_status:'PASSED',identity_reviewed:true,question_reviewed:true,small_cell_reviewed:true,differencing_reviewed:true,approved_at:'2026-10-30',approved_by:'reviewer',approval_evidence:'private evidence',n_valid:1,respondents:1,raw_answer:'secret'}));
test('Lv0 returns nothing; Lv1 returns exactly 13 approved items and preserves zero',()=>{
 assert.deepEqual(releaseMetrics(rows,catalog,0),[]);
 const out=releaseMetrics(rows,catalog,1);assert.equal(out.length,13);assert.equal(out[0].value,0);
 assert.doesNotMatch(JSON.stringify(out),/respondents|n_valid|raw_answer|secret|private evidence|approved_by/);
});
test('incomplete, mixed-version and unapproved VI sets fail closed',()=>{
 assert.equal(releaseMetrics(rows.slice(1),catalog,1).length,0);
 for(const change of [{release_version:'v2'},{approval_status:'PENDING'},{privacy_status:'PENDING'},{identity_reviewed:false},{question_reviewed:false},{small_cell_reviewed:false},{differencing_reviewed:false},{approval_evidence:''},{value:'NaN'},{value:'101'},{access_level:2}]){
  assert.equal(releaseMetrics([{...rows[0],...change},...rows.slice(1)],catalog,1).length,0,JSON.stringify(change));
 }
});
test('invalid catalog range, count labels and unverified definitions fail closed',()=>{
 for(const change of [{minimum:undefined},{maximum:NaN},{verified:false},{label:'학교 응답 횟수'},{label:'<script>'}])assert.equal(releaseMetrics(rows,[{...catalog[0],...change},...catalog.slice(1)],1).length,0);
});
test('other aggregate metrics require Lv2',()=>{
 const r={...rows[0],question_id:'facility',access_level:2};const c={...catalog[0],question_id:'facility',access_level:2};
 assert.deepEqual(releaseMetrics([r],[c],1),[]);assert.equal(releaseMetrics([r],[c],2).length,1);
 assert.deepEqual(legacyRows([{survey_year:2025,release_status:'approved',summary:{}}],1),[]);
});
test('Q51 free-text cannot be released even under a mistaken numeric catalog',()=>{
 assert.deepEqual(releaseMetrics([{...rows[0],question_id:'Q51',access_level:2}],[{...catalog[0],question_id:'Q51',access_level:2}],2),[]);
});
const book=JSON.parse(readFileSync(new URL('../admin/codebooks/2026.json',import.meta.url)));
const school={school_id:'1234567',school_name:'검증용학교',sido_standard:'전남',support_office:'전남교육청가상교육지원청',status:'운영'};
const headers=['B01. 지역','B02. 교육지원청','B03. 학교',...book.verticality.map(q=>`${q.question_id}. ${q.label}`)];
const answer=['전남권(구 전라남도)','① 가상교육지원청','검증용학교',...book.verticality.map(q=>Object.keys(q.scoring)[0])];
test('matching never guesses among duplicate schools or mismatched IDs',()=>{
 const row={name:school.school_name,region:school.sido_standard,office:school.support_office};
 assert.equal(matchSchool(row,[school]).school_id,school.school_id);
 assert.equal(matchSchool(row,[school,{...school,school_id:'7654321'}]).match_status,'NEEDS_REVIEW');
 assert.equal(matchSchool({...row,school_id:'9999999'},[school]).school_id,null);
});
test('source row numbers survive blank rows, imports stay pending and are deterministic',()=>{
 const values=[headers,[],answer],a=prepareBatch(values,[school],book,'test-private-source');
 assert.equal(a.p_records[0].source_key,'3');assert.equal(a.p_records[0].school_id,school.school_id);
 assert.equal(a.p_records[0].values.approval_status,'PENDING');
 assert.equal(a.p_hash,prepareBatch(values,[school],book,'test-private-source').p_hash);
 assert.throws(()=>prepareBatch([[...headers.slice(0,-1),'changed'],answer],[school],book,'test'),/QUESTION_CHANGED/);
 assert.equal(book.percentile_formula,null);
});
