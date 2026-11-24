const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright');
const origin='http://light-touch.invalid',mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
const fixture=Array.from({length:7},(_,i)=>({school_id:String(7003915+i),school_name:'검증초등학교 '+i,sido_standard:'부산',region:'부산',support_office:'동래교육지원청',address:'부산',visitors:12+i,growth:i,housing_price_won:123000000,student_count:200}));
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
try{for(const [width,tier] of [[390,0],[768,1],[1440,2]]){
 const context=await browser.newContext({viewport:{width,height:900}});
 try{await context.addInitScript(({origin,tier})=>{if(location.origin===origin&&tier)sessionStorage.setItem('beagu-level-session-v1','a'.repeat(64))},{origin,tier});
 let sorted=false, detailRequested=false,comparisonRequested=false;
 await context.route('**/*',async route=>{const u=new URL(route.request().url());const cors={'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS','content-type':'application/json'};
 if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:"window.supabase={createClient:()=>({from:()=>{const p={then:(a,b)=>Promise.resolve({data:[],count:0,error:null}).then(a,b)};for(const m of ['select','eq','in','limit','range','order','ilike','or','maybeSingle','single','gte','lte','not'])p[m]=()=>p;return p},rpc:async()=>({data:[],error:null})})};"});
 if(u.hostname.endsWith('.supabase.co')){if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
 const a=route.request().postDataJSON()?.action,token=route.request().headers()['x-beagu-session'];let data={};
 if(u.pathname.endsWith('/beagu-level-api')){
 if(a==='login')return route.fulfill({status:200,headers:cors,body:JSON.stringify({level:tier,token:'b'.repeat(64)})});
 if(a==='verify')data={level:tier,provisional:false};
 else if(a==='ranked_schools'){const b=route.request().postDataJSON();sorted ||= b.sort==='housing_price_won';data={schools:fixture.map(({housing_price_won,...v})=>tier===2?{...v,housing_price_won}:v),total:fixture.length};}
 else if(a==='school'){detailRequested=true;data={level:tier,rows:[],schoolQuestionModes:[],schoolQuestionSelections:[],schoolQuestionResults2026:[]};}
 else if(a==='offices')data={offices:['동래교육지원청']};
 else if(a==='percentiles')data={values:{}};
 else if(a==='logout')data={ok:true};
 else if(a==='survey_comparisons'){comparisonRequested=true;const b=route.request().postDataJSON();data={year:b.year,region:b.region,items:{}};}
 else throw Error('Unexpected level API fixture action: '+a);
 if(!tier||!token)return route.fulfill({status:401,headers:cors,body:'{}'});
 }else if(u.pathname.endsWith('/beagu-school-interest-v1'))data={rising:fixture.map(({housing_price_won,visitors,growth,...v})=>token?{...v,visitors,growth}:v)};
 return route.fulfill({status:200,headers:cors,body:JSON.stringify(data)});}
 if(u.origin!==origin)return route.abort();const p=decodeURIComponent(u.pathname).replace(/^\/+/, '');if(!p||p.includes('..'))return route.abort();
 try{return route.fulfill({contentType:mime[path.extname(p)]||'application/octet-stream',body:await fs.readFile(p)})}catch{return route.fulfill({status:404,body:''})}});
 const page=await context.newPage();await page.goto(origin+(tier?'/search-lv1.html':'/search.html'));
 await page.waitForFunction(()=>document.querySelectorAll('#beaguInterest li').length===5);
 assert.equal(await page.locator('#beaguInterest li').count(),5);
 assert.equal(await page.locator('.beagu-core-nav a:visible').count(),6);
 await page.waitForFunction(()=>document.querySelectorAll('#beaguTodaySchools .beagu-home-school-name').length===2);
 if(!tier){assert.equal(await page.locator('.beagu-interest-number').count(),0);assert.match(await page.locator('#beaguInterest li a').first().getAttribute('href'),/^school-report\.html\?school_id=/);}
 else{await page.locator('#searchInput').fill('검증초');await page.locator('#results .school-card').first().waitFor();assert.equal(await page.locator('#results .school-card').count(),7);
 await page.locator('.lv1-history-trigger').first().click();await page.waitForFunction(()=>document.querySelector('.lv1-history-trigger[aria-expanded="true"]'));await page.waitForFunction(()=>!!document.querySelector('#results .school-detail[data-loaded="1"]'));assert.equal(detailRequested,true);
 if(tier===1){await page.waitForFunction(()=>!document.querySelector('#results .school-year-details[aria-busy="true"]'));assert.equal(comparisonRequested,true);assert.equal(await page.locator('#searchPanel').isVisible(),true);}
 await page.locator('#regionTab').click();await page.locator('#regionSelect').selectOption('부산');await page.locator('#results[data-search-mode="region"] .school-card').first().waitFor();assert.equal(await page.locator('#results .beagu-housing-preview').count(),0);
 assert.equal(await page.locator('#regionSort option[value="housing_price_won"]').isDisabled(),tier===1);
 await page.locator('#officeSelect').selectOption('동래교육지원청');await page.waitForTimeout(350);assert.equal(await page.locator('#searchPanel').isVisible(),true);
 if(tier===2){await page.locator('#regionSort').selectOption('housing_price_won');await page.waitForTimeout(600);assert.equal(sorted,true);assert.equal(await page.locator('#results [data-sort-key="housing_price_won"]').count(),0);}
 }
 const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(dims.scroll<=dims.width+1,JSON.stringify(dims));
 if(tier){await page.locator('#beaguLevelState').click();await page.locator('#beaguParticipationLogout').click();await page.locator('#searchPanel').waitFor({state:'hidden'});assert.equal(await page.locator('#searchPanel').isVisible(),false);assert.equal(await page.locator('#results .school-card').count(),0);await page.waitForFunction(()=>document.querySelectorAll('.beagu-interest-number').length===0);
 await page.locator('#beaguLevelState').click();await page.locator('#beaguParticipationCode').fill('FIXTURE01');await page.locator('#beaguParticipationSubmit').click();await page.locator('#searchPanel').waitFor({state:'visible'});await page.locator('#schoolTab').click();await page.locator('#searchInput').fill('검증초');await page.locator('#results .school-card').first().waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('beagu-level-session-v1')),'b'.repeat(64));}
 console.log('PASS fixture search width='+width+' tier='+tier);
 }finally{await context.close()}
 }}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
