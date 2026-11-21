import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const script = fs.readFileSync('js/beagu-auth-confirmation-v1.js','utf8');
const root='https://baeguindex.com';
const wait=()=>new Promise(resolve=>setTimeout(resolve,5));

async function render(href, options={}) {
  const location=new URL(href);
  const status={hidden:true, textContent:'',dataset:{}};
  const logs={events:[],history:[],getSession:0,getUser:0,exchange:0};
  const session=options.session===undefined?{access_token:'test-placeholder-token'}:options.session;
  const user=options.user===undefined?{
    id:'test-subject',email_confirmed_at:'2026-11-21T00:00:00Z',is_anonymous:false
  }:options.user;
  const auth={
    async getSession(){ logs.getSession++; return {data:{session},error:null}; },
    async getUser(){ logs.getUser++; return {data:{user},error:null}; },
    async exchangeCodeForSession(code) {
      logs.exchange++;
      assert.ok(typeof code==='string' && code.length>0);
      return {data:{session:{access_token:'pkce-exchanged-test-token'}},error:null};
    }
  };
  const window={
    location:{href:location.href,origin:location.origin,
      pathname:location.pathname,search:location.search,hash:location.hash},
    history:{state:{}, replaceState(_state,_title,url){logs.history.push(url)}},
    dispatchEvent(event){logs.events.push(event.type)}
  };
  const context={window,document:{getElementById(id){return id==='beaguAuthCallbackStatus'?status:null}},
    URL,URLSearchParams,supabaseClient:{auth},
    CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}}};
  vm.runInNewContext(script,context,{timeout:2000});
  await wait();
  return {status,logs};
}

test('email callback checks getUser on Auth server before informing user',async()=>{
  const result=await render(root+'/challenge.html?code=unit-test-onetime-code&ref=local');
  assert.equal(result.status.hidden,false);
  assert.equal(result.status.dataset.state,'verified');
  assert.match(result.status.textContent,/Lv3 권한은 별도의/);
  assert.equal(result.logs.getSession,1);
  assert.equal(result.logs.getUser,1);
  assert.equal(result.logs.exchange,0);
  assert.ok(result.logs.events.includes('beagu:auth-email-verified'));
  assert.deepEqual(result.logs.history,[ '/challenge.html?ref=local' ]);
});

test('PKCE code can be exchanged once when default client did not restore session',async()=>{
  const r=await render(root+'/_preview/challenge.html?code=some-code',{session:null});
  assert.equal(r.logs.exchange,1);
  assert.equal(r.logs.getUser,1);
  assert.equal(r.status.dataset.state,'verified');
  assert.deepEqual(r.logs.history,['/_preview/challenge.html']);
});

test('unverified email cannot show confirmation or grant any membership',async()=>{
  const r=await render(root+'/challenge.html#access_token=raw-token&refresh_token=raw-refresh&token_type=bearer',{
    user:{id:'unverified',email_confirmed_at:null,is_anonymous:false}
  });
  assert.equal(r.status.dataset.state,'signin');
  assert.equal(r.logs.events.length,0);
  assert.deepEqual(r.logs.history,['/challenge.html']);
  assert.ok(!r.status.textContent.includes('raw-token'));
});

test('tampered callback errors never expose raw error_description in DOM or the URL',async()=>{
  const dangerous=encodeURIComponent('<img src=x onerror=evil()>');
  const r=await render(root+'/postit.html?error=access_denied&error_description='+dangerous);
  assert.equal(r.status.dataset.state,'error');
  assert.equal(r.logs.getSession,0);
  assert.ok(!r.status.textContent.includes('<img'));
  assert.deepEqual(r.logs.history,['/postit.html']);
});

test('token_hash custom template is rejected until verified in secure callback service',async()=>{
  const r=await render(root+'/admin-enroll.html?token_hash=dummy&type=email');
  assert.equal(r.status.dataset.state,'error');
  assert.equal(r.logs.getSession,0);
  assert.deepEqual(r.logs.history,['/admin-enroll.html']);
});

test('unknown path and origin do not claim successful authentication',async()=>{
  for(const href of ['https://evil.example/challenge.html?code=one',
                       root+'/_preview/../admin.html?code=one']) {
    const r=await render(href);
    assert.equal(r.status.dataset.state,'error');
    assert.equal(r.logs.getSession,0);
    assert.equal(r.logs.events.length,0);
  }
});

test('ordinary challenge visit is unaffected',async()=>{
  const r=await render(root+'/challenge.html');
  assert.equal(r.status.hidden,true);
  assert.equal(r.logs.getSession,0);
  assert.deepEqual(r.logs.history,[]);
});

test('all email/OAuth landing pages include status, correct script order and safe text updates',()=>{
  for(const path of ['challenge.html','postit.html','admin-enroll.html']){
    const html=fs.readFileSync(path,'utf8');
    assert.match(html,/id="beaguAuthCallbackStatus"/);
    assert.match(html,/styles\/beagu-auth-confirmation-v1\.css/);
    const a=html.indexOf('js/supabase-config.js');
    const b=html.indexOf('js/beagu-auth-confirmation-v1.js');
    assert.ok(a>0&&b>a,path);
  }
  assert.match(script,/client\.auth\.getUser\(\)/);
  assert.match(script,/email_confirmed_at/);
  assert.match(script,/replaceState/);
  assert.doesNotMatch(script,/innerHTML\s*=/);
  assert.doesNotMatch(script,/localStorage\s*\.\s*setItem/);
});
