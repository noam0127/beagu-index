"use strict";
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const original=readFileSync("supabase/migrations/20261121093000_referral_funnel_private_v1.sql","utf8");
const staging=readFileSync("supabase/migrations/stage38_staging_referral_funnel_rpc.sql","utf8");
const regression=readFileSync("tests/stage38-staging-referral-funnel-regression.sql","utf8");
const i=original.indexOf("create table if not exists beagu_private.challenge_referral_funnel_events");
assert.ok(i>=0);
assert.ok(staging.includes(original.slice(i).trim()),
  "Staging recorder and admin funnel must match the original production SQL exactly");
assert.match(staging,/ycwuugggqbunlbwuzvbx/);
assert.match(staging,/snvzwrexuqavnfvzgxqj/);
assert.match(staging,/CREATE TABLE IF NOT EXISTS beagu_private\.challenge_referral_events/);
assert.match(staging,/FOREIGN KEY \(campaign, referrer_visitor_id\)/);
assert.match(staging,/challenge_referral_one_respondent_credit/);
assert.match(staging,/challenge_referral_events_owner_idx/);
assert.match(staging,/ALTER TABLE beagu_private\.challenge_referral_events ENABLE ROW LEVEL SECURITY/);
assert.match(staging,/REVOKE ALL ON beagu_private\.challenge_referral_events FROM PUBLIC,anon,authenticated/i);
assert.match(staging,/revoke all on function public\.beagu_admin_referral_funnel_v1\(text\) from public,anon,authenticated/i);
assert.match(staging,/grant execute on function public\.beagu_admin_referral_funnel_v1\(text\) to service_role/i);
assert.match(staging,/revoke all on function public\.beagu_referral_funnel_record_v1\(text,text,text\) from public,anon,authenticated/i);
assert.doesNotMatch(staging,/\bcron\.schedule\(/i);
assert.doesNotMatch(staging,/\bGRANT\s+EXECUTE\s+.*\bTO\s+(?:anon|authenticated)\b/i);
for(const pattern of [
  /\bBEGIN;/, /\bROLLBACK;/, /SET LOCAL ROLE anon;/,
  /SET LOCAL ROLE service_role;/, /form_events/, /proof_issued/,
  /duplicate retry/, /Disabled referral/, /max_tracking_days/,
  /insufficient_privilege/, /repeat\('b',64\)/
]) assert.match(regression,pattern);
console.log("PASS: staging referral funnel reuses original SQL, private event schema, authorized-only RPC and rollback regression");
