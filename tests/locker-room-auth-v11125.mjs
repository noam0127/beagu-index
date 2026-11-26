import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import {webcrypto} from "node:crypto";
const source=readFileSync(new URL("../supabase/functions/beagu-postit-api-v1/index.ts",import.meta.url),"utf8");
const start=source.indexOf("async function identity("),end=source.indexOf("async function minimumLevel(");
assert.ok(start>=0&&end>start);
const gate=stripTypeScriptTypes(source.slice(start,end));
const actor="20000000-0000-4000-8000-000000000001";
const token="a".repeat(64);
function fixture(options={}){
 const calls=[];
 const db={
  from(table){assert.equal(table,"beagu_level_sessions");return {select(){return this},eq(k,v){assert.equal(k,"token_sha256");assert.match(v,/^[a-f0-9]{64}$/);assert.notEqual(v,token);return this},gt(k){assert.equal(k,"expires_at");return this},async maybeSingle(){return options.expired?{data:null}:{data:{access_level:options.level??2,identity_campaign:"2026",identity_visitor_id:"fixture"}}}}},
  async rpc(name,args){calls.push(name);if(name==="beagu_has_earned_challenge_visitor"){assert.equal(args.p_visitor,"fixture");return {data:options.earned!==false}}
   assert.match(args.p_token_sha,/^[a-f0-9]{64}$/);
   if(name==="beagu_account_level_session_allowed_v1")return options.rpcMissing?{error:true}:{data:options.allowed!==false};
   if(name==="beagu_account_session_status_v1")return {data:options.account===false?null:{level:2,lv2_active:options.active!==false}};
   if(name==="beagu_account_postit_writer_v1")return {data:options.restricted?null:actor};
   throw Error("unexpected RPC "+name);
  }
 };
 const f=new Function("db","crypto","UUID",gate+"\nreturn {identity,verifiedMember};")(db,webcrypto,/^[0-9a-f-]{36}$/i);
 return {...f,calls};
}
const req=(t=token)=>new Request("https://example.invalid",{headers:{"x-beagu-level-session":t}});
for(const options of [{expired:true},{level:1},{rpcMissing:true},{allowed:false},{earned:false},{account:false},{active:false}]){
 const f=fixture(options);
 assert.equal(await f.identity(req()),null);
 assert.equal(f.calls.includes("beagu_account_postit_writer_v1"),false);
}
const invalid=fixture();assert.equal(await invalid.identity(req("bad")),null);assert.equal(invalid.calls.length,0);
const good=fixture();const viewer=await good.identity(req());assert.equal(viewer.level,2);assert.equal((await good.verifiedMember(viewer)).id,actor);
const restricted=fixture({restricted:true});assert.ok(await restricted.identity(req()));assert.equal(await restricted.verifiedMember(await restricted.identity(req())),null);
assert.match(source,/beagu_postit_create_post_v3/);
assert.match(source,/textCheck\(body\?\.text,300\)/);
assert.doesNotMatch(source,/db\.auth\.getUser/);
console.log("locker-room API auth adapter: mocked contract checks passed");
