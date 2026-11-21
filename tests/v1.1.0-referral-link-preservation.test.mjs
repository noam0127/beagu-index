import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const script=fs.readFileSync('js/challenge-referral-v1.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261121000100_referral_short_codes.sql','utf8');
const issuer=fs.readFileSync('supabase/functions/beagu-referral-link-v1/index.ts','utf8');
const LINK_A='https://baeguindex.com/r/#aaaaAAAA';
const LINK_B='https://baeguindex.com/r/#bbbbBBBB';
const FULL_A='https://baeguindex.com/survey.html?ref='+'a'.repeat(64);
const FULL_B='https://baeguindex.com/survey.html?ref='+'b'.repeat(64);
const VISITOR_A='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const VISITOR_B='11111111-2222-4333-8444-555555555555';
const CODE_A='ABCDEFGHJK';
const CODE_B='JKMNPQRSTU';
const SESSION_A='f'.repeat(64);
const SESSION_B='e'.repeat(64);
const inactive={level:1,ownResponseVerified:true,validReferrals:0,provisional:false};
const active={level:2,ownResponseVerified:true,validReferrals:1,provisional:true};

function fixture({manual=false,clipboardPromise=null}={}){
 const ids=[
  'challengeReferralPanel','challengeReferralLink','copyChallengeReferral',
  'challengeReferralStatus','challengeReferralProgress','challengeReferralTitle',
  'challengeReferralTag','challengeReferralNote','challengeIdentityPanel',
  'challengeIdentityTitle','challengeIdentityTag','challengeIdentityReward','copyIdentityCode'
 ];
 const nodes=Object.fromEntries(ids.map(id=>{
  const classes=new Set();
  return [id,{hidden:false,disabled:false,textContent:'',value:'',dataset:{},
   attrs:{},events:{},focused:0,selected:0,
   classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)},
   addEventListener(name,fn){this.events[name]=fn},
   setAttribute(name,value){this.attrs[name]=value},
   focus(){this.focused++},select(){this.selected++}
  }];
 }));
 const handlers={},calls=[],copied=[],queued=[];
 let currentSession=SESSION_A,answer={...inactive,link:FULL_A,shortLink:LINK_A};
 const ctx={
  window:{addEventListener(name,fn){(handlers[name]??=[]).push(fn)},dispatchEvent(ev){
   for(const fn of handlers[ev.type]??[])fn(ev)
  }},
  document:{hidden:false,getElementById:id=>nodes[id],addEventListener(){}},
  SUPABASE_URL:'https://test.supabase.co',
  sessionStorage:{getItem:()=>currentSession},
  localStorage:{getItem:()=> '7'.repeat(64),setItem(){}},
  crypto:crypto.webcrypto,
  navigator:{clipboard:{writeText:async link=>{copied.push(link);if(clipboardPromise)await clipboardPromise}}},
  Event:class {constructor(type){this.type=type}},
  setInterval(){},
  fetch:async(_url,opts)=>{
   const body=JSON.parse(opts.body);
   const item={body,token:opts.headers['X-Beagu-Session']};
   calls.push(item);
   if(manual){
    return await new Promise((resolve,reject)=>queued.push({resolve,reject}));
   }
   return {status:200,ok:true,json:async()=>({...answer})};
  }
 };
 vm.runInNewContext(script,ctx,{filename:'challenge-referral-v1.js'});
 const emit=(type,detail)=>ctx.window.dispatchEvent({type,detail});
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 return {
  nodes,calls,copied,queued,flush,emit,
  getLink:()=>nodes.challengeReferralLink.value,
  getState:()=>nodes.challengeIdentityPanel.dataset.referralState,
  setAnswer(value){answer={...value}},
  session(token){currentSession=token},
  ready(visitor=VISITOR_A,code=CODE_A){
   emit('beagu:challenge-access-granted');
   emit('beagu:identity-ready',{visitor,code});
  },
  request(visitor,code){emit('beagu:identity-ready',{visitor,code})},
  focus(){emit('focus')},
  logout(){emit('beagu:challenge-access-revoked')},
  response(item,payload){item.resolve({status:200,ok:true,json:async()=>payload})}
 };
}

test('27: same issued link is preserved across Lv1 -> Lv2, intermittent alias omission and downgrade',async()=>{
 const f=fixture();
 f.ready();await f.flush();
 assert.equal(f.getLink(),LINK_A);
 assert.equal(f.getState(),'inactive');
 f.setAnswer({...active,link:FULL_A,shortLink:LINK_B});
 f.focus();await f.flush();
 assert.equal(f.getState(),'earned');
 assert.equal(f.getLink(),LINK_A,'promotion cannot replace an existing shared URL');
 assert.equal(f.nodes.copyChallengeReferral.disabled,false);
 assert.equal(f.nodes.challengeReferralTitle.textContent,'나의 전용 조사 링크');
 await f.nodes.copyChallengeReferral.events.click();
 assert.equal(f.copied.at(-1),LINK_A);

 f.setAnswer({...active,link:FULL_A,shortLink:undefined});
 f.focus();await f.flush();
 assert.equal(f.getLink(),LINK_A,'missing alias must not change the original URL');
 f.setAnswer({...inactive,link:FULL_A,shortLink:LINK_B});
 f.focus();await f.flush();
 assert.equal(f.getState(),'inactive');
 assert.equal(f.getLink(),LINK_A,'downgrade must not delete invitation link');
 f.setAnswer({...active,link:FULL_A,shortLink:LINK_A});
 f.focus();await f.flush();
 assert.equal(f.getState(),'earned');
 assert.equal(f.getLink(),LINK_A);
 assert.ok(f.calls.every(c=>c.body.visitor===VISITOR_A&&c.body.identityCode===CODE_A));
});

test('27: a distinct owner never sees the old invitation while the new response is pending',async()=>{
 const f=fixture({manual:true});
 f.ready();
 assert.equal(f.queued.length,1);
 f.response(f.queued.shift(),{...inactive,link:FULL_A,shortLink:LINK_A});
 await f.flush();
 assert.equal(f.getLink(),LINK_A);
 f.request(VISITOR_B,CODE_B);
 assert.equal(f.getLink(),'');
 assert.equal(f.nodes.challengeReferralLink.hidden,true);
 assert.equal(f.nodes.copyChallengeReferral.disabled,true);
 f.response(f.queued.shift(),{...active,link:FULL_B,shortLink:LINK_B});
 await f.flush();
 assert.equal(f.getLink(),LINK_B);
 assert.equal(f.getState(),'earned');
 assert.equal(f.calls.at(-1).body.identityCode,CODE_B);
});

test('27: stale in-flight responses cannot reveal a previous visitor link',async()=>{
 const f=fixture({manual:true});
 f.ready();
 const first=f.queued.shift();
 f.request(VISITOR_B,CODE_B);
 const second=f.queued.shift();
 f.response(second,{...inactive,link:FULL_B,shortLink:LINK_B});
 await f.flush();
 assert.equal(f.getLink(),LINK_B);
 f.response(first,{...active,link:FULL_A,shortLink:LINK_A});
 await f.flush();
 assert.equal(f.getLink(),LINK_B);
 assert.equal(f.getState(),'inactive');

 f.focus();
 const oldTokenRequest=f.queued.shift();
 f.session(SESSION_B);
 f.response(oldTokenRequest,{...active,link:FULL_B,shortLink:LINK_B});
 await f.flush();
 assert.equal(f.getState(),'inactive','different saved session must not accept old-session response');
 assert.equal(f.getLink(),LINK_B);
});

test('27: a changed signed canonical URL is not silently accepted at promotion',async()=>{
 const f=fixture();
 f.ready();await f.flush();
 assert.equal(f.getLink(),LINK_A);
 f.setAnswer({...active,link:FULL_B,shortLink:LINK_B});
 f.focus();await f.flush();
 assert.equal(f.getLink(),LINK_A);
 assert.equal(f.getState(),'pending','unverified inconsistent link cannot enable premium badge');
 assert.match(f.nodes.challengeReferralProgress.textContent,/확인 불가/);
});

test('27: logout prevents previous copy errors or late server results changing another session',async()=>{
 let rejectCopy;
 const clipboardPromise=new Promise((resolve,reject)=>{rejectCopy=reject});
 const f=fixture({clipboardPromise});
 f.ready();await f.flush();
 const click=f.nodes.copyChallengeReferral.events.click();
 f.logout();
 rejectCopy(new Error('DENIED'));
 await click;
 assert.equal(f.getLink(),'');
 assert.equal(f.nodes.copyChallengeReferral.disabled,true);
 assert.equal(f.nodes.challengeReferralLink.focused,0);
 assert.equal(f.nodes.challengeReferralLink.selected,0);
 assert.notEqual(f.nodes.challengeReferralStatus.textContent,'링크를 선택했습니다. 직접 복사해 주세요.');

 const g=fixture({manual:true});
 g.ready();
 const pending=g.queued.shift();
 g.logout();
 g.response(pending,{...active,link:FULL_A,shortLink:LINK_A});
 await g.flush();
 assert.equal(g.getLink(),'');
 assert.equal(g.getState(),'pending');
});

test('27: server maintains stable referral HMAC and row-locked alias independently of tier',()=>{
 assert.match(issuer,/BEAGU_REFERRAL_V1\|/);
 assert.match(issuer,/referralToken\(visitor, identityCode\)/);
 assert.match(issuer,/beagu_referral_short_issue/);
 assert.match(issuer,/p_hash: await digest\(token\)/);
 assert.match(migration,/select short_code into strict code/);
 assert.match(migration,/not disabled for update/);
 assert.match(migration,/if code is not null then return code; end if;/);
 assert.match(migration,/constraint challenge_referral_short_unique unique \(short_code\)/);
 assert.match(script,/canonicalLink && canonicalLink !== payload\.link/);
 assert.match(script,/if \(!currentLink\)/);
 assert.doesNotMatch(script,/location\.replace|localStorage\.setItem\(.*referralLink/);
});
