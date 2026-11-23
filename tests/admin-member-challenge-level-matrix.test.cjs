const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs");
const sql=fs.readFileSync("supabase/migrations/20261122010000_admin_member_challenge_summary_v1.sql","utf8");
const api=fs.readFileSync("supabase/functions/beagu-admin-members-v1/index.ts","utf8");
const classify=({memberActive=false,disabled=true,accessLevel=0,validReferrals=0})=>
  memberActive&&!disabled&&accessLevel>=2&&validReferrals>=1;
test("Lv1 without referral is not Lv2",()=>assert.equal(classify({memberActive:true,disabled:false,accessLevel:1,validReferrals:0}),false));
test("verified referral upgrades Lv2",()=>assert.equal(classify({memberActive:true,disabled:false,accessLevel:2,validReferrals:1}),true));
test("disabled or unlinked account does not get Lv2",()=>{
 assert.equal(classify({memberActive:true,disabled:true,accessLevel:2,validReferrals:1}),false);
 assert.equal(classify({memberActive:false,disabled:false,accessLevel:2,validReferrals:1}),false);
});
test("SQL contract: account, campaign and referral verification",()=>{
 assert.match(sql,/m\.auth_user_id=p_user/);
 assert.match(sql,/i\.campaign='2026'/);
 assert.match(sql,/r\.campaign='2026'/);
 assert.match(sql,/r\.valid_referrals>=1/);
 assert.match(api,/beagu_admin_member_challenge_summary_v1/);
});
