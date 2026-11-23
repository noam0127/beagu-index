import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
const triage=read('supabase/migrations/20261121010000_beagu_2026_automatic_quality_triage.sql');
const referral=read('supabase/migrations/20261121010500_beagu_referral_quality_risk_gate.sql');
const form=read('scripts/beagu-2026-referral-integration.gs');
const edge=read('supabase/functions/beagu-referral-ingest-v1/index.ts');
const review=read('supabase/functions/beagu-2026-review-admin/index.ts');
const ui=read('js/beagu-2026-admin-review.js');
const html=read('admin.html');
// Aggregate quality assessment does not manipulate the PUBLIC approval path.
assert.match(triage,/beagu_private\.beagu_2026_quality_reviews/);
assert.match(triage,/evidence_scope text not null default 'AGGREGATE_ONLY'/);
assert.match(triage,/TECHNICAL|quality_status/);
assert.match(triage,/SCHOOL_MATCH_UNRESOLVED/);
assert.match(triage,/UNRECOGNIZED_MANDATORY_ANSWER/);
assert.match(triage,/MANDATORY_QUESTION_COVERAGE/);
assert.match(triage,/cron\.schedule\('beagu-2026-auto-quality-triage','\*\/5 \* \* \* \*'/);
assert.match(triage,/p_filter='quality'/);
assert.match(triage,/quality\.quality_status,'NOT_SCANNED'/);
assert.doesNotMatch(triage,/set\\s+approval_status\\s*=\\s*'APPROVED'/i);
// Referral evidence is private, never stores teacher response content.
assert.match(referral,/create table if not exists beagu_private\.challenge_referral_quality_reviews/);
assert.match(referral,/challenge_referral_quality_audit/);
assert.match(referral,/beagu_referral_credit_quality_gate/);
assert.match(referral,/QUALITY_ATTESTATION_MISSING/);
assert.match(referral,/STRAIGHTLINE_LIKERT/);
assert.match(referral,/REUSED_RESPONDENT_IDENTITY/);
assert.match(referral,/pending_quality_review/);
assert.match(referral,/set access_level=1,valid_referrals=0,upgraded_at=null/);
assert.match(referral,/beagu_referral_quality_resolve/);
assert.match(referral,/beagu_admin_active_mfa_session\(p_actor,p_session\)/);
assert.match(referral,/p_decision not in \('APPROVE','REJECT'\)/);
assert.match(referral,/quality_status in \('AUTO_PASS','MANUALLY_APPROVED'\)/);
assert.match(referral,/revoke all on function public\.beagu_referral_credit_quality_gate[\s\S]*?from public,anon,authenticated/);
assert.match(referral,/revoke all on beagu_private\.challenge_referral_quality_reviews from public,anon,authenticated/);
assert.match(edge,/db\.rpc\('beagu_referral_credit_quality_gate'/);
assert.match(edge,/p_quality_attested:attested/);
assert.match(edge,/p_quality_signals:signals/);
assert.match(edge,/qualityVerified===true&&Array\.isArray\(body\.qualitySignals\)/);
assert.doesNotMatch(edge,/db\.rpc\('beagu_referral_credit',/);
assert.match(form,/function beaguReferralSubmissionQuality_\(/);
assert.match(form,/qualityVerified:true/);
assert.match(form,/MISSING_REQUIRED_CORE/);
assert.match(form,/STRAIGHTLINE_LIKERT/);
assert.match(review,/referral_quality_resolve/);
assert.match(review,/if\(account\.role!=="owner"\)/);
assert.match(review,/beagu_admin_active_mfa_session/);
assert.match(ui,/referral_quality_queue/);
assert.match(ui,/referral_quality_resolve/);
assert.match(html,/adminReferralRiskCard/);
assert.match(html,/value="quality"/);
assert.match(html,/20261123-level-approvals1/);
const ctx={};
vm.createContext(ctx);
vm.runInContext(form,ctx);
const getResponse=choices=>({
 getItemResponses:()=>choices.map(([id,value])=>({
   getItem:()=>({getTitle:()=>`Q${String(id).padStart(2,'0')}. sample`}),
   getResponse:()=>value
 }))
});
const good=Array.from({length:13},(_,i)=>[i+1,['①','②','③','④','⑤'][i%5]+' 답변']);
const passed=ctx.beaguReferralSubmissionQuality_(getResponse(good));
assert.equal(passed.qualityVerified,true);
assert.equal(JSON.stringify(passed.qualitySignals),'[]');
const straight=good.map(([i])=>[i,i<=11?'① 답변':'② 답변']);
assert.equal(ctx.beaguReferralSubmissionQuality_(getResponse(straight)).qualitySignals.includes('STRAIGHTLINE_LIKERT'),true);
const missing=good.filter(([i])=>i!==13);
assert.equal(ctx.beaguReferralSubmissionQuality_(getResponse(missing)).qualitySignals.includes('MISSING_REQUIRED_CORE'),true);
const malformed=good.map(([i,ans])=>[i,i===9?['incorrect']:ans]);
assert.equal(ctx.beaguReferralSubmissionQuality_(getResponse(malformed)).qualitySignals.includes('UNREADABLE_ITEM_RESPONSE'),true);
console.log('PASS: school aggregate triage, referral anti-fraud hold, owner review, Forms metadata-only signals');
