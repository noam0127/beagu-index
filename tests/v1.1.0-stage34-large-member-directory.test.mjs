import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('js/beagu-admin-members-v1.js','utf8');
const fakeCode='9'.repeat(12);
class Node {
  constructor(id=''){
    this.id=id;this.children=[];this.disabled=false;this.hidden=true;
    this.value='';this.textContent='';this.dataset={};this.listeners=new Map();
    this.classList={toggle(){},add(){},remove(){}};
  }
  addEventListener(type,fn){this.listeners.set(type,fn)}
  emit(type,event={}){this.listeners.get(type)?.(event)}
  replaceChildren(...children){this.children=children}
  append(...children){this.children.push(...children)}
}
const flush=async()=>{for(let n=0;n<7;n++)await new Promise(r=>setImmediate(r))};

function user(index){
  const id=String(index).padStart(12,'0');
  return {
    id:'00000000-0000-4000-8000-'+id,
    email:'teacher'+String(index).padStart(5,'0')+'@example.test',
    email_confirmed:true,is_admin:false,lv2_account_linked:false,
    is_suspended:false,sms_status:'no_record'
  };
}
function listFor(page,n,options={}){
  const start=n-(page-1)*20;
  const rows=[];
  for(let i=start;i>Math.max(0,start-20);i--)if(i>0)rows.push(user(i));
  return {
    rows,page,page_size:20,
    total_matches:n,total_users_scanned:options.truncated?4000:n,
    total_admins_scanned:1,unconfirmed_scanned:0,
    suspended_scanned:0,truncated:options.truncated===true
  };
}
function fixture(n=10001,{role='owner',truncated=false,invalidPage=false,deferrable=false}={}){
  const elements=new Map(),calls=[],pending=[];
  const get=id=>{
    if(!elements.has(id))elements.set(id,new Node(id));
    return elements.get(id);
  };
  let authorized=true;
  const document={
    getElementById:get,
    createElement:tag=>new Node(tag),
    querySelectorAll:sel=>sel==='[data-member-operation]'
      ?['adminMemberSuspend24','adminMemberSuspend7','adminMemberRestore'].map(get):[]
  };
  const window={confirm(){return true},crypto:{randomUUID(){return '4'.repeat(36)}}};
  const ctx={
    window,document,
    SUPABASE_URL:'https://synthetic.supabase.test',
    SUPABASE_PUBLISHABLE_KEY:'synthetic-public-key',
    supabaseClient:{auth:{async getSession(){
      return {data:{session:authorized?{access_token:'synthetic-owner-token'}:null},error:null};
    }}},
    async fetch(_url,options){
      const input=JSON.parse(options.body);
      calls.push({input,headers:options.headers});
      assert.equal(options.headers.Authorization,'Bearer synthetic-owner-token');
      if(input.action==='privacy_queue')
        return {ok:true,status:200,json:async()=>({ok:true,data:{rows:[]}})};
      if(input.action==='detail')return {ok:true,status:200,json:async()=>({
        ok:true,data:{profile:user(n),moderation_history:[]}
      })};
      assert.equal(input.action,'list','no bulk export or user mutation');
      const reply=()=>{
        const data=listFor(input.page,n,{truncated});
        if(invalidPage)data.page=input.page+1;
        return {ok:true,status:200,json:async()=>({ok:true,data})};
      };
      if(!deferrable)return reply();
      return new Promise(resolve=>pending.push({input,resolve:()=>resolve(reply())}));
    }
  };
  vm.runInNewContext(source,ctx,{filename:'beagu-admin-members-v1.js'});
  return {get,calls,pending,ui:window.BeaguMembersAdmin,role,
    expire(){authorized=false},flush};
}
function assertPage(h,page,first,last){
  assert.equal(h.get('adminMembersPage').textContent,
    page+' / '+Math.ceil(last/20));
  assert.equal(h.get('adminMembersRows').children.length,page===Math.ceil(last/20)?last%20||20:20);
  assert.equal(h.calls.filter(x=>x.input.action==='list').at(-1).input.page,page);
  assert.equal(h.get('adminMembersNext').disabled,page===Math.ceil(last/20));
  assert.equal(h.get('adminMembersPrev').disabled,page===1);
  assert.equal(h.get('adminMembersTotal').textContent,last.toLocaleString('ko-KR'));
  const rows=h.get('adminMembersRows').children;
  assert.equal(rows[0].children[0].children[0].textContent,
    'teacher'+String(first).padStart(5,'0')+'@example.test');
}

test('stage34: 4,001 Auth members expose page 201 with one member (not capped at 4,000)',async()=>{
  const h=fixture(4001);h.ui.mount(h.role);await flush();
  assertPage(h,1,4001,4001);
  for(let page=2;page<=201;page++){
    h.get('adminMembersNext').emit('click');await flush();
    if(page===201)assertPage(h,page,1,4001);
  }
  assert.equal(h.calls.filter(x=>x.input.action==='list').length,201);
  assert.match(h.get('adminMembersStatus').textContent,/전체 인증 계정 4,001개 집계/);
  assert.doesNotMatch(h.get('adminMembersStatus').textContent,/일부만 검색됨/);
  assert.ok(h.get('adminMembersRows').children.length<=20);
});

test('stage34: 10,001 Auth members reach page 501 without storing 10,001 records in DOM',async()=>{
  const h=fixture(10001);h.ui.mount(h.role);await flush();
  assertPage(h,1,10001,10001);
  for(let page=2;page<=501;page++){
    h.get('adminMembersNext').emit('click');await flush();
    const rows=h.get('adminMembersRows').children;
    assert.ok(rows.length<=20,'never render all accounts');
    if(page===201)assertPage(h,201,6001,10001);
    if(page===501)assertPage(h,501,1,10001);
  }
  assert.equal(h.calls.filter(x=>x.input.action==='list').length,501);
  assert.equal(h.get('adminMembersNext').disabled,true);
  h.get('adminMembersNext').emit('click');await flush();
  assert.equal(h.calls.filter(x=>x.input.action==='list').length,501);
  assert.match(h.get('adminMembersStatus').textContent,/한 페이지에 최대 20명만 조회/);
});

test('stage34: legacy capped / truncated / stale-page results fail closed and clear old visible member data',async()=>{
  for(const option of [{truncated:true},{invalidPage:true}]){
    const h=fixture(10001,option);h.ui.mount(h.role);await flush();
    assert.equal(h.get('adminMembersPage').textContent,'조회 불가');
    assert.equal(h.get('adminMembersRows').children.length,1);
    assert.match(h.get('adminMembersRows').children[0].children[0].textContent,/조회 실패/);
    assert.equal(h.get('adminMembersTotal').textContent,'—');
    assert.equal(h.get('adminMembersNext').disabled,true);
    assert.doesNotMatch(h.get('adminMembersStatus').textContent,/10,001명 검색됨/);
  }
});

test('stage34: returning from revoked owner session never retains member emails, page state or permissions',async()=>{
  const h=fixture(10001);h.ui.mount(h.role);await flush();
  assert.equal(h.get('adminMemberNavLink').hidden,false);
  assert.equal(h.get('adminMembersRows').children.length,20);
  h.expire();
  h.get('adminMembersReload').emit('click');await flush();
  assert.equal(h.get('adminMemberNavLink').hidden,true);
  assert.equal(h.get('adminMemberManagement').hidden,true);
  assert.equal(h.get('adminMembersRows').children.length,0);
  assert.equal(h.get('adminMembersTotal').textContent,'—');
});

test('stage34: old slow request cannot overwrite a newer owner directory page',async()=>{
  const h=fixture(10001,{deferrable:true});h.ui.mount(h.role);
  await flush();
  assert.equal(h.pending.length,1);
  h.get('adminMembersReload').emit('click');
  await flush();
  assert.equal(h.pending.length,2);
  h.pending[1].resolve();await flush();
  assertPage(h,1,10001,10001);
  h.ui.reset();
  h.pending[0].resolve();await flush();
  assert.equal(h.get('adminMembersRows').children.length,0);
  assert.equal(h.get('adminMemberNavLink').hidden,true);
  assert.equal(h.get('adminMembersTotal').textContent,'—');
});

test('stage34: non-owner is never given private directory, even for 10,001 synthetic users',async()=>{
  const h=fixture(10001,{role:'operator'});
  h.ui.mount('operator');await flush();
  assert.equal(h.calls.length,0);
  assert.equal(h.get('adminMemberNavLink').hidden,true);
  assert.equal(h.get('adminMemberManagement').hidden,true);
  assert.doesNotMatch(source,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
