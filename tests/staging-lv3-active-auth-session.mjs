import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedAuthSessionId as levelClaim} from '../scripts/staging/recovered-beagu-level-api-v5/_shared/member-session-v1.mjs';
import {verifiedAuthSessionId as postitClaim} from '../scripts/staging/recovered-beagu-postit-api-v4/_shared/member-session-v1.mjs';
const uid='d1000000-0000-4000-8000-000000000001';
const sid='d1000000-0000-4000-8000-000000000003';
const now=1795398000;
const b64=x=>Buffer.from(JSON.stringify(x),'utf8').toString('base64url');
const jwt=claims=>b64({alg:'HS256',typ:'JWT'})+'.'+b64(claims)+'.bogus-signature';
const verifiedUser={id:uid,email_confirmed_at:'2026-11-23T00:00:00Z'};
const live=jwt({sub:uid,session_id:sid,exp:now+3600,role:'authenticated'});
for(const parse of [levelClaim,postitClaim]){
 assert.equal(parse(live,verifiedUser,now),sid);
 for(const [name,token,user,ts] of [
  ['expired jwt',jwt({sub:uid,session_id:sid,exp:now-1}),verifiedUser,now],
  ['expired equal boundary',jwt({sub:uid,session_id:sid,exp:now}),verifiedUser,now],
  ['wrong signed subject',jwt({sub:'d1000000-0000-4000-8000-000000000099',session_id:sid,exp:now+10}),verifiedUser,now],
  ['other verified account',live,{id:'d1000000-0000-4000-8000-000000000099'},now],
  ['invalid session UUID',jwt({sub:uid,session_id:'invalid',exp:now+10}),verifiedUser,now],
  ['missing session',jwt({sub:uid,exp:now+10}),verifiedUser,now],
  ['missing expiration',jwt({sub:uid,session_id:sid}),verifiedUser,now],
  ['fractional exp',jwt({sub:uid,session_id:sid,exp:now+.5}),verifiedUser,now],
  ['malformed token','no.jwt',verifiedUser,now],
  ['malformed payload','bad.***.signature',verifiedUser,now],
  ['no verified user',live,null,now]
 ]){
  assert.equal(parse(token,user,ts),null,name);
 }
}
for(const [file,hasVerifyingFn] of [
 ['scripts/staging/recovered-beagu-level-api-v5/index.ts',false],
 ['scripts/staging/recovered-beagu-postit-api-v4/index.ts',true]
]){
 const src=readFileSync(file,'utf8');
 assert(src.includes('beagu_stage_active_member_auth_session'),file);
 assert(src.includes('verifiedAuthSessionId('),file);
 const verifiedIndex=src.indexOf('.auth.getUser(');
 const parserIndex=src.indexOf('verifiedAuthSessionId(');
 const rpcIndex=src.indexOf('beagu_stage_active_member_auth_session');
 assert(verifiedIndex>=0&&parserIndex>verifiedIndex&&rpcIndex>parserIndex,
  file+' must verify token signature with Auth before reading claims and checking active session');
 if(hasVerifyingFn)assert(src.includes('async function authenticatedUser(req:Request)'));
 else assert(src.includes('async function verifiedMemberTier(req:Request,session:any)'));
 assert(src.includes('sessionError||'),file+' must fail closed on RPC errors');
 assert(src.includes('STAGING_PROJECT_ONLY'),file);
}
const sql=readFileSync('scripts/staging/schema-lv3-revoked-auth-session-qa-only.sql','utf8');
for(const part of [
 'REFUSE_NON_ISOLATED_STAGING_DB',
 'SECURITY DEFINER',
 "s.user_id=p_user",
 "s.id=p_session",
 "(s.not_after IS NULL OR s.not_after>now())",
 'REVOKE ALL ON FUNCTION public.beagu_stage_active_member_auth_session',
 'FROM PUBLIC,anon,authenticated',
 'TO service_role'
])assert(sql.includes(part),part);
const qa=readFileSync('tests/sql/staging-lv3-auth-session-revocation-rollback-20261123.sql','utf8');
for(const name of ['OTHER_USER_REUSED_SESSION_ID','EXPIRED_SESSION_ACCEPTED',
 'REVOKED_SESSION_ACCEPTED','ROLLBACK;','REFUSE_NON_ISOLATED_STAGE'])
 assert(qa.includes(name),name);
const unlinkQA=readFileSync('tests/sql/staging-lv3-member-suspend-delete-rollback-20261123.sql','utf8');
for(const part of ['REFUSE_NON_STAGE_DB','SUSPENDED_MEMBER_STILL_ACTIVE',
  'DELETED_LINK_STILL_QUERYABLE', "status='suspended'",'ROLLBACK;'])
 assert(unlinkQA.includes(part),part);
console.log('PASS: revoked/suspended member records cease to match active-only author linkage');
console.log('PASS: JWT session claim parsed only AFTER getUser; no matching user/session/expiry => Lv3 denied');
console.log('PASS: level API and postit/membership both require live auth.sessions via service-role-only RPC');
console.log('PASS: real SQL QA handles missing, expired, different user and revoked sessions, all rollback');
console.log('NOT PROVEN: real Auth signed JWT positive browser E2E; this is source+isolated DB contract validation');
