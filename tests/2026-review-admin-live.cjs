const assert=require('node:assert/strict');
const url='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-2026-review-admin';
const request=(body,headers={})=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
(async()=>{
 const q=await request({action:'queue',filter:'all',page:0});
 assert.equal(q.status,401,'Anonymous review queue must deny read');
 const hold=await request({action:'hold',school_id:'0000000',payload_sha256:'0'.repeat(64),reason:'unauthorized hold attempt'});
 assert.equal(hold.status,401,'Anonymous review hold must deny writes');
 const fake=await request({action:'queue',filter:'all',page:0},{authorization:'Bearer invalid.jwt.token'});
 assert.equal(fake.status,401,'Fake bearer JWT must deny read');
 const foreign=await request({action:'queue',filter:'all',page:0},{origin:'https://untrusted.example'});
 assert.equal(foreign.status,403,'Foreign web origins must not access admin review');
 const get=await fetch(url,{method:'GET',signal:AbortSignal.timeout(15000)});
 assert.equal(get.status,405,'GET is not a review operation');
 const options=await fetch(url,{method:'OPTIONS',headers:{origin:'https://baeguindex.com'},signal:AbortSignal.timeout(15000)});
 assert.equal(options.status,204,'Authorized origin preflight should be allowed');
 console.log('PASS: deployed 2026 review admin refuses anonymous/fake JWT reads and writes; restrictive CORS and methods');
})().catch(e=>{console.error(e);process.exitCode=1;});
