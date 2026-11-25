const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const read=p=>fs.readFileSync(p,'utf8');
const html=read('admin.html');
const ui=read('js/beagu-2026-admin-review.js');
const css=read('styles/beagu-admin-v1.css');
const api=read('supabase/functions/beagu-2026-review-admin/index.ts');
const schoolApi=read('supabase/functions/beagu-level-api/index.ts');
const cultureApi=read('supabase/functions/beagu-school-culture-v1/index.ts');
const sql=read('supabase/migrations/20261123180000_2026_level_final_release_controls.sql');
const gateSql=read('supabase/migrations/20261123180100_2026_released_results_tier_gate.sql');
execFileSync(process.execPath,['--check','js/beagu-2026-admin-review.js'],{stdio:'inherit'});
for(const id of ['adminReview2026Total','adminReview2026Technical','adminReview2026Approved',
  'adminPipelineBasis','adminPipelineApproved','adminPipelineAggregateAuto']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
}
for(const lv of [0,1,2]){
  for(const key of ['State','Covered','Button','Revoke']){
    const id='adminLevelRelease'+key+lv;
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.match(html,new RegExp('id="adminLevelReleaseButton'+lv+'" disabled'));
  assert.match(html,new RegExp('id="adminLevelReleaseRevoke'+lv+'" disabled hidden'));
}
assert.match(html,/admin-review-disclosure/);
assert.match(css,/\.admin-review-overview/);
assert.match(css,/\.admin-release-grid/);
assert.match(css,/\.metrics article/);
assert.match(ui,/function renderLevelApprovals/);
assert.match(ui,/function makeFinalApproveForm/);
assert.match(ui,/action:"level_decision"/);
assert.match(ui,/action:"finalize"/);
assert.match(ui,/button\.disabled=!data\|\|role!=="owner"/);
assert.match(api,/if\(account\.role!=="owner"\)/);
assert.match(api,/if\(input\.action==="level_decision"\)/);
assert.ok(api.indexOf('if(claims.aal!=="aal2")')<api.indexOf('if(input.action==="level_decision")'));
assert.ok(api.indexOf('beagu_admin_active_mfa_session')<api.indexOf('if(input.action==="level_decision")'));
assert.match(api,/beagu_2026_set_level_final_approval/);
assert.match(sql,/CHECK\s*\(access_level BETWEEN 0 AND 2\)/i);
assert.match(sql,/approved boolean NOT NULL DEFAULT false/);
assert.match(sql,/p_actor,p_session/);
assert.match(sql,/beagu_admin_active_mfa_session/);
assert.match(sql,/r\.approved_at<=l\.approved_at/);
assert.match(sql,/b\.review_status='VERIFIED'/);
assert.match(sql,/t\.technical_status='TECHNICAL_CHECK_PASSED'/);
assert.match(sql,/p_action='APPROVE' AND eligible_count=0/);
assert.match(sql,/revoke all on function public.beagu_2026_level_school_published/i);
assert.match(sql,/grant execute on function public.beagu_2026_level_school_published\(text,integer\)\s+to service_role/i);
assert.doesNotMatch(sql,/grant.*to anon|grant.*to authenticated/i);
assert.match(gateSql,/beagu_2026_level_school_published\(r\.school_id,1\)/);
assert.match(gateSql,/beagu_2026_level_school_published\(r\.school_id,2\)/);
assert.match(schoolApi,/beagu_2026_level_released_school_ids/);
assert.match(schoolApi,/beagu_2026_level_school_published/);
assert.match(schoolApi,/m\.year!==2026\|\|\(level===2&&tierPublished2026\)/);
assert.match(schoolApi,/if\(tier===1\)return await sendSchoolProfiles\(\{\}\)/);
assert.match(schoolApi,/level===2&&Array.isArray\(lv2Approved2026\)\?publicQuestionResults\(lv2Approved2026\):\[\]/);
assert.match(cultureApi,/beagu_2026_level_released_school_ids/);
assert.match(cultureApi,/releasedSet\.has\(id\)/);
console.log('PASS: independent Lv0/Lv1/Lv2 owner-MFA approvals, no default publication, all known 2026 response paths gated');
