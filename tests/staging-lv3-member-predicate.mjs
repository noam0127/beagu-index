import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isVerifiedLv3Member} from '../scripts/staging/recovered-beagu-level-api-v5/_shared/member-tier-v1.mjs';
import {eligiblePostitAuthUser,resolveVerifiedPostitOwner} from '../scripts/staging/recovered-beagu-postit-api-v4/_shared/postit-member-ownership.mjs';

const session={access_level:2,identity_campaign:'2026',identity_visitor_id:'c0000000-0000-4000-8000-000000000033'};
const user={id:'c0000000-0000-4000-8000-000000000044',is_anonymous:false,email_confirmed_at:'2026-11-23T09:00:00Z'};
const record={status:'active',auth_user_id:user.id,identity_visitor_id:session.identity_visitor_id,author_uid:'a0000000-0000-4000-8000-000000000066'};
const view={level:2,visitor:session.identity_visitor_id,id:record.author_uid};
const entitled=(sess,u,m)=>isVerifiedLv3Member(sess,u,m,eligiblePostitAuthUser);
assert.equal(entitled(session,user,record),true);
assert.equal(resolveVerifiedPostitOwner(user,view,record)?.authId,user.id);
const bad=[
  ['Lv1 code', {...session,access_level:1},user,record],
  ['provisional Lv2 no 2026 identity',{...session,identity_visitor_id:null},user,record],
  ['other survey campaign',{...session,identity_campaign:'2025'},user,record],
  ['unverified email',session,{...user,email_confirmed_at:null},record],
  ['anonymous Auth account',session,{...user,is_anonymous:true},record],
  ['deleted Auth account',session,{...user,deleted_at:'2026-11-23'},record],
  ['banned Auth account',session,{...user,banned_until:'2099-12-31T00:00:00Z'},record],
  ['other Auth account',session,{...user,id:'00000000-0000-4000-8000-000000000099'},record],
  ['other visitor',session,user,{...record,identity_visitor_id:'00000000-0000-4000-8000-000000000099'}],
  ['inactive member',session,user,{...record,status:'suspended'}],
  ['missing author',session,user,{...record,author_uid:''}],
  ['no member linkage',session,user,null],
];
for(const [reason,s,u,m] of bad) {
 assert.equal(entitled(s,u,m),false,reason);
 if(u&&m){
  const viewer={level:s?.access_level||0,visitor:s?.identity_visitor_id||'',id:record.author_uid};
  assert.equal(resolveVerifiedPostitOwner(u,viewer,m),null,reason+' postit');
 }
}
assert.equal(resolveVerifiedPostitOwner(user,{...view,id:'00000000-0000-4000-8000-000000000099'},record),null);
assert.equal(resolveVerifiedPostitOwner(user,{...view,level:1},record),null);
const edge=readFileSync('scripts/staging/recovered-beagu-level-api-v5/index.ts','utf8');
for(const marker of ["admin.auth.getUser(match[1])","verifiedMemberTier(req,session)",
 "beagu_postit_member_accounts","identity_visitor_id", "beagu_has_earned_challenge_visitor"])
 assert.ok(edge.includes(marker),marker);
const postit=readFileSync('scripts/staging/recovered-beagu-postit-api-v4/index.ts','utf8');
for(const marker of ['beagu_postit_bind_verified_member','p_device_hash:await sha256(deviceSecret)',
  'await authenticatedUser(req)','resolveVerifiedPostitOwner(account,viewer,data)'])
 assert.ok(postit.includes(marker),marker);
const browserLevel=readFileSync('js/beagu-level-state-v1.js','utf8');
const browserShared=readFileSync('js/beagu-participation-auth-v2.js','utf8');
const browserMember=readFileSync('js/challenge-member-auth-v1.js','utf8');
for(const marker of ["Bearer '+bearer","result.level===3?3:","★ Lv3 · 인증 회원"])
 assert.ok(browserLevel.includes(marker),marker);
for(const marker of ["Bearer '+jwt","result.level>3","n<=3","★ Lv3 · 인증 회원"])
 assert.ok(browserShared.includes(marker),marker);
for(const marker of ["dataset.level||''","beagu:level-state-change"])
 assert.ok(browserMember.includes(marker),marker);
console.log('PASS: Lv3 requires earned Lv2, confirmed Auth user, exact bound visitor + active author');
console.log('PASS: unconfirmed/banned/deleted/foreign account, provisional level, revoked member never grant Lv3');
console.log('PASS: UI only forwards separate Auth JWT, backend determines tier; no bare-code Lv3 upgrade');
console.log('NOT TESTED: actual email confirmation or real Auth account E2E');
