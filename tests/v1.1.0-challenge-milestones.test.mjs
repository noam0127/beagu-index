import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync('challenge.html','utf8');
const cardSource=fs.readFileSync('js/challenge-milestones-v1.js','utf8');
const challengeSource=fs.readFileSync('js/challenge.js','utf8');
const style=fs.readFileSync('styles/challenge-milestones-v1.css','utf8');
const code='K7M9Q2X4T8';
const session='a'.repeat(64);

function fixture({queued=false,issued=777,identity=code}={}){
 const listeners=new Map(),pngCalls=[],issuedURLs=[],revokedURLs=[];
 const nodes=Object.fromEntries([
  'status','capture','retry','participantNo','identityCode',
  'copyIdentityCode','identityCopyFeedback','certificate',
  'challengeMilestone','challengeMilestoneSymbol',
  'challengeMilestoneTitle','challengeMilestoneDetail',
  'challengeIdentityPanel'
 ].map(id=>[id,{
  hidden:id==='challengeMilestone'||id==='retry',
  textContent:'',disabled:id==='capture'||id==='copyIdentityCode',
  dataset:{},attributes:{},listeners:new Map(),
  addEventListener(type,fn){this.listeners.set(type,fn)},
  removeAttribute(name){delete this.attributes[name];
   if(name==='data-milestone')delete this.dataset.milestone},
  setAttribute(name,value){this.attributes[name]=value},
  click(){this.listeners.get('click')?.()}
 }]));
 let currentSession=session;
 const responseQueue=[];
 function on(name,fn){const l=listeners.get(name)||[];l.push(fn);listeners.set(name,l)}
 function dispatch(type,detail={}){const ev={type,detail};for(const fn of listeners.get(type)||[])fn(ev)}
 let currentIssue={participantNo:issued,identityCode:identity};
 const win={beaguVisitor:'11111111-1111-4111-8111-111111111111',addEventListener:on,
  dispatchEvent(e){dispatch(e.type,e.detail)}};
 const doc={getElementById:id=>nodes[id]||null,
  fonts:{ready:Promise.resolve()},body:{appendChild(){}},
  createElement:()=>({style:{},click(){},remove(){}})};
 const ctx={
  SUPABASE_URL:'https://synthetic.supabase.co',
  window:win,document:doc,
  CustomEvent:class {constructor(type,{detail}){this.type=type;this.detail=detail}},
  sessionStorage:{getItem:key=>key==='beagu-level-session-v1'?currentSession:null},
  navigator:{clipboard:{writeText:async()=>{}}},
  setTimeout,clearTimeout,Promise,Number,Error,URL:{
   createObjectURL(){const result='blob:synthetic-'+(issuedURLs.length+1);issuedURLs.push(result);return result},
   revokeObjectURL(url){revokedURLs.push(url)}
  },
  html2canvas:async node=>{
   pngCalls.push({node,ordinal:nodes.certificate.dataset.milestone,
    milestoneHidden:nodes.challengeMilestone.hidden});
   return {toBlob(resolve,format){assert.equal(format,'image/png');resolve({synthetic:true})}};
  },
  fetch:async(_url,options)=>{
   assert.equal(options.headers['X-Beagu-Session'],session,'synthetic owner session');
   const params=JSON.parse(options.body);
   assert.equal(params.action,'issue');
   if(queued)return new Promise(resolve=>responseQueue.push(resolve));
   return {ok:true,status:200,json:async()=>({...currentIssue})};
  }
 };
 vm.runInNewContext(cardSource,ctx,{filename:'challenge-milestones-v1.js'});
 vm.runInNewContext(challengeSource,ctx,{filename:'challenge.js'});
 const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve))};
 return {nodes,win,pngCalls,responseQueue,issuedURLs,revokedURLs,flush,
  emit:dispatch,
  update(issue){currentIssue={...issue}},
  changeSession(value){currentSession=value},
  grant(){dispatch('beagu:challenge-access-granted')},
  revoke(){dispatch('beagu:challenge-access-revoked')},
  fulfill(body,status=200){const resolve=responseQueue.shift();assert.ok(resolve);
   resolve({ok:status===200,status,json:async()=>({...body})})}
 };
}

test('Stage30: six and ONLY six numbered milestones have individual visual themes',()=>{
 const f=fixture();
 const api=f.win.BeaguChallengeMilestones;
 assert.ok(Object.isFrozen(api));
 assert.equal(f.nodes.challengeMilestone.hidden,true);
 assert.equal(f.nodes.certificate.dataset.milestone,undefined);
 for(const n of [100,111,222,500,777,1000]){
  assert.equal(api.show(n),true,'must draw milestone '+n);
  assert.equal(f.nodes.challengeMilestone.hidden,false);
  assert.equal(f.nodes.certificate.dataset.milestone,String(n));
  assert.ok(f.nodes.challengeMilestoneSymbol.textContent.length);
  assert.ok(f.nodes.challengeMilestoneTitle.textContent.includes(n.toLocaleString('ko-KR')));
  assert.ok(f.nodes.challengeMilestoneDetail.textContent.length>5);
  assert.ok(style.includes('data-milestone="'+n+'"'));
 }
 for(const n of [null,undefined,false,0,1,99,101,110,112,223,499,501,776,778,999,1001,'777',777.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
  assert.equal(api.show(n),false,'non milestone must be a normal certificate: '+n);
  assert.equal(f.nodes.challengeMilestone.hidden,true);
  assert.equal(f.nodes.certificate.dataset.milestone,undefined);
  assert.equal(f.nodes.challengeMilestoneTitle.textContent,'');
 }
});

test('Stage30: page order, special graphic in certificate PNG, no private code rendered',()=>{
 assert.match(html,/src="js\/challenge-milestones-v1.js\?v=20261122-stage30"/);
 assert.match(html,/styles\/challenge-milestones-v1\.css/);
 assert.ok(html.indexOf('src="js/challenge-milestones-v1.js')<
   html.indexOf('src="js/challenge.js'));
 assert.ok(html.indexOf('id="certificate"')<
   html.indexOf('id="challengeMilestone"'));
 assert.ok(html.indexOf('id="challengeMilestone"')<
   html.indexOf('<!-- NOT inside #certificate'));
 assert.ok(html.indexOf('id="challengeMilestone"')<
   html.indexOf('id="challengeIdentityPanel"'));
 assert.match(style,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(cardSource,/localStorage|sessionStorage|fetch\(|challengeReferralLink|identityCode|\.submit\(/);
 assert.doesNotMatch(style,/https?:\/\/|url\(/);
});

test('Stage30: only server-verified participantNo creates a celebration before PNG snapshot',async()=>{
 const f=fixture({issued:777});
 f.grant();
 await f.flush();
 assert.equal(f.nodes.participantNo.textContent,'777번째');
 assert.equal(f.nodes.certificate.dataset.milestone,'777');
 assert.equal(f.nodes.challengeMilestone.hidden,false);
 assert.equal(f.nodes.capture.disabled,false);
 assert.equal(f.pngCalls.length,1);
 assert.equal(f.pngCalls[0].node,f.nodes.certificate);
 assert.equal(f.pngCalls[0].ordinal,'777');
 assert.equal(f.pngCalls[0].milestoneHidden,false);
 assert.equal(f.nodes.identityCode.textContent,code);
 assert.equal(f.nodes.challengeIdentityPanel.dataset.milestone,undefined,'private credential never decorated');
 f.revoke();
 assert.equal(f.nodes.challengeMilestone.hidden,true);
 assert.equal(f.nodes.certificate.dataset.milestone,undefined);
 assert.equal(f.nodes.participantNo.textContent,'순번 확인 중');
 assert.equal(f.nodes.capture.disabled,true);
 assert.equal(f.revokedURLs.length,1);
});

test('Stage30: normal ordinal stays normal, malformed ordinal or identity never earns a graphic',async()=>{
 const f=fixture({issued:42});
 f.grant();await f.flush();
 assert.equal(f.nodes.participantNo.textContent,'42번째');
 assert.equal(f.nodes.challengeMilestone.hidden,true);
 assert.equal(f.nodes.capture.disabled,false);
 f.revoke();
 f.update({participantNo:777,identityCode:'TAMPERED CODE'});
 f.grant();await f.flush();
 assert.equal(f.nodes.challengeMilestone.hidden,true);
 assert.equal(f.nodes.capture.disabled,true);
 assert.match(f.nodes.status.textContent,/발급 결과/);
 f.revoke();
 f.update({participantNo:777.5,identityCode:code});
 f.grant();await f.flush();
 assert.equal(f.nodes.challengeMilestone.hidden,true);
 assert.equal(f.nodes.capture.disabled,true);
});

test('Stage30: after logout, delayed old server responses cannot decorate another session',async()=>{
 const f=fixture({queued:true});
 f.grant();
 assert.equal(f.responseQueue.length,1);
 f.revoke();
 f.grant();
 assert.equal(f.responseQueue.length,2);
 f.fulfill({participantNo:777,identityCode:code});
 await f.flush();
 assert.equal(f.nodes.challengeMilestone.hidden,true);
 assert.equal(f.nodes.participantNo.textContent,'순번 확인 중');
 f.fulfill({participantNo:100,identityCode:code});
 await f.flush();
 assert.equal(f.nodes.certificate.dataset.milestone,'100');
 assert.equal(f.nodes.participantNo.textContent,'100번째');
 assert.equal(f.pngCalls.length,1);
});

test('Stage30: a changed session token during the identity response fails closed',async()=>{
 const f=fixture({queued:true});
 f.grant();
 assert.equal(f.responseQueue.length,1);
 f.changeSession('b'.repeat(64));
 f.fulfill({participantNo:1000,identityCode:code});
 await f.flush();
 assert.equal(f.nodes.challengeMilestone.hidden,true);
 assert.equal(f.nodes.participantNo.textContent,'');
 assert.equal(f.pngCalls.length,0);
 f.revoke();
 assert.equal(f.nodes.challengeMilestone.hidden,true);
});
