import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {webcrypto} from "node:crypto";
const s=readFileSync("supabase/functions/beagu-postit-api-v1/index.ts","utf8");
const block=stripTypeScriptTypes(s.slice(s.indexOf("async function identity("),s.indexOf("async function minimumLevel(")));
const uid="20000000-0000-4000-8000-000000000001",token="a".repeat(64);
function fixture(reader,writer){const calls=[];const db={async rpc(name,args){calls.push(name);assert.match(args.p_token_sha,/^[a-f0-9]{64}$/);assert.notEqual(args.p_token_sha,token);return name==="beagu_locker_notification_actor_v1"?reader:writer;}};return {...new Function("db","crypto","UUID",block+"\nreturn {identity,verifiedMember}")(db,webcrypto,/^[0-9a-f-]{36}$/i),calls};}
const req=t=>new Request("https://example.invalid",{headers:{"x-beagu-level-session":t}});
for(const data of [{data:null},{error:true},{data:"invalid"}]){const f=fixture(data,{data:uid});assert.equal(await f.identity(req(token)),null);assert.equal(f.calls.length,1);}
const invalid=fixture({data:uid},{data:uid});assert.equal(await invalid.identity(req("invalid")),null);assert.equal(invalid.calls.length,0);
const good=fixture({data:uid},{data:uid});assert.equal((await good.verifiedMember(await good.identity(req(token)))).id,uid);
const suspended=fixture({data:uid},{data:null});assert.ok(await suspended.identity(req(token)));assert.equal(await suspended.verifiedMember(await suspended.identity(req(token))),null);
assert.doesNotMatch(s,/beagu_account_session_status_v1|beagu_account_level_session_allowed_v1|db\.auth\.getUser/);
assert.match(s,/beagu_postit_create_post_v3/);assert.match(s,/beagu_postit_create_comment_v3/);
console.log("PASS actual locker Edge uses existing Lv3 principal only");
