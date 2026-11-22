// Stage35: source-level member/administrator ownership contracts.
// These checks guard regression only; DO NOT label as real two-account E2E.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const postit=readFileSync('supabase/functions/beagu-postit-api-v1/index.ts','utf8');
const admin=readFileSync('supabase/functions/beagu-admin-members-v1/index.ts','utf8');
const level=readFileSync('supabase/functions/beagu-level-api/index.ts','utf8');

const contains=(source,pattern,message)=>assert.match(source,pattern,message);
const ordered=(source,a,b,label)=>{
  const x=source.indexOf(a),y=source.indexOf(b);
  assert.ok(x>=0&&y>=0&&x<y,label);
};

// An untrusted participation code only yields a pseudonymous reader session.
contains(postit,/\.eq\("token_sha256",hash\)\.gt\("expires_at"/,
  'Post-it must use hashed, unexpired server session');
contains(postit,/if\(error\|\|!data\|\|Number\(data\.access_level\)<minLevel\)return null/,
  'Post-it denies missing or under-level session');
contains(postit,/beagu_has_earned_challenge_visitor/,
  'Earned referral rights must be independently revalidated');
contains(postit,/db\.auth\.getUser\(jwt\)/,
  'Post-it writer identity must be verified via Supabase Auth');
contains(postit,/if\(error\|\|!eligiblePostitAuthUser\(user\)\)return null/,
  'Anonymous, unconfirmed, banned or deleted accounts cannot become writers');

// A confirmed user must own the exact active challenge visitor identity.
// An ID supplied in the request is NEVER sufficient for account ownership.
contains(postit,/\.eq\("auth_user_id",account\.id\)\.eq\("identity_visitor_id",viewer\.visitor\)/,
  'Require independent Auth user AND challenge-visitor matching');
contains(postit,/\.eq\("status","active"\)\.maybeSingle\(\)/,
  'Require active member connection');
contains(postit,/return resolveVerifiedPostitOwner\(account,viewer,data\)/,
  'Writer must be authorized by a fail-closed three-way server-side match');
contains(postit,/if\(!user\)return fail\(req,"WRITER_IDENTITY_REQUIRED",403\)/,
  'Post-it mutation requires verified writer');
ordered(postit,'const user=await verifiedMember(req,viewer);','if(action==="create_post")',
  'Create post must be behind verified member gate');
ordered(postit,'const user=await verifiedMember(req,viewer);','if(action==="create_comment")',
  'Create comment must be behind verified member gate');
ordered(postit,'const user=await verifiedMember(req,viewer);','if(action==="toggle_like"',
  'Like/report/remove must be behind verified member gate');
contains(postit,/if\(t\.author_uid!==user\.id\)return fail\(req,"NOT_OWNER",403\)/,
  'Removing a Post-it requires verified record ownership');
contains(postit,/\.eq\("id",id\)\.eq\("author_uid",user\.id\)/,
  'Delete/update operation must bind the original author ID');
contains(postit,/\.eq\("author_uid",user\.id\)\.eq\("status","published"\)/,
  'Removal must require that the record is still published at update time');
contains(postit,/\.select\("id"\)\.maybeSingle\(\)/,
  'Removal must check the actual affected row');
contains(postit,/if\(!removed\)return fail\(req,"TARGET_UNAVAILABLE",404\)/,
  'No affected row must not be reported as successful removal');
ordered(postit,'if(!removed)return fail(req,"TARGET_UNAVAILABLE",404);',
  'return respond(req,{removed:true});',
  'Return removal success only after confirming the row changed');

// Admin claims are never taken from the request body or unverified user metadata.
contains(admin,/await db\.auth\.getUser\(token\)/,
  'Admin token signature and user must be verified');
contains(admin,/claims\?\.sub !== id \|\| !claims\?\.session_id/,
  'Admin claims must match verified token subject and contain session ID');
contains(admin,/\.eq\("user_id", id\)\.maybeSingle\(\)/,
  'Admin account must be resolved for verified identity, not caller-supplied ID');
contains(admin,/if \(!account\?\.enabled\)/,
  'Disabled admin must not access management routes');
contains(admin,/claims\.aal !== "aal2"/,
  'MFA assurance level 2 required');
contains(admin,/beagu_admin_active_mfa_session/,
  'Admin session revocation/status must be checked server-side');
ordered(admin,'const actor = await checkAdmin(request);','const action = String(input.action ||',
  'Do not dispatch admin action before authenticating and authorizing');
contains(admin,/if \(actor\.role !== "owner"\) throw new HttpError\(403, "owner_required"\)/,
  'Only owner may moderate members');
contains(admin,/if \(id === actor\.id\)/,
  'Prevent admin self-moderation');
contains(admin,/if \(admins\.has\(id\)\)/,
  'Prevent account moderation of other admins');

// Lv3 cannot be manufactured through request fields or a legacy level code.
contains(level,/const session=await check\(req\)/,
  'Level verification must be backed by server-issued session');
assert.doesNotMatch(level,/(?:body\.level|body\.access_level)\s*[>=]=?\s*3/,
  'Do not authorize Lv3 by trusting body level claims');
for(const [name,source] of [['Post-it',postit],['Admin',admin],['Level',level]]){
  assert.doesNotMatch(source,/(?:user_metadata|raw_user_meta_data)\s*\./,
    name+' must not use user-editable metadata for authorization');
}
console.log('PASS: writer account-visitor-author binding, owner-only mutation, verified administrator MFA.');
console.log('SCOPE: static contracts; prior A/B Auth binding HTTP passed, but actual post deletion HTTP E2E remains pending.');
