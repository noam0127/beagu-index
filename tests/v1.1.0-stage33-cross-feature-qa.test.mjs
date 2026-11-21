import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=path=>fs.readFileSync(path,'utf8');
const header=read('js/beagu-level-state-v1.js');
const achievements=read('js/challenge-achievements-v1.js');
const homeGuide=read('js/beagu-home-tier-benefits-v1.js');
const authReturn=read('js/beagu-auth-return-v1.js');
const matrix=JSON.parse(read('docs/releases/v1.1.0-auth-redirect-matrix.json'));
const recovery=JSON.parse(read('docs/releases/v1.1.0-rollback-baseline.json'));
const release=read('js/beagu-admin-updates-v1.js');
const admin=read('admin.html');
const member=read('js/beagu-admin-members-v1.js');
const stage32=read('js/beagu-admin-access-v1.js');
const tierApi=read('supabase/functions/beagu-2026-tiered-results-v1/index.ts');
const privateGuard=read('supabase/functions/_shared/2026-public-question-policy.mjs');

const TOKEN_A='a'.repeat(64);
const TOKEN_B='b'.repeat(64);

function harness(startToken=TOKEN_A){
  const listeners=new Map();
  const on=(type,fn)=>{
    if(!listeners.has(type))listeners.set(type,[]);
    listeners.get(type).push(fn);
  };
  const dispatch=event=>{for(const fn of listeners.get(event.type)||[])fn(event)};
  const card=(tier,name,statusName)=>{
    const state={textContent:'',attrs:{},
      setAttribute(n,v){this.attrs[n]=v}};
    return {tier,item:{dataset:{},attrs:{},
      setAttribute(n,v){this.attrs[n]=v},
      querySelector(sel){return sel===statusName?state:null}},
     state};
  };
  const homeCards=Array.from({length:4},(_,tier)=>card(tier,'home','[data-home-tier-state]'));
  const challengeCards=Array.from({length:3},(_,i)=>card(i+1,'challenge','[data-achievement-status]'));
  const badge={
    dataset:{level:'checking',memberLevel:''},textContent:'',title:'',attrs:{},
    closest(){return null},setAttribute(n,v){this.attrs[n]=v}};
  const homeHost={
    dataset:{},
    querySelector(sel){
      const m=sel.match(/^\[data-home-tier="([0-3])"\]$/);
      return m?homeCards[Number(m[1])].item:null;
    }
  };
  const challengeHost={
    dataset:{},
    querySelector(sel){
      const m=sel.match(/^\[data-challenge-achievement="([123])"\]$/);
      return m?challengeCards[Number(m[1])-1].item:null;
    }
  };
  const nodes={
    beaguLevelState:badge,homeTierBenefits:homeHost,
    homeTierSummary:{textContent:''},homeTierDetail:{textContent:''},
    challengeLevelAchievements:challengeHost,
    challengeAchievementsSummary:{textContent:''}
  };
  const document={
    hidden:false,readyState:'complete',
    getElementById:id=>nodes[id]||null,
    querySelector:()=>null,
    addEventListener:on
  };
  const window={addEventListener:on,dispatchEvent:dispatch};
  window.self=window;window.top=window;
  let token=startToken;
  const requests=[];
  const context={
    document,window,
    sessionStorage:{
      getItem:()=>token,
      removeItem(){token=''}
    },
    CustomEvent:class {
      constructor(type,{detail}={}){this.type=type;this.detail=detail}
    },
    fetch:async(_url,options)=>{
      const request={token:options.headers['X-Beagu-Session']};
      requests.push(request);
      return new Promise(resolve=>{request.resolve=resolve});
    }
  };
  // These exact three production UI modules execute simultaneously in one
  // offline browser VM so events, badges, guidance and badges share state.
  vm.runInNewContext(header,context,{filename:'beagu-level-state-v1.js'});
  vm.runInNewContext(homeGuide,context,{filename:'beagu-home-tier-benefits-v1.js'});
  vm.runInNewContext(achievements,context,{filename:'challenge-achievements-v1.js'});
  const flush=async()=>{for(let i=0;i<7;i++)await new Promise(r=>setImmediate(r))};
  const reply=async(index,result,status=200)=>{
    const req=requests[index];
    assert.ok(req,'missing server request '+index);
    req.resolve({status,ok:status>=200&&status<300,json:async()=>result});
    await flush();
  };
  return {
    badge,homeHost,challengeHost,nodes,requests,reply,flush,
    changeToken(next){token=next},
    trigger(type,detail){dispatch({type,detail})},
    homeStates:()=>homeCards.map(x=>x.item.dataset.tierState),
    challengeStates:()=>challengeCards.map(x=>x.state.textContent)
  };
}
function assertUnknown(h){
  assert.equal(h.badge.dataset.level,'checking');
  assert.equal(h.badge.dataset.memberLevel,'');
  assert.equal(h.homeHost.dataset.currentTier,'unknown');
  assert.equal(h.challengeHost.dataset.verifiedTier,'unknown');
  assert.deepEqual(h.homeStates(),['pending','pending','pending','pending']);
  assert.deepEqual(h.challengeStates(),['확인 중','확인 중','확인 중']);
}

test('stage33: initial server check has no cached Lv1/Lv2/Lv3 earned badges',()=>{
  const h=harness();
  assert.equal(h.requests.length,1);
  assertUnknown(h);
  assert.equal(h.requests[0].token,TOKEN_A);
});

test('stage33: an Lv1 then verified Lv2 response updates the exact same shared state on home and challenge',async()=>{
  const h=harness();
  await h.reply(0,{level:1});
  assert.equal(h.badge.dataset.level,'1');
  assert.equal(h.homeHost.dataset.currentTier,'1');
  assert.equal(h.challengeHost.dataset.verifiedTier,'1');
  assert.deepEqual(h.challengeStates(),['달성','미달성','미달성']);
  h.trigger('beagu:lv3-session-verification',{verified:true});
  assert.equal(h.homeHost.dataset.currentTier,'1','without Lv2 the display cannot claim Lv3');
  h.trigger('beagu:level-state-change');
  assertUnknown(h);
  await h.reply(1,{level:2,provisional:false});
  assert.equal(h.homeHost.dataset.currentTier,'2');
  assert.equal(h.challengeHost.dataset.verifiedTier,'2');
  assert.deepEqual(h.challengeStates(),['달성','달성','미달성']);
  h.trigger('beagu:lv3-session-verification',{verified:true});
  assert.equal(h.homeHost.dataset.currentTier,'3','cosmetic Lv3 signal mirrors separate account checker');
  assert.equal(h.challengeHost.dataset.verifiedTier,'3');
  // No feature API has been called from these UI-only helpers.
  assert.equal(h.requests.length,2);
});

test('stage33: a focus revalidation clears cached Lv3 before any network result exists',async()=>{
  const h=harness();
  await h.reply(0,{level:2,provisional:false});
  h.trigger('beagu:lv3-session-verification',{verified:true});
  assert.equal(h.homeHost.dataset.currentTier,'3');
  h.trigger('focus');
  assert.equal(h.requests.length,2);
  assertUnknown(h);
  await h.reply(1,{level:1});
  assert.equal(h.homeHost.dataset.currentTier,'1');
  assert.equal(h.challengeHost.dataset.verifiedTier,'1');
  assert.deepEqual(h.challengeStates(),['달성','미달성','미달성']);
});

test('stage33: old response, changed session and 401 cannot carry old tier into a new owner',async()=>{
  const h=harness();
  await h.reply(0,{level:2});
  h.trigger('beagu:lv3-session-verification',{verified:true});
  h.trigger('beagu:level-state-change');
  assertUnknown(h);
  h.changeToken(TOKEN_B);
  h.trigger('beagu:level-state-change');
  assertUnknown(h);
  assert.equal(h.requests[2].token,TOKEN_B);
  await h.reply(1,{level:2});
  assertUnknown(h);
  await h.reply(2,{level:1});
  assert.equal(h.homeHost.dataset.currentTier,'1');
  h.trigger('beagu:level-state-change');
  assertUnknown(h);
  await h.reply(3,{error:'expired'},401);
  assert.equal(h.homeHost.dataset.currentTier,'0');
  assert.equal(h.challengeHost.dataset.verifiedTier,'0');
  assert.deepEqual(h.challengeStates(),['미달성','미달성','미달성']);
});

test('stage33: server 500 and browser back-forward cache fail closed across the two UIs',async()=>{
  const h=harness();
  await h.reply(0,{level:2});
  h.trigger('beagu:lv3-session-verification',{verified:true});
  assert.equal(h.homeHost.dataset.currentTier,'3');
  h.dispatch({type:'pageshow',persisted:true});
  assertUnknown(h);
  await h.reply(1,{error:'fail'},500);
  assert.equal(h.homeHost.dataset.currentTier,'unknown');
  assert.equal(h.homeHost.dataset.verification,'error');
  assert.equal(h.challengeHost.dataset.verifiedTier,'unknown');
  assert.deepEqual(h.challengeStates(),['확인 불가','확인 불가','확인 불가']);
});

test('stage33: signout resets all status without waiting for old server calls',async()=>{
  const h=harness();
  await h.reply(0,{level:2});
  h.trigger('beagu:lv3-session-verification',{verified:true});
  h.changeToken('');
  h.trigger('beagu:challenge-access-revoked');
  assert.equal(h.requests.length,1);
  assert.equal(h.badge.dataset.level,'0');
  assert.equal(h.badge.dataset.memberLevel,'');
  assert.equal(h.homeHost.dataset.currentTier,'0');
  assert.equal(h.challengeHost.dataset.verifiedTier,'0');
});

test('stage33: login redirects are exact, staging separate and remote settings still unverified',()=>{
  for(const site of ['production','staging']){
    const conf=matrix.projects[site];
    assert.equal(conf.configured_verified,false);
    const prefix=site==='staging'?'/_preview/':'/';
    assert.ok(conf.site_url.endsWith(prefix));
    const url=new URL(conf.site_url+'challenge.html');
    const w={location:{origin:url.origin,pathname:url.pathname}};
    vm.runInNewContext(authReturn,{window:w,URL});
    for(const key of ['challenge','postit','adminEnroll','passwordReset']){
      const redirected=w.BEAGU_AUTH_RETURN.resolve(key);
      assert.ok(conf.allowed_redirect_urls.includes(redirected));
      assert.equal(new URL(redirected).pathname.startsWith('/_preview/'),site==='staging');
    }
    assert.throws(()=>w.BEAGU_AUTH_RETURN.resolve('admin'),/UNRECOGNIZED/);
  }
  assert.equal(matrix.configuration_status,'DESIRED_ONLY__NOT_VERIFIED_IN_SUPABASE');
  assert.equal(matrix.operational_change_performed,false);
});

test('stage33: release blocked without independently verified DB restore and AAL2',()=>{
  assert.match(JSON.stringify(recovery),/"recovery_export_verified"\s*:\s*false/);
  assert.match(release,/auth\.getSession\(\)/);
  assert.match(release,/mfa_verified|admin_mfa_required|aal2/);
  assert.match(admin,/<section id="adminDashboard" hidden>/);
  assert.match(member,/if \(role !== "owner"\) return;/);
  assert.match(stage32,/!proof\.permitted \|\| !proof\.mfa_verified/);
  assert.match(privateGuard,/id!==['"]Q31['"]/);
  assert.match(tierApi,/service_role|Authorization/);
  assert.doesNotMatch(homeGuide,/\\bfetch\(/);
  assert.doesNotMatch(achievements,/\\bfetch\(/);
});
