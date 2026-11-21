import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('js/beagu-session-restore-v1.js','utf8');
const URL='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api';
const knownToken='a'.repeat(64);
function setup({session={access_token:'mock-auth-access'},user={
 id:'user-123',email_confirmed_at:'2026-11-21T10:00:00Z',
 is_anonymous:false
},level=2,responseOK=true,token=knownToken,throwAt='',afterRequest=()=>{}}={}) {
 const calls={session:0,user:0,level:0,requests:[]};
 let code=token;
 const client={auth:{
  async getSession(){calls.session++;if(throwAt==='session')throw Error('offline');return {data:{session},error:null}},
  async getUser(){calls.user++;if(throwAt==='user')throw Error('offline');return {data:{user},error:null}}
 }};
 const request=async(url,opts)=>{
  calls.level++;
  calls.requests.push({url,opts});
  afterRequest(()=>code='b'.repeat(64));
  if(throwAt==='level')throw Error('offline');
  return {ok:responseOK,async json(){return {level}}};
 };
 const window={};
 vm.runInNewContext(source,{window},{timeout:1400});
 const api=window.BeaguSessionRestore.create({
  client,getLevelToken:()=>code,levelUrl:URL,request
 });
 return {api,calls,setCode:v=>code=v};
}
test('persisted session is authenticated through server getUser and is not Lv3',async()=>{
 const h=setup();
 const person=await h.api.identity();
 assert.equal(h.calls.session,1);
 assert.equal(h.calls.user,1);
 assert.equal(person.emailVerified,true);
 assert.equal(person.user.id,'user-123');
 assert.equal(person.token,'mock-auth-access');
 assert.equal(h.calls.level,0);
 assert.equal(h.calls.requests.length,0);
});
test('missing session never queries the authenticated user',async()=>{
 const h=setup({session:null});
 assert.equal(await h.api.identity(),null);
 assert.equal(h.calls.user,0);
});
test('rejected, anonymous, and unconfirmed sessions fail closed',async()=>{
 for(const user of [null,{is_anonymous:true,id:'anonymous'},
  {is_anonymous:false,email_confirmed_at:null,id:'pending'}]){
  const h=setup({user});
  const person=await h.api.identity();
  if(!user||user.is_anonymous)assert.equal(person,null);
  else assert.equal(person.emailVerified,false);
 }
});
test('network or Auth validation errors do not restore user privileges',async()=>{
 for(const throwAt of ['session','user']){
  const h=setup({throwAt});
  assert.equal(await h.api.identity(),null);
 }
});
test('Lv2 always rechecks backend with the actual participation session',async()=>{
 const h=setup();
 assert.equal(await h.api.level(),true);
 assert.equal(h.calls.level,1);
 const x=h.calls.requests[0];
 assert.equal(x.url,URL);
 assert.equal(x.opts.method,'POST');
 assert.equal(x.opts.cache,'no-store');
 assert.equal(x.opts.headers['X-Beagu-Session'],knownToken);
 assert.deepEqual(JSON.parse(x.opts.body),{action:'verify'});
});
test('missing, malformed, and attacker-provided codes never reach server',async()=>{
 for(const token of ['', 'BG26-DEMO-1234','A'.repeat(64),'../../../', 'a'.repeat(63)]){
  const h=setup({token});
  assert.equal(await h.api.level(),false);
  assert.equal(h.calls.level,0);
 }
});
test('revoked, downgraded and failed backend verification denies level',async()=>{
 for(const options of [{level:1},{level:0},{level:null},{responseOK:false},{throwAt:'level'}]){
  const h=setup(options);
  assert.equal(await h.api.level(),false);
 }
});
test('changed participation session during verification denies stale result',async()=>{
 const h=setup({afterRequest:change=>change()});
 assert.equal(await h.api.level(),false);
});
test('simulated second visit creates fresh server checks, no cached privilege',async()=>{
 const h=setup({level:2});
 assert.equal(await h.api.level(),true);
 h.setCode('c'.repeat(64));
 assert.equal(await h.api.level(),true);
 assert.equal(h.calls.level,2);
});
test('helper does not manipulate localStorage or sessionStorage directly',()=>{
 assert.doesNotMatch(source,/localStorage|sessionStorage|setItem\(/);
 assert.doesNotMatch(source,/lv3|level\s*[:=]\s*3|innerHTML/i);
 assert.match(source,/client\.auth\.getSession\(/);
 assert.match(source,/client\.auth\.getUser\(/);
});
test('both account pages load restore before their account scripts',()=>{
 for(const [page,script] of [
  ['challenge.html','js/challenge-member-auth-v1.js'],
  ['postit.html','js/postit-account-v1.js']
 ]){
  const html=fs.readFileSync(page,'utf8');
  const p=html.indexOf('js/beagu-session-restore-v1.js');
  const q=html.indexOf(script);
  assert.ok(p>0&&p<q);
 }
});
test('Challenge rechecks Lv2 on entry and before claiming linked membership',()=>{
 const script=fs.readFileSync('js/challenge-member-auth-v1.js','utf8');
 assert.match(script,/restored\.identity\(\)/);
 assert.match(script,/restored\.level\(\)/);
 assert.match(script,/const levelStillValid=await serverLevel\(\)/);
 assert.match(script,/if\(!levelStillValid\)/);
 assert.match(script,/if\(!await serverLevel\(\)\)throw Error\('LEVEL_REQUIRED'\)/);
 assert.doesNotMatch(script,/level\s*[:=]\s*3/);
});
test('Post-it rechecks Lv2 before writer status and refuses stale linked rights',()=>{
 const script=fs.readFileSync('js/postit-account-v1.js','utf8');
 assert.match(script,/setLinked\(false\);\s*const identity=await restored\.identity\(\)/);
 assert.match(script,/const verifiedLevel=await restored\.level\(\)/);
 assert.ok(script.indexOf('const verifiedLevel=await restored.level()') <
   script.indexOf("base+'?action=writer_status'"));
 assert.match(script,/if\(!verifiedLevel\)\{render\(user,false\);return\}/);
 assert.match(script,/if\(busy\|\|!validatedLevel\(\)\|\|!await restored\.level\(\)\)return/);
});

test('Supabase client explicitly persists sessions and refreshes access tokens',()=>{
 const config=fs.readFileSync('js/supabase-config.js','utf8');
 assert.match(config,/persistSession:\s*true/);
 assert.match(config,/autoRefreshToken:\s*true/);
 assert.match(config,/detectSessionInUrl:\s*true/);
 assert.doesNotMatch(config,/service_role|sb_secret_/);
});
test('expired Challenge session re-enables login rather than leaving modal locked',()=>{
 const script=fs.readFileSync('js/challenge-member-auth-v1.js','utf8');
 assert.match(script,/if\(!person\)\{[\s\S]*?form\.hidden=false;switchMode\.hidden=false;signOut\.hidden=true/);
 assert.match(script,/if\(mode==='signin'\)setAccountState\('signin-required'\)/);
});
test('Post-it revokes linked writer status immediately on Auth signout',()=>{
 const script=fs.readFileSync('js/postit-account-v1.js','utf8');
 assert.match(script,/onAuthStateChange\(event=>\{/);
 assert.match(script,/if\(event==='SIGNED_OUT'\)setLinked\(false\)/);
});
