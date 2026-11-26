// Exercise actual Edge response projection, not just the standalone policy.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
const source=readFileSync(new URL("../supabase/functions/beagu-postit-api-v1/index.ts",import.meta.url),"utf8");
const start=source.indexOf("async function enrich("),end=source.indexOf("// Quotas and duplicate handling",start);
assert.ok(start>=0&&end>start);
const db={from(name){assert.ok(["beagu_postit_reactions","beagu_locker_visible_comments_v1"].includes(name));return {select(){return this},eq(){return this},in(){return this},async limit(){return {data:[],error:null}}};}};
const enrich=new Function("db","schoolInfo","GAMES",stripTypeScriptTypes(source.slice(start,end))+"\nreturn enrich;")(db,async()=>({}),{});
const base={id:"post1",author_uid:"private-actor",body:"fixture",created_at:"2026-11-26T00:00:00Z",subject_type:"general",admin_user_id:"secret-admin",token_sha256:"secret-session"};
const fixtures=[
 {...base,locker_nickname:"카리브해매너티",locker_operator:true},
 {...base,id:"post2",locker_nickname:"카리브해매너티",locker_operator:false},
 {...base,id:"post3",locker_nickname:"세터 2",locker_operator:false},
 {...base,id:"post4",locker_nickname:"세터",locker_operator:true},
 {...base,id:"post5",locker_nickname:null,locker_operator:false},
 {...base,id:"post6",locker_nickname:"<script>",locker_operator:false}
];
for(const type of ["post","comment"]){
 const items=await enrich(fixtures,type,"private-actor");
 assert.deepEqual(items.map(x=>[x.nickname,x.is_operator]),[["카리브해매너티",true],["익명",false],["세터 2",false],["세터",false],["익명",false],["익명",false]]);
 for(const x of items){
  assert.equal(x.mine,true);
  for(const key of ["author_uid","admin_user_id","token_sha256","locker_nickname","locker_operator"])assert.equal(key in x,false);
  assert.doesNotMatch(JSON.stringify(x),/private-actor|secret-admin|secret-session/);
 }
 assert.equal((await enrich([base],type,"different-actor"))[0].mine,false);
}
const create=source.slice(source.indexOf('if(action==="create_post")'),source.indexOf('if(action==="toggle_like"'));
assert.doesNotMatch(create,/body\?\.(?:author_uid|nickname|locker_nickname|locker_operator|is_operator|admin_user_id)/);
assert.match(create,/p_actor:user\.id/);
assert.match(source,/if\(t\.author_uid!==user\.id\)return fail\(req,"NOT_OWNER",403\)/);
console.log("PASS real Edge projection: trusted operator only, private fields excluded, author identity not client-selectable");
