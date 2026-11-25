import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGitHubReader,createStatusVerifier} from '../supabase/functions/beagu-release-manager-v1/verification.mjs';
const response=(status,headers={},body={})=>new Response(JSON.stringify(body),{status,headers});
test('retry a temporary 503 once; use read credential only for GET',async()=>{
 let n=0,waits=[];const read=createGitHubReader({baseUrl:'https://fixture.invalid',token:'fixture',sleep:async ms=>waits.push(ms),fetcher:async(u,o)=>{assert.equal(o.headers.Authorization,'Bearer fixture');assert.equal(o.method,undefined);return ++n===1?response(503):response(200,{}, {ok:true});}});
 assert.deepEqual(await read('/compare'),{ok:true});assert.equal(n,2);assert.deepEqual(waits,[750]);
});
test('rate limit honors reset and never loops; 403 permission is distinct',async()=>{
 let now=1000000,n=0;const read=createGitHubReader({baseUrl:'https://fixture.invalid',clock:()=>now,fetcher:async()=>{n++;return n===1?response(429,{'retry-after':'90'}):response(403);}});
 await assert.rejects(read('/a'),/github_rate_limited/);now+=89000;await assert.rejects(read('/b'),/github_rate_limited/);assert.equal(n,1);now+=1000;await assert.rejects(read('/b'),/github_access_denied/);assert.equal(n,2);
});
test('status cache isolates base, candidate and metadata; expires; invalidation; negative not cached',async()=>{
 let now=1000,n=0,mode='ok';const s={production_sha:'a'.repeat(40),draft_sha:'b'.repeat(40),draft_version:'v1.11.14',draft_summary:'fire'};
 const v=createStatusVerifier({clock:()=>now,verify:async()=>{n++;if(mode==='fail')throw Error('github_rate_limited');return {version:'v1.11.14',summary:'fire'};}});
 assert.equal((await v.check(s,false)).ready,null);const pair=await Promise.all([v.check(s,true),v.check(s,true)]);assert.ok(pair.every(x=>x.ready));assert.equal(n,1);
 assert.equal((await v.check(s,false)).checkedAt,1000);assert.equal((await v.check({...s,draft_sha:'c'.repeat(40)},false)).ready,null);assert.equal((await v.check({...s,production_sha:'c'.repeat(40)},false)).ready,null);assert.equal((await v.check({...s,draft_summary:'changed'},true)).reason,'direct_version_mismatch');assert.equal(n,2);
 now+=60000;assert.equal((await v.check(s,false)).ready,null);mode='fail';assert.equal((await v.check(s,true)).reason,'github_rate_limited');assert.equal((await v.check(s,true)).ready,false);assert.equal(n,4);
 mode='ok';v.remember(s,{version:s.draft_version,summary:s.draft_summary});assert.equal((await v.check(s,false)).ready,true);v.invalidate(s);assert.equal((await v.check(s,false)).ready,null);
});
test('production gate still reads live GitHub; owner and worker authorization unchanged',()=>{
 const code=readFileSync('supabase/functions/beagu-release-manager-v1/index.ts','utf8');const apply=code.slice(code.indexOf('if(action==="prod_direct_apply")'),code.indexOf('}else if(action==="prod_rollback")'));
 assert.match(apply,/verification.invalidate\(s\);\s*const candidate=await directCandidate/);assert.doesNotMatch(apply,/verification\.check|verification\.remember/);assert.match(apply,/confirmed_direct!==true/);assert.match(code,/c\?\.aal!=="aal2"/);assert.match(code,/beagu_admin_active_mfa_session/);assert.match(code,/payload\.ref==="refs\/heads\/main"/);assert.match(code,/if\(!userId\)return error\("admin_mfa_required",403/);
});
