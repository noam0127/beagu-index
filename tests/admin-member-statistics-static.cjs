const assert=require("node:assert/strict");
const fs=require("node:fs");
const sql=fs.readFileSync("supabase/migrations/20261122020000_admin_member_directory_v2.sql","utf8");
const html=fs.readFileSync("admin.html","utf8");
const js=fs.readFileSync("js/beagu-admin-members-v1.js","utf8");
for(const [id,key] of [
["adminMembersConfirmed","confirmed_scanned"],
["adminMembersRecentLogin","recent_login_30d"],
["adminMembersLinked","linked_member_accounts"],
["adminChallengeCodes","challenge_2026_codes"],
["adminReferralProfiles","challenge_2026_referral_profiles"],
["adminVerifiedReferrers","challenge_2026_verified_referrers"]]){
 assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(js.includes('"'+id+'","'+key+'"'),key);
 assert.ok(sql.includes("'"+key+"'"),key);
}
assert.match(html,/현재 접속 중인 사용자 수가 아닙니다/);
assert.match(sql,/last_sign_in_at >= now\(\) - interval '30 days'/);
console.log("PASS: member statistics UI/API schema contract");
