const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright');
const origin='http://court-fixture.invalid',mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
const school={school_id:'7003900',school_name:'아주긴이름의검증초등학교',sido_standard:'부산',sido:'부산',support_office:'부산광역시남부교육지원청',address:'부산광역시 부산진구 백양관문로77번길 17',establishment:'공립',status:'운영'};
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
try{for(const width of [320,390,768,1440]){const ctx=await browser.newContext({viewport:{width,height:900}});try{
await ctx.route('**/*',async route=>{const u=new URL(route.request().url());
if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:"window.supabase={createClient:()=>({from:(table)=>{let single=false;const q={then:(a,b)=>Promise.resolve({data:table==='schools'?(single?"+JSON.stringify(school)+":["+JSON.stringify(school)+"]):[],error:null}).then(a,b)};for(const m of ['select','eq','in','limit','range','order','ilike','or','gte','lte','not'])q[m]=()=>q;q.maybeSingle=q.single=()=>{single=true;return q};return q},rpc:async()=>({data:[],error:null})})};"});
if(u.hostname.endsWith('.supabase.co'))return route.fulfill({status:200,headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'},contentType:'application/json',body:'{}'});
if(u.origin!==origin)return route.abort();const p=decodeURIComponent(u.pathname).slice(1);if(!p||p.includes('..'))return route.abort();
if(p==='data/public-lv0-percentiles-v1.2.json')return route.fulfill({contentType:'application/json',body:JSON.stringify({data_version:'public-lv0-20261120-all-regions-verified-percentiles-v1.4',publication_status:'LV0_EXISTING_PUBLIC_SCOPE',rows:[{school_id:school.school_id,percentiles:[10,20,30],statuses:['EXISTING_PUBLIC_VALUE_PRESERVED','EXISTING_PUBLIC_VALUE_PRESERVED','VETTED_2025_EMPIRICAL_PERCENTILE']}]})});
try{return route.fulfill({contentType:mime[path.extname(p)]||'application/octet-stream',body:await fs.readFile(p)})}catch{return route.fulfill({status:404,body:''})}});
const page=await ctx.newPage();await page.goto(origin+'/school-report.html?school_id='+school.school_id);
await page.locator('#mainContent').waitFor({state:'visible'});await page.locator('#reportBasicCard').waitFor();
assert.equal(await page.locator('#schoolOffice').textContent(),'남부');
assert.match(await page.locator('#reportBasicCard').innerText(),/2025년/);assert.equal(await page.locator('#yearGrid button').count(),0);assert.equal(await page.locator('#beaguYearGraph svg').count(),0);assert.equal(await page.locator('.report-body').isVisible(),false);
assert.ok(await page.locator('#tierPanel').evaluate(e=>e.getBoundingClientRect().height<110));
assert.ok(await page.locator('.school-hero').evaluate(e=>e.getBoundingClientRect().height<280));
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
for(const id of ['reportPostitLink','reportExperienceLink']){assert.ok(await page.locator('#'+id).isVisible());assert.ok(await page.locator('#'+id).evaluate(e=>getComputedStyle(e).whiteSpace==='nowrap'));}
await page.locator('#tier1').click();await page.locator('#beaguParticipationTitle').waitFor({state:'visible'});assert.match(await page.locator('#beaguParticipationTitle').textContent(),/참여코드/);
await page.goto(origin+'/index.html');const rank=page.locator('#beagu2026Ranking');await rank.waitFor();assert.ok(await rank.evaluate(e=>e.previousElementSibling.id==='beaguTodaySchools'));assert.equal(await rank.locator('li').count(),0);assert.match(await rank.innerText(),/TOP 10.*TOP 30.*TOP 100/);
console.log('PASS court renewal full-page fixture',width);
}finally{await ctx.close()}}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
