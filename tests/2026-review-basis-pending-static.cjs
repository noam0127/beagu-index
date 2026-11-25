const assert=require("node:assert/strict");
const fs=require("node:fs");
const {execFileSync}=require("node:child_process");
const read=p=>fs.readFileSync(p,"utf8");
const sql=read("supabase/migrations/20261120214500_beagu_2026_basis_pending_review_audit.sql");
const api=read("supabase/functions/beagu-2026-review-admin/index.ts");
const view=read("js/beagu-2026-admin-review.js");
const html=read("tests/fixtures/admin-v1115-legacy.html");
const css=read("styles/beagu-admin-v1.css");
execFileSync(process.execPath,["--check","js/beagu-2026-admin-review.js"],{stdio:"inherit"});
// Events are private and immutable: read and append only, no anonymous or authenticated grant.
assert.match(sql,/create table if not exists beagu_private\.beagu_2026_basis_review_events/);
assert.match(sql,/enable row level security/i);
assert.match(sql,/revoke all on beagu_private\.beagu_2026_basis_review_events from public,anon,authenticated/i);
assert.match(sql,/grant select,insert on beagu_private\.beagu_2026_basis_review_events to service_role/i);
// This RPC must never mark a school VERIFIED or APPROVED.
assert.match(sql,/p_decision not in \('PENDING','REJECTED'\)/);
assert.doesNotMatch(sql,/p_decision\s+in\s*\('PENDING','REJECTED','VERIFIED'\)/);
assert.match(sql,/payload_sha256 is distinct from p_expected_sha256/i);
assert.match(sql,/beagu_admin_active_mfa_session\(p_actor,p_session\)/);
assert.match(sql,/a\.role='owner' and a\.enabled/i);
assert.match(sql,/review_status=excluded\.review_status/i);
assert.match(sql,/approval_status='WITHHELD',approved_by=null,approved_at=null/);
assert.match(sql,/insert into beagu_private\.beagu_2026_basis_review_events/);
assert.match(sql,/revoke all on function public\.beagu_2026_admin_record_basis_review[\s\S]*?from public,anon,authenticated/i);
assert.match(sql,/grant execute on function public\.beagu_2026_admin_record_basis_review[\s\S]*?to service_role/i);
assert.match(sql,/coalesce\(b\.review_status,'NOT_REVIEWED'\)/);
assert.match(sql,/b\.payload_sha256=r\.payload_sha256/);
// Edge API rechecks Auth JWT and live AAL2 for every new action.
assert.match(api,/db\.auth\.getUser\(jwt\)/);
assert.match(api,/claims\.aal!=="aal2"/);
assert.match(api,/beagu_admin_active_mfa_session/);
assert.match(api,/if\(account\.role!=="owner"\)/);
assert.match(api,/input\.action==="basis_review"/);
assert.match(api,/\["PENDING","REJECTED"\]\.includes\(decision\)/);
assert.match(api,/beagu_2026_admin_record_basis_review/);
assert.doesNotMatch(api,/beagu_2026_approve_results/);
// Browser provides bounded fields only; no implicit approval.
assert.match(view,/const checklist=/);
assert.match(view,/action:"basis_review"/);
assert.match(view,/publication_scope/);
assert.match(view,/notice_digest_sha256/);
assert.match(view,/notice_effective_at/);
assert.match(view,/REJECTED/);
assert.doesNotMatch(view,/action:"approve"/);
assert.match(html,/<summary id="adminReview2026Heading">2026 조사자료<\/summary>/);
assert.match(html,/js\/beagu-2026-admin-review\.js\?v=20261125-percentile-v13/);
assert.match(css,/\.beagu-basis-review/);
console.log("PASS: 2026 snapshot-bound MFA evidence intake PENDING/REJECTED without approval");
