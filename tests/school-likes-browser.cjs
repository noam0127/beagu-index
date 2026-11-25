const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8'),origin='https://likes-fixture.invalid',key='beagu-level-session-v1';
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64),d='d'.repeat(64);
const schools=Array.from({length:25},(_,i)=>({school_id:String(i+1).padStart(7,'0'),school_name:'검증학교 '+String(i+1).padStart(2,'0')}));
const votes=new Map(schools.map(s=>[s.school_id,new Set()]));
const owner=t=>t===a||t===b?'owner':t===c?'other':null;
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{
let writes=0,hold=null;const requests=[];
const route=async r=>{
 const u=new URL(r.request().url());
 if(u.origin===origin)return r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="cards"></div><div id="sort"></div>'});
 if(!u.pathname.endsWith('/beagu-level-api'))return r.abort();
 const headers={'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS','content-type':'application/json'};
 if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers});
 const body=r.request().postDataJSON(),token=r.request().headers()['x-beagu-session']||'',who=owner(token);requests.push({action:body.action,token});
 const state=ids=>({canLike:!!who,schools:ids.map(school_id=>({school_id,likes:votes.get(school_id).size,liked:!!who&&votes.get(school_id).has(who)}))});
 const reply=(data,status=200)=>r.fulfill({status,headers,body:JSON.stringify(data)});
 if(body.action==='school_like_state'){const snapshot=state(body.schoolIds);if(hold&&token===a){const gate=hold;hold=null;await gate.wait;}return reply(snapshot);}
 if(body.action==='school_like_add'){if(!who)return reply({error:'LV2_INDIVIDUAL_CODE_REQUIRED'},403);writes++;votes.get(body.schoolId).add(who);return reply(state([body.schoolId]));}
 if(body.action==='public_school_like_search'){assert.equal(token,'');const ordered=schools.map(s=>({...s,like_count:votes.get(s.school_id).size})).sort((x,y)=>(body.direction==='asc'?1:-1)*(x.like_count-y.like_count)||x.school_id.localeCompare(y.school_id));return reply({schools:ordered.slice(body.page*20,body.page*20+20),total:25});}
 return r.abort();
};
async function open(t,mobile=false){
 const ctx=await browser.newContext({viewport:{width:mobile?390:1100,height:800},hasTouch:mobile,isMobile:mobile});await ctx.route('**/*',route);
 const p=await ctx.newPage();await p.goto(origin);await p.evaluate(({t,key})=>{if(t)sessionStorage.setItem(key,t)},{t,key});
 for(const path of ['js/school-likes-v1.js','js/school-search-card-v1.js'])await p.addScriptTag({content:read(path)});
 await p.addStyleTag({content:read('styles/school-likes-v1.css')});
 await p.evaluate(s=>{for(const item of [s,s]){const card=document.createElement('article');document.querySelector('#cards').append(card);BeaguSchoolSearchCard.addHeader(card,item);}return BeaguSchoolLikes.refreshCards()},schools[24]);
 const hearts=p.locator('[data-school-like-id]');assert.equal(await hearts.count(),2);
 assert.deepEqual(await p.locator('.school-name').first().evaluate(n=>[...n.children].slice(1).map(x=>x.className)),['school-data-report','school-like-button','glory-header-meta']);
 return {ctx,p,hearts};
}
const first=await open('',true);assert.equal(await first.hearts.first().isDisabled(),true);assert.equal(await first.p.locator('.school-like-count').first().innerText(),'0');
const lower=await open(d);assert.equal(await lower.hearts.first().isDisabled(),true);
const earned=await open(a,true);assert.equal(await earned.hearts.first().isEnabled(),true);
await earned.hearts.first().tap();await earned.p.waitForFunction(()=>[...document.querySelectorAll('[data-school-like-id]')].every(b=>b.getAttribute('aria-pressed')==='true'&&b.disabled&&b.querySelector('.school-like-count').textContent==='1'));
assert.equal(writes,1);
const second=await open(b);assert.equal(await second.hearts.first().isDisabled(),true);assert.equal(await second.hearts.first().getAttribute('aria-pressed'),'true');assert.equal(writes,1);
const different=await open(c);assert.equal(await different.hearts.first().isEnabled(),true);await different.hearts.first().click();await different.p.waitForFunction(()=>document.querySelector('.school-like-count').textContent==='2');assert.equal(writes,2);
await first.p.evaluate(()=>BeaguSchoolLikes.refreshCards());assert.equal(await first.p.locator('.school-like-count').first().innerText(),'2');assert.equal(await first.hearts.first().getAttribute('aria-pressed'),'false');
const ordered=await first.p.evaluate(()=>BeaguSchoolLikes.search({searchText:'',region:'부산',office:'',direction:'desc',page:0}));assert.equal(ordered.schools[0].school_id,'0000025');assert.equal(ordered.schools.length,20);assert.equal(ordered.total,25);
const next=await first.p.evaluate(()=>BeaguSchoolLikes.search({searchText:'',region:'부산',office:'',direction:'desc',page:1}));assert.equal(next.schools.length,5);assert(!next.schools.some(s=>s.school_id==='0000025'));
let release;hold={wait:new Promise(r=>release=r)};const before=requests.length;
await earned.p.evaluate(()=>{void BeaguSchoolLikes.refreshCards()});await earned.p.waitForTimeout(150);assert(requests.length>before);
await earned.p.evaluate(key=>{sessionStorage.removeItem(key);window.dispatchEvent(new Event('beagu:level-state-change'))},key);
await earned.p.waitForFunction(()=>document.querySelector('[data-school-like-id]').getAttribute('aria-pressed')==='false');
release();await earned.p.waitForTimeout(100);assert.equal(await earned.hearts.first().getAttribute('aria-pressed'),'false');assert.equal(await earned.hearts.first().isDisabled(),true);
for(const item of [first,lower,earned,second,different])await item.ctx.close();
console.log('PASS actual Chromium heart placement, Lv0/Lv1 read-only, mobile/desktop likes, cross-device identity, public sort pagination and stale logout response');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
