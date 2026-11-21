import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync('js/beagu-admin-members-v1.js','utf8');
const fakeUser='11111111-1111-4111-8111-111111111111';
const fakeRequest='44444444-4444-4444-8444-444444444444';
class Node{
 constructor(id=''){
  this.id=id;this.hidden=true;this.disabled=false;this.value='';
  this.textContent='';this.children=[];this.dataset={};
  this.classList={toggle(){},add(){},remove(){}};
  this.listeners=new Map();
 }
 addEventListener(name,fn){this.listeners.set(name,fn)}
 emit(name,event={}){return this.listeners.get(name)?.(event)}
 append(...items){this.children.push(...items)}
 replaceChildren(...items){this.children=items}
}
const tick=async()=>{for(let n=0;n<8;n++)await new Promise(r=>setImmediate(r));};
function fixture({verified=true,moderationFailure=false,role='owner'}={}){
 const refs=new Map();
 const get=id=>{if(!refs.has(id))refs.set(id,new Node(id));return refs.get(id)};
 const forms={
  status:'list',changes:[],requests:[],getUser:0
 };
 const profile={
  id:fakeUser,email:'person@example.test',is_admin:false,
  email_confirmed:true,created_at:'2026-11-20T00:00:00Z',
  last_sign_in_at:null,banned_until:null,is_suspended:false,
  lv2_account_linked:false,lv2_linked_at:null,sms_status:'not_consented',
  sms_phone_verified:false
 };
 const list={total_matches:1,page_size:20,total_users_scanned:1,
  total_admins_scanned:0,unconfirmed_scanned:0,suspended_scanned:0,
  truncated:false,rows:[profile]};
 const requests=forms.requests;
 const win={
  confirm:()=>true,
  crypto:{randomUUID:()=>fakeRequest}
 };
 const ctx={
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:'browser-publishable-key',
  supabaseClient:{auth:{
   async getSession(){
    forms.getUser++;
    return {data:{session:verified?{access_token:'test-admin-jwt'}:null},error:null};
   }
  }},
  window:win,
  document:{
   getElementById:get,
   createElement:tag=>new Node(tag),
   querySelectorAll:selector=>selector==='[data-member-operation]'
    ?['adminMemberSuspend24','adminMemberSuspend7','adminMemberRestore'].map(get):[]
  },
  async fetch(url,options){
   const body=JSON.parse(options.body);
   requests.push({url,body,headers:options.headers});
   if(body.action==='moderate'){
    if(moderationFailure)return {ok:false,status:409,json:async()=>({error:'duplicate_request'})};
    forms.changes.push(body);
    return {ok:true,status:200,json:async()=>({ok:true,data:{
     updated:true,request_id:body.request_id,operation:body.operation,user_id:fakeUser
    }})};
   }
   if(body.action==='detail')
    return {ok:true,status:200,json:async()=>({ok:true,data:{
     profile,moderation_history:[]
    }})};
   if(body.action==='privacy_queue')
    return {ok:true,status:200,json:async()=>({ok:true,data:{rows:[{
     request_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
     user_id:fakeUser,
     kind:'deletion',status:'pending',
     requested_at:'2026-11-21T10:00:00Z'
    }]}})};
   if(body.action==='list')return {ok:true,status:200,json:async()=>({ok:true,data:list})};
   throw Error('unexpected action');
  }
 };
 vm.runInNewContext(code,ctx,{timeout:1300});
 return {ui:win.BeaguMembersAdmin,get,forms,requests,role};
}

test('owner only sees private queued deletion review; no delete or approval action',async()=>{
 const x=fixture();
 x.ui.mount('owner');
 await tick();
 assert.ok(x.requests.some(v=>v.body.action==='privacy_queue'));
 assert.equal(x.get('adminPrivacyQueueRows').children.length,1);
 const row=x.get('adminPrivacyQueueRows').children[0];
 assert.equal(row.children[1].textContent,'탈퇴 검토');
 assert.equal(row.children[2].textContent,'접수 대기');
 assert.ok(x.requests.every(v=>!['delete_user','complete_deletion'].includes(v.body.action)));
 x.ui.reset();
 assert.equal(x.get('adminPrivacyQueueRows').children.length,0);
});
test('non-owner never sees member directory or makes requests',async()=>{
 const h=fixture({role:'operator'});
 h.ui.mount('operator');
 await tick();
 assert.equal(h.get('adminMemberManagement').hidden,true);
 assert.equal(h.get('adminMemberNavLink').hidden,true);
 assert.equal(h.requests.length,0);
});
test('owner mounts member directory after Auth and filters account status server-side',async()=>{
 const h=fixture();
 h.ui.mount('owner');
 await tick();
 assert.equal(h.get('adminMemberManagement').hidden,false);
 assert.equal(h.get('adminMemberNavLink').hidden,false);
 assert.equal(h.requests[0].body.action,'list');
 assert.equal(h.requests[0].body.filter,'all');
 assert.equal(h.requests[0].headers.Authorization,'Bearer test-admin-jwt');
 assert.equal(h.requests[0].headers.apikey,'browser-publishable-key');
 h.get('adminMembersSearch').value='teacher';
 h.get('adminMembersFilter').value='unconfirmed';
 h.get('adminMembersSearchForm').emit('submit',{preventDefault(){}});
 await tick();
 assert.equal(h.requests.at(-1).body.filter,'unconfirmed');
 assert.equal(h.requests.at(-1).body.search,'teacher');
});
test('member table escapes unexpected email strings by textContent, no HTML assignment',()=>{
 assert.match(code,/\.textContent\s*=\s*String\(value\)/);
 assert.doesNotMatch(code,/\.innerHTML\s*=/);
});
test('owner moderation passes unique request ID and never confuses client data with permissions',async()=>{
 const h=fixture();
 h.ui.mount('owner');
 await tick();
 const detailButton=h.get('adminMembersRows').children[0]?.children?.at(-1)?.children?.[0];
 assert.ok(detailButton,'selectable member detail');
 detailButton.emit('click');
 await tick();
 h.get('adminMemberReason').value='운영규정 위반이 확인되어 제한 조치가 필요함';
 h.get('adminMemberSuspend24').dataset.memberOperation='suspend_24h';
 h.get('adminMemberSuspend24').emit('click');
 await tick();
 const update=h.requests.find(q=>q.body.action==='moderate');
 assert.ok(update);
 assert.equal(update.body.user_id,fakeUser);
 assert.equal(update.body.operation,'suspend_24h');
 assert.equal(update.body.request_id,fakeRequest);
 assert.ok(update.body.reason.length>=8);
 assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE_KEY/);
});
test('PII in moderation reasons is rejected before sending to server',async()=>{
 const h=fixture();
 h.ui.mount('owner');
 await tick();
 const button=h.get('adminMembersRows').children[0]?.children.at(-1)?.children?.[0];
 button.emit('click');await tick();
 h.get('adminMemberReason').value='사용자 person@example.test 관련 문제';
 h.get('adminMemberSuspend24').dataset.memberOperation='suspend_24h';
 h.get('adminMemberSuspend24').emit('click');await tick();
 assert.equal(h.forms.changes.length,0);
 assert.match(h.get('adminMemberActionStatus').textContent,/이메일|전화번호/);
});
test('duplicate moderation request is not falsely reported as success',async()=>{
 const h=fixture({moderationFailure:true});
 h.ui.mount('owner');await tick();
 const button=h.get('adminMembersRows').children[0]?.children.at(-1)?.children?.[0];
 button.emit('click');await tick();
 h.get('adminMemberReason').value='반복적인 서비스 운영 방해 행위에 따른 계정 조치';
 h.get('adminMemberSuspend7').dataset.memberOperation='suspend_7d';
 h.get('adminMemberSuspend7').emit('click');await tick();
 assert.match(h.get('adminMemberActionStatus').textContent,/처리 중이거나 완료된 요청/);
 assert.doesNotMatch(h.get('adminMemberActionStatus').textContent,/처리 완료 · 감사 기록/);
});
test('admin logout purges email/IDs and moderation reason from in-memory DOM',async()=>{
 const h=fixture();
 h.ui.mount('owner');await tick();
 h.get('adminMemberReason').value='개인회원 검토 사유';
 assert.ok(h.get('adminMembersRows').children.length>0);
 h.ui.reset();
 assert.equal(h.get('adminMembersRows').children.length,0);
 assert.equal(h.get('adminMemberDetail').children.length,0);
 assert.equal(h.get('adminMemberReason').value,'');
 assert.equal(h.get('adminMembersSearch').value,'');
 assert.equal(h.get('adminMemberManagement').hidden,true);
 assert.equal(h.get('adminMemberNavLink').hidden,true);
 assert.equal(h.get('adminMembersPrev').disabled,true);
});

test('revoked Auth session immediately hides and clears member directory even if client still says owner',async()=>{
 const h=fixture({verified:false});
 h.ui.mount('owner');
 await tick();
 assert.equal(h.get('adminMemberManagement').hidden,true);
 assert.equal(h.get('adminMemberNavLink').hidden,true);
 assert.equal(h.get('adminMembersRows').children.length,0);
 assert.equal(h.get('adminMemberDetail').children.length,0);
 assert.equal(h.requests.length,0);
});
