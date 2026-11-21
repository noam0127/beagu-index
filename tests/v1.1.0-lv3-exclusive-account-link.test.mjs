import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(file,'utf8');
const migration=read('supabase/migrations/20261122001000_beagu_lv3_verified_account_link_v1.sql');
const stage17=read('supabase/migrations/20261121235500_beagu_2026_verified_code_levels_v1.sql');
const backend=read('supabase/functions/beagu-postit-api-v1/index.ts');
const challenge=read('js/challenge-member-auth-v1.js');
const postit=read('js/postit-account-v1.js');
const accountStatus=read('js/beagu-account-status-v1.js');
const level=read('supabase/functions/beagu-level-api/index.ts');

test('one verified Auth account is bound to only one stable 2026 visitor, and vice versa',()=>{
 assert.match(migration,/auth_user_id uuid primary key references auth\.users\(id\) on delete cascade/);
 assert.match(migration,/visitor_id uuid not null unique/);
 assert.match(migration,/author_uid uuid not null unique/);
 assert.match(migration,/on delete restrict/);
 assert.match(migration,/pg_catalog\.pg_advisory_xact_lock/);
 assert.match(migration,/link_status<>'linked'/);
 assert.match(migration,/on conflict\(auth_user_id\) do nothing/);
 assert.match(migration,/raise exception 'member linkage conflict' using errcode='23505'/);
});
test('private Lv3 candidate record cannot be queried or created by users directly',()=>{
 assert.match(migration,/enable row level security/g);
 assert.match(migration,/revoke all on beagu_private\.member_lv3_identity_links_v1[\s\S]*?from public,anon,authenticated/);
 assert.match(migration,/revoke all on beagu_private\.member_lv3_link_events_v1[\s\S]*?from public,anon,authenticated/);
 assert.match(migration,/revoke all on function public\.beagu_postit_bind_verified_member[\s\S]*?from public,anon,authenticated/);
 assert.match(migration,/revoke all on function public\.beagu_lv3_link_status_v1[\s\S]*?from public,anon,authenticated/);
 assert.match(migration,/grant execute on function public\.beagu_lv3_link_status_v1[\s\S]*?to service_role/);
});
test('Lv2+own 2026 response, quality-verified referral and original device are mandatory',()=>{
 assert.match(migration,/public\.beagu_2026_verified_visitor_level_v1\(p_visitor\)<>2/);
 assert.match(migration,/beagu_private\.challenge_device_claims d/);
 assert.match(migration,/d\.device_secret_sha256=p_device_hash/);
 assert.match(migration,/d\.campaign='2026'/);
 assert.match(migration,/a\.email_confirmed_at is not null/);
 assert.match(migration,/a\.is_anonymous is not true/);
 assert.match(stage17,/verification_status='approved'/);
 assert.match(stage17,/q\.quality_status='MANUALLY_APPROVED'/);
 assert.match(stage17,/e\.decision='credited'/);
});
test('Edge Auth validation requires real user and exact live session, not mutable metadata',()=>{
 assert.match(backend,/db\.auth\.getUser\(jwt\)/);
 assert.match(backend,/user\.is_anonymous\|\|!user\.email_confirmed_at/);
 assert.match(backend,/claims\.session_id/);
 assert.match(backend,/beagu_member_live_session_v1/);
 assert.match(backend,/p_user:user\.id,p_session:sid/);
 assert.doesNotMatch(backend,/user\.user_metadata|raw_user_meta_data/);
 assert.match(backend,/await authenticatedUser\(req\)/);
});
test('existing single link button atomically records Post-it + separate Lv3 candidate',()=>{
 assert.match(backend,/if\(action==="link_member"\)/);
 assert.match(backend,/p_device_hash:await sha256\(deviceSecret\)/);
 assert.match(backend,/beagu_postit_bind_verified_member/);
 assert.match(backend,/beagu_lv3_link_status_v1/);
 assert.match(backend,/lv3LinkReady:true/);
 assert.match(migration,/insert into public\.beagu_postit_member_accounts/);
 assert.match(migration,/insert into beagu_private\.member_lv3_identity_links_v1/);
 assert.match(migration,/insert into beagu_private\.member_lv3_link_events_v1/);
 assert.match(challenge,/action:'link_member',deviceSecret:original/);
 assert.match(postit,/action:'link_member',deviceSecret/);
 assert.doesNotMatch(postit,/localStorage\.setItem\(deviceKey/);
});
test('linked Post-it legacy author is not falsely claimed to have Lv3-ready account',()=>{
 assert.match(backend,/return respond\(req,\{linked:true,lv3LinkReady:ready===true\}\)/);
 assert.match(backend,/return respond\(req,\{linked:false,lv3LinkReady:false\}\)/);
 assert.match(migration,/join public\.beagu_postit_member_accounts p/);
 assert.match(migration,/p\.author_uid=l\.author_uid/);
 assert.match(migration,/p\.status='active'/);
 assert.match(migration,/l\.link_status='linked'/);
});
test('Lv3 rights are NOT activated at Stage18',()=>{
 assert.match(accountStatus,/lv3-link-ready/);
 assert.match(accountStatus,/실제 Lv3 등급은 아직 적용되지 않았습니다/);
 assert.match(challenge,/setAccountState\('lv3-link-ready'\)/);
 assert.match(postit,/showState\(lv3LinkReady\?'lv3-link-ready':'linked'\)/);
 assert.match(level,/if\(level<1\)/);
 assert.doesNotMatch(migration,/\baccess_level\s*=\s*3\b|\bgrant\s+lv3\b/i);
 assert.doesNotMatch(backend,/access_level\s*:\s*3|level\s*:\s*3/);
 assert.doesNotMatch(migration,/update\s+auth\.users|delete\s+from\s+auth\.users/i);
});
test('all browser scripts parse and have no password/code in private link database',()=>{
 for(const file of ['js/challenge-member-auth-v1.js','js/postit-account-v1.js','js/beagu-account-status-v1.js'])
  assert.doesNotThrow(()=>new vm.Script(read(file),{filename:file}));
 assert.doesNotMatch(migration,/password\s+text|device_secret_sha256\s+text|identity_code\s+text|email\s+text/);
 assert.doesNotMatch(migration,/grant\s+select.*member_lv3_identity_links.*authenticated/i);
});
