// Disposable local HTTP integration: actual handler code, real Supabase JS SDK,
 // real PostgREST + PostgreSQL; only admin Auth user verification is a synthetic fixture.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHmac,randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const base='http://127.0.0.1:18791',rest='http://127.0.0.1:18790';
const signing='fixture-local-jwt-secret-do-not-use-in-production-2026',admin='00000000-0000-0000-0000-000000000001';
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function jwt(role,extra={}){const h=b64({alg:'HS256',typ:'JWT'}),p=b64({role,exp:Math.floor(Date.now()/1000)+3600,...extra});return h+'.'+p+'.'+createHmac('sha256',signing).update(h+'.'+p).digest('base64url');}
const service=jwt('service_role'),anon=jwt('anon'),owner=jwt('authenticated',{sub:admin,aal:'aal2',session_id:'fixture-session'}),weak=jwt('authenticated',{sub:admin,aal:'aal1',session_id:'fixture-session'});
const temp=await mkdtemp(join(process.cwd(),'.account-http-'));
const handlers=new Map();let registering='';
globalThis.Deno={env:{get:k=>({SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:service,BEAGU_ACCOUNT_PASSWORD_PEPPER_V1:'fixture-only-account-pepper-32-bytes-minimum'})[k]},serve:fn=>{handlers.set(registering,fn)}};
const server=createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,base),chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
  const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
  let out;
  if(u.pathname==='/auth/v1/user'){
   const ok=[owner,weak].includes(headers.get('authorization')?.replace(/^Bearer /,''));
   out=Response.json(ok?{id:admin,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}:{message:'invalid fixture session'},{status:ok?200:401});
  }else if(u.pathname.startsWith('/rest/v1/')){
   for(const k of ['host','content-length','connection','accept-encoding'])headers.delete(k);
   out=await fetch(rest+u.pathname.slice('/rest/v1'.length)+u.search,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body}:{})});
  }else{
   const handler=handlers.get(u.pathname);
   if(!handler){res.writeHead(404);res.end();return;}
   out=await handler(new Request(u,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body}:{})}));
  }
  const h=Object.fromEntries(out.headers);delete h['content-encoding'];delete h['content-length'];res.writeHead(out.status,h);res.end(Buffer.from(await out.arrayBuffer()));
 }catch{res.writeHead(500);res.end('fixture transport error');}
});
const digest=v=>createHash('sha256').update(v).digest('hex');
try{
 for(const [name,path,pkg] of [
  ['/account','supabase/functions/beagu-account-v1/index.ts','@supabase/supabase-js'],
  ['/postit','supabase/functions/beagu-postit-api-v1/index.ts','supabase-fixture-257'],
  ['/admin','supabase/functions/beagu-admin-members-v1/index.ts','@supabase/supabase-js']]){
  registering=name;const raw=await readFile(path,'utf8');
  // Import the same pinned SDK via npm instead of CDN/Deno specifier. Handler logic is unchanged.
  const src=raw.replace(/import\s*\{\s*createClient\s*\}\s*from\s*"[^"]+";/,()=> 'import {createClient} from "'+pkg+'";');
  assert.notEqual(src,raw);const file=join(temp,name.slice(1)+'.mts');await writeFile(file,src);await import(pathToFileURL(file).href);
 }
 await new Promise((r,j)=>{server.once('error',j);server.listen(18791,'127.0.0.1',r);});
 async function call(path,body,status,{token='',auth='',method='POST'}={}){
  const response=await fetch(base+path,{method,headers:{Origin:'https://baeguindex.com','Content-Type':'application/json',...(token?{'X-Beagu-Session':token,'X-Beagu-Level-Session':token}:{}),...(auth?{Authorization:'Bearer '+auth}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const data=await response.json();assert.equal(response.status,status,path+' '+(body?.action||'')+' '+JSON.stringify(data));
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.doesNotMatch(JSON.stringify(data),/"(?:author_uid|visitor_id|recovery_hash|password_hash|auth_user_id)"/);
  return data;
 }
 const a='SYNTHETIC-ONE',b='SYNTHETIC-TWO',pw='fixture-password-123',old='7KMXF9TDW4NPQ',next='8RYH6ZB3W7KMP';
 const signup=(code,deviceSecret,new_recovery)=>call('/account',{action:'signup',account_id:code,code,deviceSecret,new_recovery,password:pw},201);
 assert.equal((await signup(a,'a'.repeat(64),old)).level,2);
 assert.equal((await signup(b,'b'.repeat(64),'9KMTH8RDW3NPQ')).lv2_active,true);
 const login=async(code,password=pw)=>call('/account',{action:'password_login',account_id:code,password},200);
 const one=await login(a),two=await login(b);assert.match(one.token,/^[a-f0-9]{64}$/);
 const nonce=randomUUID(),create={action:'create_post',subject_type:'game',game_slug:'teacher-volleyball',text:'synthetic report target',request_id:nonce};
 const post=await call('/postit',create,201,{token:one.token});
 const mine=await call('/postit?action=posts',null,200,{method:'GET',token:one.token});assert.equal(mine.posts[0].mine,true);assert.equal(mine.posts[0].nickname,one.nickname);
 await call('/postit',{action:'report',target_type:'post',target_id:post.id},200,{token:two.token});
 await call('/admin',{action:'report_queue'},401);await call('/admin',{action:'report_queue'},403,{auth:weak});
 const queue=await call('/admin',{action:'report_queue'},200,{auth:owner});assert.equal(queue.data.rows[0].target_id,post.id);assert.equal(queue.data.rows[0].reports,1);assert.doesNotMatch(JSON.stringify(queue),/SYNTHETIC-ONE|SYNTHETIC-TWO/);
 const decision={action:'report_decide',target_type:'post',target_id:post.id,decision:'restrict_24h',reason:'synthetic review reason'};
 await call('/admin',decision,200,{auth:owner});
 assert.equal((await call('/postit?action=writer_status',null,200,{method:'GET',token:one.token})).linked,false);
 await call('/postit',create,403,{token:one.token});
 await call('/postit?action=posts',null,200,{method:'GET',token:one.token});
 assert.equal((await call('/account',{action:'status'},200,{token:one.token})).lv2_active,true);
 await call('/admin',{...decision,decision:'restore'},200,{auth:owner});
 assert.equal((await call('/postit?action=writer_status',null,200,{method:'GET',token:one.token})).linked,true);
 assert.equal((await call('/postit',create,200,{token:one.token})).id,post.id);
 await call('/account',{action:'recover',account_id:a,password:'fixture-new-password-123',recovery:old,new_recovery:next},200);
 await call('/account',{action:'status'},401,{token:one.token});
 await call('/account',{action:'recover',account_id:a,password:pw,recovery:old,new_recovery:'6KMXF9TDW4NPQ'},403);
 const again=await login(a,'fixture-new-password-123');
 const after=await call('/postit?action=posts',null,200,{method:'GET',token:again.token});assert.equal(after.posts[0].mine,true);assert.equal(after.posts[0].id,post.id);
 assert.equal(again.nickname,one.nickname);
 // Direct Data API with an unprivileged JWT must deny credential and moderation RPCs.
 const forbidden=await fetch(rest+'/rpc/beagu_postit_report_queue_v1',{method:'POST',headers:{Authorization:'Bearer '+anon,'Content-Type':'application/json'},body:'{}'});assert.ok([401,403,404].includes(forbidden.status));
 const denied=await fetch(rest+'/beagu_postit_posts?select=author_uid',{headers:{Authorization:'Bearer '+anon}});assert.ok([401,403,404].includes(denied.status));
 console.log('PASS real HTTP + PostgREST + PostgreSQL: signup, login, report, owner moderation, read preserved, restore, recovery revocation, ownership and anon denial');
}finally{server.closeAllConnections?.();server.close();await rm(temp,{recursive:true,force:true});delete globalThis.Deno;}
