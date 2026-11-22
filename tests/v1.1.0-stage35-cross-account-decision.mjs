import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveVerifiedPostitOwner as authorize} from '../supabase/functions/_shared/postit-member-ownership.mjs';

// Entirely fictitious IDs: no staging or production Auth accounts are created.
// Exercise the actual pure authorization function used by the Post-it API,
// rather than a copy of its implementation.
const ids=[
 ['a','11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '99999999-9999-4999-8999-999999999999'],
 ['b','22222222-2222-4222-8222-222222222222',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '88888888-8888-4888-8888-888888888888']
];
const actors=ids.map(([label,user,visitor,author])=>({
 label,
 account:{id:user,email_confirmed_at:'2026-11-21T00:00:00Z',is_anonymous:false},
 viewer:{level:2,visitor,id:author},
 record:{auth_user_id:user,identity_visitor_id:visitor,author_uid:author,status:'active'}
}));
for(const a of actors){
 assert.deepEqual(authorize(a.account,a.viewer,a.record),{
   level:2,id:a.viewer.id,visitor:a.viewer.visitor,authId:a.account.id
 },'matching verified proofs authorize '+a.label);
}
let failures=0;
for(const a of actors)for(const b of actors)for(const c of actors){
 const permitted=a.label===b.label&&b.label===c.label;
 const actual=authorize(a.account,b.viewer,c.record);
 assert.equal(actual!==null,permitted,
   `A/B cross-account matrix: authenticated=${a.label}, level=${b.label}, row=${c.label}`);
 if(!permitted)failures++;
}
assert.equal(failures,6,'All six nonmatching account/visitor/row combinations rejected');

// Each field is independently required. Reject disabled and spoofed records.
const x=actors[0];
const variants=[
 [null,x.viewer,x.record],
 [x.account,null,x.record],
 [x.account,x.viewer,null],
 [{...x.account,email_confirmed_at:null},x.viewer,x.record],
 [{...x.account,is_anonymous:true},x.viewer,x.record],
 [x.account,{...x.viewer,level:1},x.record],
 [x.account,{...x.viewer,level:3,visitor:actors[1].viewer.visitor},x.record],
 [x.account,{...x.viewer,id:actors[1].viewer.id},x.record],
 [x.account,x.viewer,{...x.record,status:'suspended'}],
 [x.account,x.viewer,{...x.record,auth_user_id:actors[1].account.id}],
 [x.account,x.viewer,{...x.record,identity_visitor_id:actors[1].viewer.visitor}],
 [x.account,x.viewer,{...x.record,author_uid:actors[1].viewer.id}],
 [x.account,x.viewer,{...x.record,auth_user_id:null}],
 [x.account,x.viewer,{...x.record,identity_visitor_id:null}],
 [x.account,x.viewer,{...x.record,author_uid:null}],
 [x.account,{...x.viewer,level:'2'},x.record]
];
for(const [account,viewer,record] of variants){
 assert.equal(authorize(account,viewer,record),null,'Spoofed, unverified or suspended proof rejected');
}
const postit=readFileSync('supabase/functions/beagu-postit-api-v1/index.ts','utf8');
assert.match(postit,/import \{ resolveVerifiedPostitOwner \} from "\.\.\/_shared\/postit-member-ownership\.mjs";/);
assert.match(postit,/\.select\("auth_user_id,author_uid,identity_visitor_id,status"\)/);
assert.match(postit,/\.eq\("auth_user_id",account\.id\)\.eq\("identity_visitor_id",viewer\.visitor\)/);
assert.match(postit,/return resolveVerifiedPostitOwner\(account,viewer,data\)/);
assert.match(postit,/if\(!user\)return fail\(req,"WRITER_IDENTITY_REQUIRED",403\)/);
assert.match(postit,/if\(t\.author_uid!==user\.id\)return fail\(req,"NOT_OWNER",403\)/);

console.log('PASS: 2 authenticated fake identities, 8 A/B combinations (2 valid, 6 denied) and 16 spoof/disabled proofs fail closed.');
console.log('SCOPE: execution of production-used pure authorization; NOT real Supabase two-account Auth HTTP E2E.');
