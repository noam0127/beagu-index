import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(p)=>readFileSync(p,'utf8');
const state=JSON.parse(read('docs/releases/v1.1.0-stage36-gates.json'));
assert.equal(state.version,'1.1.0');
assert.equal(state.stage,36);
assert.equal(state.branch,'develop/v1.1.0-lv3');
assert.equal(state.production_release,'NO_GO','Unverified real-world approval gates must block production deploy');
const checks=Object.fromEntries(state.checks.map(x=>[x.id,x]));
assert.equal(Object.keys(checks).length,state.checks.length,'Gate IDs must be unique');
for(const id of ['security_release_synthetic','cross_account_postit','cross_account_lv3','static_security_regression']){
  assert.equal(checks[id]?.status,'PASS',id+' must carry existing stage35 evidence');
  assert.ok(Number.isSafeInteger(checks[id].run),id+' must cite verified CI run ID');
}
for(const id of ['admin_aal2_positive','approved_2026_real_pipeline','email_delivery','manual_production_approval']){
  assert.equal(checks[id]?.status,'BLOCKED','Do not convert missing real-world evidence into an unsupported PASS: '+id);
}
assert.ok(['PENDING','BLOCKED'].includes(checks.live_preview_http?.status));
const blockers=state.checks.filter(x=>x.status!=='PASS');
assert.ok(blockers.length>=5,'No-go requires explicit unresolved gates');
assert.ok(blockers.every(x=>typeof x.scope==='string'&&x.scope.length>12));

const doc=read('docs/releases/v1.1.0-stage36-regression-and-go-no-go.md');
assert.match(doc,/NO-GO/);
assert.match(doc,/AAL2/);
assert.match(doc,/실제 2026/);
assert.match(doc,/운영.*승인/);
const level=read('supabase/functions/beagu-level-api/index.ts');
const release=read('supabase/functions/_shared/release-policy.mjs');
const admin=read('supabase/functions/beagu-admin-members-v1/index.ts');
const postit=read('supabase/functions/beagu-postit-api-v1/index.ts');
const worker=read('scripts/release-manager/worker.py');
const stage36=read('.github/workflows/v1.1.0-stage36-regression.yml');
assert.match(level,/const effectiveLevel=await verifiedMemberTier\(req,session\)/);
assert.match(level,/canUse2026TierSnapshot\(approval\?\.approved_at,level\)/);
assert.match(level,/canUse2026TierSnapshot\(x\.approved_at,effectiveLevel\)/);
assert.match(release,/level===3\?0:LV2_RELEASE_DELAY_MS/);
assert.match(release,/\^Q\(\?:31\|51\)\(\?:\$\|\[\._-\]\)/);
assert.match(admin,/claims\.aal !== "aal2"/);
assert.match(admin,/beagu_admin_active_mfa_session/);
assert.match(admin,/await applyModerationWithAudit\(/);
assert.match(postit,/\.eq\("status","published"\)\s*\.select\("id"\)\.maybeSingle\(\)/);
assert.match(worker,/production_sha/);
assert.match(worker,/staging_sha/);
assert.match(stage36,/contents: read/);
assert.doesNotMatch(stage36,/id-token:\s*write|supabase\s+(?:deploy|db\s+push)|git\s+push|gh\s+release\s+create/i);
const summary='STAGE36 REGRESSION: policy contracts PASS; production release NO-GO ('+
 blockers.length+' unresolved or pending gates). No deployment performed.';
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY){
  const {appendFileSync}=await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '### Stage36 security release gates\n\n'+
    '| Gate | Status |\n|---|---|\n'+
    state.checks.map(x=>'| '+x.id+' | '+x.status+' |').join('\n')+
    '\n\n**Production release: NO-GO.** Static check success is not release approval.\n');
}
