import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
const client=read('js/postit-v1.js');
const server=read('supabase/functions/beagu-postit-api-v1/index.ts');
const sql=read('supabase/migrations/20261121140000_beagu_postit_atomic_write.sql');
const nextSql=read('docs/v1.11.25-locker-room-schema-preview.sql');
const replySql=read('docs/v1.11.25-locker-replies-preview.sql');
assert.match(replySql,/beagu_postit_create_comment_v3[\s\S]+pg_advisory_xact_lock/);
assert.match(replySql,/from public,anon,authenticated/);
assert.match(replySql,/to service_role/);
const page=read('postit.html');
const css=read('styles/postit-v1.css');
assert.doesNotThrow(()=>new vm.Script(client));
for(const s of ['client_request_id uuid','beagu_postit_posts_request_unique',
  'beagu_postit_comments_request_unique','pg_advisory_xact_lock',
  "date_trunc('day',pg_catalog.now(),'Asia/Seoul')",
  'interval \'90 seconds\'','interval \'30 seconds\'',
  'beagu_postit_create_post_v2','beagu_postit_create_comment_v2',
  "v_latest is not null","'replayed',true","'replayed',false",
  'security invoker set search_path','from public,anon,authenticated','to service_role'])
  assert.ok(sql.includes(s),'Atomic write migration missing '+s);
assert.ok(!/GRANT\s+EXECUTE[\s\S]{0,110}\bTO\s+anon\b/i.test(sql),'Anonymous RPC grant forbidden');
assert.ok(!/GRANT\s+SELECT[\s\S]{0,110}\bTO\s+authenticated\b/i.test(sql),'No direct table exposure');
assert.match(server,/await boundedJSON\(req\)/,'POST body must be read with byte cap');
assert.match(server,/bytes>2048/,'Transfer-encoding cannot bypass 2KB input limit');
assert.match(nextSql,/beagu_postit_create_post_v3[\s\S]+pg_advisory_xact_lock/);
assert.match(nextSql,/from public,anon,authenticated/);
assert.match(nextSql,/to service_role/);
assert.match(server,/db\.rpc\("beagu_postit_create_post_v3"/,'Post write uses atomic database gate');
assert.match(server,/db\.rpc\("beagu_postit_create_comment_v3"/,'Comment write uses atomic database gate');
assert.ok(!server.includes('await countToday('),'Avoid race-prone count then insert');
assert.match(server,/suppliedId\|\|crypto\.randomUUID\(\)/,'Cached legacy clients remain rate-limited');
assert.match(server,/action==="set_like"/,'Like uses idempotent desired state');
assert.match(server,/typeof body\?\.liked!=="boolean"/,'Invalid desired like state rejected');
assert.match(server,/const user=await verifiedMember\(viewer\)/,'Mutation requires signed-in linked Lv2 member');
assert.match(server,/if\(t\.author_uid!==user\.id\)return fail\(req,"NOT_OWNER",403\)/,'Delete belongs to author');
assert.match(server,/if\(reports>=3&&reports\/\(likes\+reports\)>=0\.5\)/,'Report-hide moderation maintained');
assert.match(server,/beagu_has_earned_challenge_visitor/,'Revoked referrals fail closed');
assert.match(client,/request_id:state\.postAttempt\.requestId/,'Post nonce persists across retry');
assert.match(client,/request_id:attempt\.requestId/,'Comment nonce persists across retry');
assert.match(client,/state\.expanded\.add\(id\)/,'Comment thread preserved after insert');
assert.match(client,/mutation\("set_like",\{target_type:"post",target_id:post\.id,liked:!post\.liked\}\)/);
assert.match(client,/mutation\("set_like",\{target_type:"comment",target_id:c\.id,liked:!c\.liked\}\)/);
assert.match(client,/const actionKey=action/,'Concurrent UI actions are keyed');
assert.match(client,/state\.pendingActions\.has\(actionKey\)/);
assert.match(client,/b\.dataset\.submitting==="1"/,'Double taps blocked at button');
assert.ok(!client.includes('innerHTML='),'Client must not insert untrusted HTML');
for(const key of ['postit-paper','paper-attach','postit-breeze-flutter','postit-bookmark-flick'])
  assert.ok(css.includes(key),'Handwritten Post-it UI retained: '+key);
assert.ok(page.includes('postitAccount')&&page.includes('postitThread'));
assert.ok(client.includes('newId')&&client.includes('is-new'),'New Post-it animation remains');

// Runtime behavior of the actual extracted UI helpers with a controlled
// mock, rather than string matches alone.
const btnStart=client.indexOf('function actionButton(');
const btnEnd=client.indexOf('function schoolChips(',btnStart);
const mutateStart=client.indexOf('async function mutation(');
const mutateEnd=client.indexOf('async function fillComments(',mutateStart);
assert.ok(btnStart>0&&btnEnd>btnStart&&mutateStart>btnEnd&&mutateEnd>mutateStart);
const snippets=client.slice(btnStart,btnEnd)+'\n'+client.slice(mutateStart,mutateEnd);
let respond;
const response=new Promise(resolve=>{respond=resolve});
let requests=0,reloads=0;
const state={pendingActions:new Set()};
const errors=[];
class FakeButton {
 constructor(){this.dataset={};this.listeners={};this.isConnected=true;this.disabled=false}
 addEventListener(type,fn){this.listeners[type]=fn}
 async click(){if(!this.disabled)return this.listeners.click()}
}
const node=()=>new FakeButton();
const helpers=new Function('node','showMessage','canWrite','state','request','loadPosts',
 snippets+'\nreturn {actionButton,mutation};')(
 node,s=>errors.push(s),()=>true,state,async()=>{
  requests++;return response
 },async()=>{reloads++}
);
const first=helpers.mutation('set_like',{target_type:'post',target_id:'abc',liked:true});
const duplicate=helpers.mutation('set_like',{target_type:'post',target_id:'abc',liked:true});
await duplicate;
assert.equal(requests,1,'Second in-flight action on same post blocked');
respond({likes:1});
await first;
assert.equal(reloads,1,'Only one refresh for one like action');
assert.equal(state.pendingActions.size,0,'Action lock released');
let clicks=0;
let unlock;
const barrier=new Promise(resolve=>{unlock=resolve});
const button=helpers.actionButton('공감',async()=>{clicks++;await barrier});
const one=button.click();
const two=button.click();
await two;
assert.equal(clicks,1,'Rapid double-tap triggers one action');
unlock();await one;
assert.equal(button.disabled,false,'Button restored after successful action');
console.log('PASS atomic Post-it contracts, quota locks, stable retries, safe DOM and UI double-tap guard');