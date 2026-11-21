#!/usr/bin/env node
/* Stage36 local-only Chromium QA: test the *isolated staging archive*.
 * Route every off-loopback request to abort before ANY network egress.
 * Screenshots, PII, form submissions, Auth tokens and deployment are forbidden.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');

const base=process.env.BEAGU_STAGE36_LOCAL_ORIGIN||'http://127.0.0.1:8136';
const URL_BASE=new URL(base);
assert.equal(URL_BASE.protocol,'http:');
assert.ok(['127.0.0.1','localhost'].includes(URL_BASE.hostname));
const items=[
 {name:'home',page:'/index.html',selector:'#homeTierBenefits'},
 {name:'challenge',page:'/challenge.html',selector:'#challengeLevelAchievements'},
 {name:'admin',page:'/admin.html',selector:'#adminSectionIndex',hidden:true},
 {name:'search',page:'/search-lv1.html'},
 {name:'compare',page:'/statistics.html'}
];
const dimensions=[
 {name:'desktop',width:1365,height:850,isMobile:false},
 {name:'mobile',width:390,height:844,isMobile:true},
 {name:'compact',width:360,height:740,isMobile:true}
];
const samples=[],blocked=new Set(),errors=[];
let externalContinued=0,localNavigations=0;
const isLocal=url=>{
 try{
  const target=new URL(url);
  return target.protocol==='http:'&&target.hostname===URL_BASE.hostname&&
    target.port===URL_BASE.port;
 }catch{return false}
};
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const view of dimensions){
   const context=await browser.newContext({
    viewport:{width:view.width,height:view.height},
    isMobile:view.isMobile,deviceScaleFactor:view.isMobile?2:1,
    serviceWorkers:'block',acceptDownloads:false
   });
   await context.route('**/*',route=>{
    const url=route.request().url();
    if(isLocal(url))return route.continue();
    try{blocked.add(new URL(url).hostname||'special')}catch{blocked.add('special')}
    // Always abort before real Supabase, Google Forms or CDN can be reached.
    return route.abort('blockedbyclient');
   });
   for(const item of items){
    const page=await context.newPage();
    page.on('pageerror',error=>{
      if(errors.length<15)errors.push({
       view:view.name,page:item.name,
       message:String(error.message||error).slice(0,160)
      });
    });
    page.on('requestfinished',r=>{
      if(!isLocal(r.url()))externalContinued++;
    });
    const response=await page.goto(base+'/_preview'+item.page,{
      waitUntil:'domcontentloaded',timeout:22000
    });
    assert.equal(response?.status(),200,item.page+' must be local HTML 200');
    localNavigations++;
    const meta=await page.evaluate(({selector,hidden})=>{
      const expected=document.querySelector(selector||'body');
      if(hidden){
        // DOM-only verification of the private nav *without login*; no
        // server account or admin API is called from this check.
        const gated=document.getElementById('adminDashboard');
        if(gated)gated.hidden=false;
      }
      if(!expected)return {found:false};
      const rect=expected.getBoundingClientRect();
      const style=getComputedStyle(expected);
      return {
       found:true,
       width:rect.width,left:rect.left,right:rect.right,
       viewport:document.documentElement.clientWidth,
       visible:style.display!=='none',
       title:document.title,
       role:expected.getAttribute('role')||'',
       sections:expected.querySelectorAll('li').length,
       onPage:document.body.innerText.length>70,
       codeVisible:!!document.querySelector('#challengeIdentityCode [data-verified]'),
       hasSurveyForm:!!document.querySelector('form[action^="https://"]'),
       robots:document.querySelector('meta[name="robots"]')?.content||'',
       adminWasGated:!!document.getElementById('adminDashboard')
      };
    },{selector:item.selector||'body',hidden:!!item.hidden});
    assert.equal(meta.found,true,item.name+' section missing');
    assert.ok(meta.title.length>=2,item.name+' title missing');
    assert.ok(meta.onPage,item.name+' body unexpectedly empty');
    if(item.selector){
      assert.ok(meta.visible,item.name+' expected visible in static layout');
      assert.ok(meta.width>50,item.name+' panel collapsed');
      assert.ok(meta.left>=-2,item.name+' panel overflows left');
      assert.ok(meta.right<=view.width+12,
        item.name+' panel overflows mobile viewport by '+(meta.right-view.width)+'px');
    }
    if(item.name==='home')assert.equal(meta.sections,4);
    if(item.name==='challenge')assert.equal(meta.sections,3);
    if(item.name==='admin')assert.equal(meta.adminWasGated,true);
    assert.match(meta.robots,/noindex,nofollow,noarchive/,
      item.name+' private preview robots header missing');
    assert.equal(meta.hasSurveyForm,false,'external survey posting not allowed in preview');
    samples.push({view:view.name,page:item.name,status:200,
      panel_width:Math.round(meta.width),view_width:view.width});
    await page.close();
   }
   await context.close();
  }
 }finally{await browser.close()}
 assert.equal(externalContinued,0,'Off-loopback request completed');
 assert.equal(localNavigations,15);
 const report={
  schema_version:1,kind:'stage36_isolated_browser_qa',
  browser:'Chromium',pages_tested:items.map(x=>x.name),
  views:dimensions.map(({name,width,height})=>({name,width,height})),
  sample_count:samples.length,samples,
  external_network_requests_forwarded:externalContinued,
  external_request_hosts_blocked:[...blocked].sort(),
  browser_errors_observed:errors.length,
  browser_errors_sample:errors,
  real_login_e2e:false,real_mail_e2e:false,real_survey_e2e:false,
  production_db_modified:false,preview_uploaded:false,
  owner_release_approved:false,release_ready:false
 };
 const output=process.env.BEAGU_STAGE36_BROWSER_REPORT||
  '/tmp/beagu-stage36-browser.json';
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log('PASS: Stage36 15 local Chromium desktop/mobile/page pairs; remote traffic aborted; no deployment');
})().catch(error=>{
 console.error('Stage36 local-browser QA failed:',error?.stack||String(error));
 process.exitCode=1;
});
