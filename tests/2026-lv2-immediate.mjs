import assert from 'node:assert/strict';
import fs from 'node:fs';
import {releaseMetrics} from '../supabase/functions/_shared/release-policy.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const row={school_id:'A123456',survey_year:2026,question_id:'Q20',access_level:2,value:'66',
  release_version:'checked-v1',approval_status:'APPROVED',privacy_status:'PASSED',
  identity_reviewed:true,question_reviewed:true,small_cell_reviewed:true,
  differencing_reviewed:true,approved_at:new Date().toISOString(),approved_by:'owner',
  approval_evidence:'review completed'};
const catalog=[{survey_year:2026,question_id:'Q20',access_level:2,verified:true,
  label:'Approved test metric',value_type:'number',minimum:0,maximum:100,unit:'점',
  meaning:'approved metric',interpretation:'approved metric',direction:'higher',spatial_scope:'school'}];
assert.equal(releaseMetrics([row],catalog,2).length,0,'default delay remains');
assert.equal(releaseMetrics([row],catalog,2,true).length,1,'approved Lv2 may skip time only');
assert.equal(releaseMetrics([row],catalog,1,true).length,0,'Lv1 cannot see Lv2 metric even with flag');
assert.equal(releaseMetrics([{...row,privacy_status:'REVIEW_PENDING'}],catalog,2,true).length,0,'privacy gate unchanged');
assert.equal(releaseMetrics([{...row,approval_status:'WITHHELD'}],catalog,2,true).length,0,'approval gate unchanged');
assert.equal(releaseMetrics([{...row,identity_reviewed:false}],catalog,2,true).length,0,'identity gate unchanged');
assert.equal(releaseMetrics([{...row,question_id:'Q31'}],[{...catalog[0],question_id:'Q31'}],2,true).length,0,'Q31 stays private');
assert.equal(releaseMetrics([{...row,question_id:'Q51'}],[{...catalog[0],question_id:'Q51'}],2,true).length,0,'Q51 stays private');
const sql=read('supabase/migrations/20261121100000_beagu_2026_lv2_immediate_approved.sql');
for(const guard of ["approved_payload_sha256=r.payload_sha256","review_status='VERIFIED'","b.small_sample_reviewed","b.reidentification_reviewed","b.prior_data_combination_reviewed","r.approved_at >= r.updated_at","q.value->>'id' not in ('Q31','Q51')"])
  assert.ok(sql.includes(guard),'SQL release gate missing '+guard);
assert.ok(!sql.includes("r.approved_at <= now()-interval '24 hours'"),'New Lv2 RPC must not impose cooldown');
assert.ok(sql.includes("revoke all on function public.beagu_2026_lv2_released_question_results(text) from public, anon, authenticated;"));
assert.ok(sql.includes("grant execute on function public.beagu_2026_lv2_released_question_results(text) to service_role;"));
const api=read('supabase/functions/beagu-level-api/index.ts');
assert.ok(api.includes("if(level>=2&&tierPublished2026){")&&api.includes("beagu_2026_lv2_released_question_results"));
assert.ok(api.includes("if(level===1&&tierPublished2026){")&&api.includes("beagu_2026_released_question_results")); 
assert.ok(api.includes("beagu_2026_level_school_published"),"tier gate mandatory");
assert.ok(api.includes("releaseMetrics(metrics.data||[],catalog.data||[],level,level>=2&&lv2Approved2026!==null)"));
assert.ok(api.includes("if(Number(session.access_level)>=2)"));
console.log('PASS 2026 Lv2 immediate approval / Lv1 cooldown / privacy regression');
