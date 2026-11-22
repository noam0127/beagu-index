import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {isVerifiedLv3Member} from '../supabase/functions/_shared/member-tier-v1.mjs';
import {eligiblePostitAuthUser} from '../supabase/functions/_shared/postit-member-ownership.mjs';

const baseSession={access_level:2,identity_campaign:'2026',
 identity_visitor_id:'11111111-1111-4111-8111-111111111111'};
const account={id:'22222222-2222-4222-8222-222222222222',
 email_confirmed_at:'2026-11-21T00:00:00Z',is_anonymous:false};
const binding={auth_user_id:account.id,
 identity_visitor_id:baseSession.identity_visitor_id,
 author_uid:'33333333-3333-4333-8333-333333333333',status:'active'};
const valid=(s=baseSession,a=account,m=binding)=>isVerifiedLv3Member(s,a,m,eligiblePostitAuthUser);
assert.equal(valid(),true,'Same verified earned visitor and confirmed user can reach Lv3');
const mismatch=[
 [{...baseSession,access_level:1},account,binding],
 [{...baseSession,access_level:3},account,binding],
 [{...baseSession,identity_campaign:'stage35'},account,binding],
 [{...baseSession,identity_visitor_id:null},account,binding],
 [baseSession,{...account,id:'44444444-4444-4444-8444-444444444444'},binding],
 [baseSession,{...account,email_confirmed_at:null},binding],
 [baseSession,{...account,is_anonymous:true},binding],
 [baseSession,{...account,deleted_at:'2026-11-22T00:00:00Z'},binding],
 [baseSession,{...account,banned_until:'2999-11-22T00:00:00Z'},binding],
 [baseSession,account,{...binding,status:'suspended'}],
 [baseSession,account,{...binding,auth_user_id:'55555555-5555-4555-8555-555555555555'}],
 [baseSession,account,{...binding,identity_visitor_id:'66666666-6666-4666-8666-666666666666'}],
 [baseSession,account,{...binding,author_uid:null}],
 [baseSession,account,null],
 [baseSession,null,binding]
];
for(const [s,a,b] of mismatch)assert.equal(valid(s,a,b),false,'Spoofed/unbound/unconfirmed/disabled member cannot reach Lv3');
assert.equal(mismatch.length,15);
const api=readFileSync('supabase/functions/beagu-level-api/index.ts','utf8');
assert.match(api,/admin\.auth\.getUser\(match\[1\]\)/,'Server must verify the actual JWT');
assert.match(api,/\.from\('beagu_postit_member_accounts'\)/,'Eligibility must use private membership');
assert.match(api,/\.eq\('auth_user_id',account\.id\)/);
assert.match(api,/\.eq\('identity_visitor_id',session\.identity_visitor_id\)/);
assert.match(api,/return isVerifiedLv3Member\(session,account,member,eligiblePostitAuthUser\)\?3:level/);
assert.match(api,/const effectiveLevel=await verifiedMemberTier\(req,session\)/);
assert.doesNotMatch(api,/body\.(?:level|is_admin|role)\s*===?\s*3/);
const ui=readFileSync('js/beagu-level-state-v1.js','utf8');
assert.match(ui,/const tier=\/\^\[0123\]\$\//);
assert.match(ui,/tier===3\?'✓ Lv3 · 정식 회원'/);
assert.match(ui,/const bearer=await authBearer\(\)/);
assert.match(ui,/\.\.\.\(bearer\?\{'Authorization':'Bearer '\+bearer\}:\{\}\)/);
assert.match(ui,/client\?\.auth\?\.onAuthStateChange\?\./);
assert.match(ui,/result\.level>=3\?3:result\.level>=2\?2:1/);
const challenge=readFileSync('js/challenge-member-auth-v1.js','utf8');
const postit=readFileSync('js/postit-account-v1.js','utf8');
assert.match(challenge,/Number\(badge\?\.dataset\.level\)>=2/,'Membership dialog survives Lv3');
assert.match(challenge,/Number\(data\.level\)>=2/,'Lv3 server verify must retain code benefits');
assert.match(challenge,/new CustomEvent\('beagu:member-linked'\)/);
assert.match(postit,/Number\(\$\('beaguLevelState'\)\?\.dataset\.level\)>=2/,'Post-it remains accessible to Lv3');
for(const path of ['js/beagu-level-state-v1.js','js/challenge-member-auth-v1.js','js/postit-account-v1.js']){
  execFileSync(process.execPath,['--check',path]);
}
console.log('PASS: verified Lv3 member proof and 15 fail-closed cases, server Auth lookups and UI badge/flow contracts.');
console.log('SCOPE: Lv3 badge/session read-only verification only; immediate 2026 visibility and full signup delivery not yet proven.');
