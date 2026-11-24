// Local Supabase only. Real GoTrue, gateway, Edge Runtime, PostgREST and PostgreSQL.
// Synthetic secrets/state are confined to the runner temp directory. Never upload them.
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const config=JSON.parse(await readFile(process.env.BEAGU_LOCAL_STATUS,'utf8'));
const base=config.API_URL,service=config.SERVICE_ROLE_KEY,anon=config.ANON_KEY;
assert.match(base,/^http:\/\/(?:127\.0\.0\.1|localhost):54321$/);
assert.ok(service&&anon);
const opt={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const privileged=createClient(base,service,opt);
const browser=createClient(base,anon,opt);
const statePath=process.env.BEAGU_LOCAL_STATE;
const phase=process.argv[2];
const pw='fixture-only-original-password-123',replacement='fixture-only-replacement-password-456';
const a='SYNTHETIC-ONE',b='SYNTHETIC-TWO',old='7KMXF9TDW4NPQ',next='8RYH6ZB3W7KMP';
const adminEmail='fixture-owner@example.com',adminPassword='fixture-owner-password-123';
function ok(result){if(result.error)throw Error('fixture operation failed: '+(result.error.code||result.error.name||'unknown'));return result.data;}
function otp(secret){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,v=0;const bytes=[];
 for(const c of secret.toUpperCase().replace(/=+$/,'')){const n=alphabet.indexOf(c);assert.ok(n>=0);v=(v<<5)|n;bits+=5;if(bits>=8){bits-=8;bytes.push((v>>bits)&255);}}
 const time=Buffer.alloc(8);time.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const digest=createHmac('sha1',Buffer.from(bytes)).update(time).digest(),offset=digest.at(-1)&15;
 return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
async function call(fn,body,status,{token='',auth='',query='',method='POST'}={}){
 const r=await fetch(base+'/functions/v1/'+fn+query,{method,headers:{Origin:'https://baeguindex.com','Content-Type':'application/json',...(token?{'X-Beagu-Session':token,'X-Beagu-Level-Session':token}:{}),...(auth?{Authorization:'Bearer '+auth}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 assert.equal(r.status,status,fn+' '+(body?.action||query)+' unexpected HTTP status');const data=await r.json();
 assert.doesNotMatch(JSON.stringify(data),/"(?:author_uid|visitor_id|auth_user_id|password_hash|recovery_hash)"/);
 return data;
}
const account=(body,status,token='')=>call('beagu-account-v1',body,status,{token});
const posts=token=>call('beagu-postit-api-v1',null,200,{token,query:'?action=posts',method:'GET'});
const writer=token=>call('beagu-postit-api-v1',null,200,{token,query:'?action=writer_status',method:'GET'});
const adminCall=(body,status,auth='')=>call('beagu-admin-members-v1',body,status,{auth});
const login=(id,password=pw)=>account({action:'password_login',account_id:id,password},200);
async function signInAdmin(){
 const session=ok(await browser.auth.signInWithPassword({email:adminEmail,password:adminPassword})).session;
 const before=session.access_token;
 const factors=ok(await browser.auth.mfa.listFactors());
 let factor=factors.totp.find(f=>f.status==='verified'),secret;
 if(!factor){const enrollment=ok(await browser.auth.mfa.enroll({factorType:'totp',friendlyName:'fixture-only'}));factor={id:enrollment.id};secret=enrollment.totp.secret;await writeFile(statePath+'.totp',secret,{mode:0o600});}
 else secret=await readFile(statePath+'.totp','utf8');
 // Avoid a TOTP boundary when issuing a challenge.
 if(Date.now()%30000>27000)await new Promise(r=>setTimeout(r,3500));
 const challenge=ok(await browser.auth.mfa.challenge({factorId:factor.id}));
 const verified=ok(await browser.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:otp(secret)}));
 const token=verified.access_token;assert.ok(token);
 assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).aal,'aal2');
 return {before,token};
}
if(phase==='seed'){
 const admin=ok(await privileged.auth.admin.createUser({email:adminEmail,password:adminPassword,email_confirm:true})).user;
 const legacy=ok(await privileged.auth.admin.createUser({email:'fixture-legacy@example.com',password:pw,email_confirm:true})).user;
 assert.match(admin.id,/^[0-9a-f-]{36}$/);assert.match(legacy.id,/^[0-9a-f-]{36}$/);
 await writeFile(statePath,JSON.stringify({admin:admin.id,legacy:legacy.id}),{mode:0o600});
 console.log('PASS actual local Auth users created for synthetic admin and legacy migration');
}else if(phase==='before'){
 const state=JSON.parse(await readFile(statePath,'utf8'));
 await account({action:'password_login',account_id:a,password:pw},401);
 const legacyToken='e'.repeat(64),referralOnly='f'.repeat(64);
 assert.deepEqual(await writer(legacyToken),{linked:false,readable:false});
 for(const action of ['posts','comments','schools','school_info'])assert.equal((await call('beagu-postit-api-v1',null,403,{token:legacyToken,query:'?action='+action,method:'GET'})).error,'ACCOUNT_REQUIRED');
 await call('beagu-postit-api-v1',null,403,{token:referralOnly,query:'?action=posts',method:'GET'});
 await call('beagu-postit-api-v1',{action:'create_post',subject_type:'game',game_slug:'teacher-volleyball',text:'fixture denied'},403,{token:legacyToken});
 for(const [code,deviceSecret,new_recovery] of [[a,'a'.repeat(64),old],[b,'b'.repeat(64),'9KMTH8RDW3NPQ']]){
  const r=await account({action:'signup',account_id:code,code,deviceSecret,new_recovery,password:pw},201);assert.equal(r.lv2_active,true);
 }
 const one=await login(a),two=await login(b);
 assert.deepEqual(await writer(two.token),{linked:true,readable:true});
 assert.equal((await call('beagu-postit-api-v1',null,403,{token:legacyToken,query:'?action=posts',method:'GET'})).error,'ACCOUNT_REQUIRED');
 const create={action:'create_post',subject_type:'game',game_slug:'teacher-volleyball',text:'synthetic runtime report target',request_id:randomUUID()};
 const post=await call('beagu-postit-api-v1',create,201,{token:one.token});
 const mine=await posts(one.token);assert.ok(mine.posts.some(p=>p.id===post.id&&p.mine&&p.nickname===one.nickname));
 const legacy=await posts(two.token);assert.ok(legacy.posts.some(p=>p.id==='70000000-0000-4000-8000-000000000002'&&p.mine));
 await call('beagu-postit-api-v1',{action:'report',target_type:'post',target_id:post.id},200,{token:two.token});
 await adminCall({action:'report_queue'},401);
 const auth=await signInAdmin();
 await adminCall({action:'report_queue'},403,auth.before);
 const queue=await adminCall({action:'report_queue'},200,auth.token);assert.ok(queue.data.rows.some(p=>p.target_id===post.id&&p.reports===1));assert.doesNotMatch(JSON.stringify(queue),/SYNTHETIC-ONE|SYNTHETIC-TWO|fixture-owner|fixture-legacy/);
 const decision={action:'report_decide',target_type:'post',target_id:post.id,decision:'restrict_24h',reason:'synthetic review reason'};
 await adminCall(decision,200,auth.token);assert.deepEqual(await writer(one.token),{linked:false,readable:true});
 await call('beagu-postit-api-v1',create,403,{token:one.token});await posts(one.token);
 await adminCall({...decision,decision:'restore'},200,auth.token);assert.equal((await writer(one.token)).linked,true);
 await account({action:'recover',account_id:a,password:replacement,recovery:old,new_recovery:next},200);
 await account({action:'status'},401,one.token);
 const current=await login(a,replacement);assert.equal(current.nickname,one.nickname);
 // Real Auth deletion only on disposable stack. Pseudonymous bridge and content must survive.
 ok(await privileged.auth.admin.deleteUser(state.legacy));
 assert.ok((await posts(two.token)).posts.some(p=>p.id==='70000000-0000-4000-8000-000000000002'&&p.mine));
 // An actual revoked AAL2 session must fail the live auth.sessions check.
 ok(await browser.auth.signOut({scope:'global'}));await adminCall({action:'report_queue'},401,auth.token);
 const denied=await fetch(base+'/rest/v1/rpc/beagu_postit_report_queue_v1',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+anon,'Content-Type':'application/json'},body:'{}'});assert.ok([401,403,404].includes(denied.status));
 await writeFile(statePath,JSON.stringify({...state,post:post.id,nonce:create.request_id,oldToken:one.token,currentToken:current.token,nick:current.nickname,revokedAdmin:auth.token}),{mode:0o600});
 console.log('PASS actual Supabase gateway/Edge runtime, real TOTP MFA and signout revocation, report restriction, credential rotation and synthetic legacy Auth deletion');
}else if(phase==='after'){
 const state=JSON.parse(await readFile(statePath,'utf8'));
 await account({action:'status'},401,state.oldToken);
 await account({action:'recover',account_id:a,password:pw,recovery:old,new_recovery:'6KMXF9TDW4NPQ'},403);
 const fresh=await login(a,replacement);assert.equal(fresh.nickname,state.nick);
 assert.ok((await posts(fresh.token)).posts.some(p=>p.id===state.post&&p.mine));
 const two=await login(b);assert.ok((await posts(two.token)).posts.some(p=>p.id==='70000000-0000-4000-8000-000000000002'&&p.mine));
 await adminCall({action:'report_queue'},401,state.revokedAdmin);
 const auth=await signInAdmin();await adminCall({action:'list'},400,auth.token);await adminCall({action:'detail'},400,auth.token);await adminCall({action:'report_queue'},200,auth.token);
 assert.equal((await writer(fresh.token)).linked,true);
 console.log('PASS recovery after actual runtime/DB restart: rotated credential remains valid, used recovery and revoked sessions denied, both author rights preserved, old personal directory remains closed');
}else if(phase==='restored'){
 const state=JSON.parse(await readFile(statePath,'utf8'));
 // Application snapshot recovery deliberately invalidates account sessions.
 await account({action:'status'},401,state.oldToken);
 await account({action:'status'},401,state.currentToken);
 await account({action:'password_login',account_id:a,password:pw},401);
 await account({action:'recover',account_id:a,password:pw,recovery:old,new_recovery:'6KMXF9TDW4NPQ'},403);
 const fresh=await login(a,replacement);
 assert.equal(fresh.nickname,state.nick);assert.equal(fresh.lv2_active,true);
 assert.ok((await posts(fresh.token)).posts.some(p=>p.id===state.post&&p.mine));
 const two=await login(b);assert.ok((await posts(two.token)).posts.some(p=>p.id==='70000000-0000-4000-8000-000000000002'&&p.mine));
 assert.equal((await writer(fresh.token)).linked,true);
 await adminCall({action:'report_queue'},401,state.revokedAdmin);
 const former=await privileged.auth.admin.getUserById(state.legacy);
 assert.ok(former.error&&!former.data?.user,'deleted fixture Auth user must not return');
 console.log('PASS restored application checkpoint through actual gateway: old sessions, password, recovery denied; new credentials, nickname, referral level, legacy authors and deleted Auth identity preserved');
}else throw Error('unknown local fixture phase');
