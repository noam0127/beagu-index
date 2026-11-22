import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(p,"utf8");
const stage=JSON.parse(read("docs/releases/v1.1.0-stage38-staging-state.json"));
const rc=JSON.parse(read("docs/releases/v1.1.0-rc.1.json"));
const doc=read("docs/releases/v1.1.0-stage38-operator-handoff.md");
assert.equal(stage.stage,38);
assert.equal(stage.deployment_status,"BLOCKED_NOT_DEPLOYED");
assert.equal(stage.staging_release_complete,false);
assert.equal(stage.live_stage_matches_rc,false);
assert.equal(stage.production_release_allowed,false);
assert.equal(stage.rc_sha,rc.immutable_candidate.commit_sha);
assert.notEqual(stage.published_staging_sha,stage.rc_sha);
assert.equal(stage.admin_release_api.live_deployed,false);
assert.equal(rc.deployment.production_release,"NO_GO");
for(const required of [
 "#243","#195","AAL2","register_stage_candidate",
 "release/v1.1.0-rc.1","5c95aadad971901a8222f83c52e93bf901a3aeb7",
 "beagu-release-manager-v1","staging_sha","stage_apply",
 "beagu_site_release_jobs_v1","beagu_site_release_history_v1",
 "시험 Supabase","38단계 진행 중","38단계종료","운영 출고 차단",
 "롤백","승인 전 임의 병합 금지"
]){
  assert.ok(doc.includes(required),"Operator document missing: "+required);
}
const oldApi=read("supabase/functions/beagu-release-manager-v1/index.ts");
const oldUI=read("js/beagu-admin-updates-v1.js");
assert.match(oldApi,/if\(action==="register_stage_candidate"\)/);
assert.match(oldApi,/c\?\.aal!=="aal2"/);
assert.match(oldApi,/beagu_admin_active_mfa_session/);
assert.match(oldApi,/productionCandidateLocked\(s\.staging_sha,s\.staging_version\)/);
assert.match(oldUI,/register_stage_candidate/);
assert.match(oldUI,/el\("releaseProdApply"\)\.disabled=busy\|\|active\|\|blockedRc/);
assert.match(doc,/부트스트랩.*시험 웹 적용.*운영 관리자 화면/s);
assert.match(doc,/운영 DB 릴리스 상태 직접 변경/);
console.log("PASS: stage38 operator sign-off and restoration checklist complete; current live RC still NOT DEPLOYED.");
console.log("RELEASE: NO_GO; owner AAL2 and independent controller installation approval required.");
