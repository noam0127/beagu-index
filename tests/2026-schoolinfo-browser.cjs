const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright');
const origin='http://school-profile-fixture.invalid',mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
const schools=[0,1,2].map(i=>({school_id:String(7003900+i),school_name:'검증초등학교 '+i,sido_standard:'부산',region:'부산',support_office:'동래교육지원청',address:'부산',student_count:200,student_reference_year:2025,male_teacher_ratio:25,junior_teacher_ratio:20}));
(async()=>{const {projectOfficialProfiles2026}=await import('../supabase/functions/_shared/official-school-profile-2026.mjs');
const official=projectOfficialProfiles2026([{school_id:schools[0].school_id,disclosure_code:'S000000001',source_year:2026,teacher_total:20,profile:{school_name:schools[0].school_name,closed:'N',suspended:'N',teacher_total:20,male_teachers:5,female_teachers:15,second_grade_teachers:4,survey_response:'PRIVATE_FIXTURE',valid_observation_count:1}},{school_id:schools[1].school_id,disclosure_code:'S000000002',source_year:2026,teacher_total:null,profile:{school_name:schools[1].school_name,closed:'N',suspended:'N'}}],schools.map(s=>s.school_id),2);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const tier of [1,2])for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:900}});try{
 await context.addInitScript(({origin})=>{if(location.origin===origin&&!sessionStorage.getItem('fixture-init')){sessionStorage.setItem('fixture-init','1');sessionStorage.setItem('beagu-level-session-v1','a'.repeat(64));}},{origin});
 let requested=0;
 await context.route('**/*',async route=>{const u=new URL(route.request().url());const cors={'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};
 if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:"window.supabase={createClient:()=>({from:()=>{const p={then:(a,b)=>Promise.resolve({data:[],count:0,error:null}).then(a,b)};for(const m of ['select','eq','in','limit','range','order','ilike','or','maybeSingle','single','gte','lte','not'])p[m]=()=>p;return p},rpc:async()=>({data:[],error:null})})};"});
 if(u.hostname.endsWith('.supabase.co')){if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});let b={};try{b=route.request().postDataJSON()||{}}catch{};let data={};
 if(u.pathname.endsWith('/beagu-level-api')){if(b.action==='verify')data={level:tier,provisional:false};else if(b.action==='ranked_schools')data={schools,total:schools.length};else if(b.action==='percentiles'){requested++;data={values:{[schools[0].school_id]:0},official2026:official,official2026_status:'OK'};}else if(b.action==='offices')data={offices:['동래교육지원청']};else if(b.action==='school')data={level:tier,rows:[],schoolQuestionModes:[],schoolQuestionSelections:[],schoolQuestionResults2026:[{questionId:'Q01',row:-1,values:['보통이다']},{questionId:'Q31',row:-1,values:['PRIVATE_FIXTURE']}]};else if(b.action==='survey_comparisons')data={year:b.year,region:b.region,items:{}};}
 else if(u.pathname.endsWith('/beagu-school-interest-v1'))data={rising:schools};else if(u.pathname.endsWith('/beagu-notice-audience-v1'))data={level:tier,notices:[]};
 return route.fulfill({status:200,headers:cors,body:JSON.stringify(data)});}
 if(u.origin!==origin)return route.abort();const p=decodeURIComponent(u.pathname).split('/').filter(Boolean).join('/');if(!p||p.includes('..'))return route.abort();
 if(p==='data/public-lv0-percentiles-v1.2.json')return route.fulfill({contentType:'application/json',body:JSON.stringify({data_version:'public-lv0-20261120-all-regions-verified-percentiles-v1.4',publication_status:'LV0_EXISTING_PUBLIC_SCOPE',rows:schools.map((school,i)=>({school_id:school.school_id,percentiles:[10,20,i===2?null:35+i],statuses:['EXISTING_PUBLIC_VALUE_PRESERVED','EXISTING_PUBLIC_VALUE_PRESERVED',i===2?'NO_PUBLISHED_VALUE':'VETTED_2025_EMPIRICAL_PERCENTILE']}))})});
 try{return route.fulfill({contentType:mime[path.extname(p)]||'application/octet-stream',body:await fs.readFile(p)})}catch{return route.fulfill({status:404,body:''})}});
 const page=await context.newPage();await page.goto(origin+'/search-lv1.html');await page.locator('#searchPanel').waitFor({state:'visible'});const response=page.waitForResponse(r=>r.url().endsWith('/beagu-level-api')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='percentiles');await page.locator('#searchInput').fill('검증초');await response;await page.locator('#results .school-card').last().waitFor();assert.equal(await page.locator('#results .school-card').count(),3);await page.waitForFunction(()=>!document.querySelector('.official-school-basics-2026')?.title.includes('확인 중'));assert.ok(requested>0);
 const cards=page.locator('#results .school-card');
 assert.equal(await page.locator('.official-school-basics-2026').count(),3);
 assert.equal(await page.locator('details.official-school-basics-2026,.glory-region').count(),0);
 for(const card of await cards.all()){
  assert.equal(await card.locator('.glory-fact').count(),3);
  assert.deepEqual(await card.locator('.glory-fact-label').allTextContents(),['학생 수','남교원 비율','2급 정교사 비율']);
  assert.deepEqual(await card.locator('.glory-fact-value').allTextContents(),['200명','25%','20%']);
  assert.deepEqual(await card.locator('.glory-fact-year').allTextContents(),['2025년 기준','2024년 기준','2024년 기준']);
  assert.equal(await card.locator('.official-school-basics-2026').textContent(),'학교 기본정보');
 }
 assert.doesNotMatch(await page.locator('#results').innerText(),/PRIVATE_FIXTURE|총교원 수|학교 팩스|법정동코드/);

 await page.waitForFunction(t=>document.querySelector('#results .school-card .glory-percentile')?.dataset.displayYear===String(t===2?2026:2025),tier);
 assert.equal(await cards.nth(0).locator('.glory-score').textContent(),tier===2?'0.0%':'35.0%');
 assert.equal(await cards.nth(1).locator('.percentile-heading').textContent(),'2025 배구지수');
 assert.equal(await cards.nth(1).locator('.glory-score').textContent(),'36.0%');
 assert.equal(await cards.nth(2).locator('.glory-score').textContent(),tier===2?'20.0%':'자료 없음');
 assert.equal(await cards.nth(2).locator('.percentile-heading').textContent(),tier===2?'2024 배구지수':'2025 배구지수');
 assert.equal(await cards.locator('.percentile-graph').count(),0);
 await cards.nth(0).locator('.glory-detail-trigger').click();
 const detail=cards.nth(0).locator('.school-detail');
 await detail.locator('.beagu-yearly-percentiles').waitFor();
 assert.equal(await detail.locator('.beagu-school-basics').count(),0);
 assert.equal(await detail.locator('.beagu-yearly-percentiles .percentile-cell').count(),4);
 assert.equal(await detail.locator('.year-tabs button[data-year="2026"]').count(),1);
 assert.equal(await detail.locator('.percentile-graph svg').count(),1);
 await detail.locator('.year-tabs button[data-year="2026"]').click();
 await detail.locator('.beagu-question-block').first().waitFor();
 assert.match(await detail.locator('.beagu-question-block').first().innerText(),/Q01/);
 assert.doesNotMatch(await detail.locator('.school-year-details').innerText(),/PRIVATE_FIXTURE|Q31/);
 if(tier===1){assert.match(await detail.locator('.beagu-yearly-percentiles').innerText(),/2026/);assert.match(await detail.locator('.beagu-yearly-percentiles').innerText(),/2023/);}

 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));console.log('PASS Chromium school profile',tier,width);
 }finally{await context.close()}}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
