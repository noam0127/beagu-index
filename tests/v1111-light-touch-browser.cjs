const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright');
const origin='http://light-touch.invalid',mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
let sameDaySchoolIds=null;
const fixture=Array.from({length:7},(_,i)=>({school_id:String(7003915+i),school_name:'검증초등학교 '+i,sido_standard:'부산',region:'부산',support_office:'동래교육지원청',address:'부산',visitors:12+i,growth:i,housing_price_won:123000000,student_count:200}));
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
try{for(const [width,tier] of [[390,0],[768,1],[1440,2]]){
 const context=await browser.newContext({viewport:{width,height:900},...(tier===0?{hasTouch:true,isMobile:true}:{})});
 try{await context.addInitScript(({origin,tier})=>{if(location.origin===origin&&tier)sessionStorage.setItem('beagu-level-session-v1','a'.repeat(64))},{origin,tier});
 let sorted=false, detailRequested=false,comparisonRequested=false;let selectedSchool=null,startedSchool=null;
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
 }else if(u.pathname.endsWith('/arcade-leaderboard')){
   if(route.request().method()==='POST'&&a==='start'){const body=route.request().postDataJSON();startedSchool=body.school_id;assert.equal(body.game,'volleyball_25');data={session:'fixture-only-session',school:selectedSchool};}
   else if(u.searchParams.has('school_id')){const id=u.searchParams.get('school_id');data={school:selectedSchool?.school_id===id?selectedSchool:{school_id:id,school_name:'다른 검증 학교',region:'부산',eligible:false,difficulty:null}};}
   else data={top10:[],fastestTop10:[]};
 }else if(u.pathname.endsWith('/beagu-school-interest-v1'))data={rising:fixture.map(({housing_price_won,visitors,growth,...v})=>token?{...v,visitors,growth}:v)};
 if(u.pathname.endsWith('/beagu-notice-audience-v1'))data={level:token?tier:0,notices:[{audience:'all',body:'공통 검증 공지'},{audience:String(token?tier:0),body:'레벨 검증 공지'}]};
 return route.fulfill({status:200,headers:cors,body:JSON.stringify(data)});}
 if(u.origin!==origin)return route.abort();const p=decodeURIComponent(u.pathname).replace(/^\/+/, '');if(!p||p.includes('..'))return route.abort();
 try{return route.fulfill({contentType:mime[path.extname(p)]||'application/octet-stream',body:await fs.readFile(p)})}catch{return route.fulfill({status:404,body:''})}});
 const page=await context.newPage();
 await page.clock.setFixedTime(new Date('2026-11-25T14:59:00Z'));
 await page.goto(origin+'/index.html');
 await page.waitForFunction(()=>document.querySelectorAll('#beaguTodaySchools .beagu-home-school-name').length===2);
 await page.waitForFunction(()=>document.querySelector('#beaguHomeNoticeBody').textContent==='공통 검증 공지');
 const ids=()=>page.locator('#beaguTodaySchools .beagu-home-school-name').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).searchParams.get('school_id')));
 const today=await ids();assert.equal(new Set(today).size,2);
 const experienceLinks=()=>page.locator('#beaguTodaySchools .court-school-experience').evaluateAll(nodes=>nodes.map(n=>({id:new URL(n.href).searchParams.get('school_id'),path:new URL(n.href).pathname,text:n.textContent})));
 assert.deepEqual((await experienceLinks()).map(n=>n.id),today);assert.ok((await experienceLinks()).every(n=>n.path==='/teacher-volleyball.html'&&n.text==='학교체험'));
 const detailLinks=()=>page.locator('#beaguTodaySchools .court-school-detail').evaluateAll(nodes=>nodes.map(n=>({id:new URL(n.href).searchParams.get('school_id'),path:new URL(n.href).pathname,text:n.textContent})));
 assert.deepEqual((await detailLinks()).map(n=>n.id),today);assert.ok((await detailLinks()).every(n=>n.path===(tier?'/search-lv1.html':'/school-report.html')&&n.text==='상세보기'));
 const cardLayout=await page.locator('#beaguTodaySchools .beagu-home-school').evaluateAll(cards=>cards.map(card=>{const rect=s=>card.querySelector(s).getBoundingClientRect();const c=card.getBoundingClientRect(),y=rect('.beagu-home-school-year'),d=rect('.court-school-detail'),e=rect('.court-school-experience');return {year:card.querySelector('.beagu-home-school-year').textContent,inside:d.left>=c.left&&e.right<=c.right&&e.bottom<=c.bottom,right:d.left>=y.right&&e.left>=d.right,aligned:Math.abs(d.top-e.top)<1,sameRow:y.top<d.bottom&&y.bottom>d.top}}));
 assert.ok(cardLayout.every(x=>x.year==='2025년 기준'&&x.inside&&x.right&&x.aligned&&x.sameRow),JSON.stringify(cardLayout));
 assert.equal(await page.getByText('학교별 근무난이도 게임으로 확인하기',{exact:true}).count(),0);
 if(sameDaySchoolIds)assert.deepEqual(today,sameDaySchoolIds);else sameDaySchoolIds=today;
 assert.equal(await page.locator('.beagu-core-nav a:visible').count(),5);
 assert.equal(await page.locator('.light-touch-visit.card').count(),1);
 const layout=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect();return {actions:box('.beagu-home-actions').bottom,schools:box('#beaguTodaySchools').top,visits:box('.light-touch-visit').bottom,notice:box('.beagu-home-notice').top,columns:getComputedStyle(document.querySelector('.light-touch-visit>div')).gridTemplateColumns.split(' ').length,scroll:document.documentElement.scrollWidth,width:innerWidth};});
 assert.ok(layout.actions<=layout.schools+1&&layout.visits<=layout.notice+1,JSON.stringify(layout));assert.equal(layout.columns,3);assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));
 assert.equal(await page.locator('#courtNoticeToggle').getAttribute('aria-expanded'),'false');
 await page.locator('#courtNoticeToggle').click();assert.equal(await page.locator('#courtNoticeToggle').getAttribute('aria-expanded'),'true');
 await page.locator('#courtNoticeToggle').click();assert.equal(await page.locator('#courtNoticeToggle').getAttribute('aria-expanded'),'false');
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#beaguTodaySchools .beagu-home-school-name').length===2);assert.deepEqual(await ids(),today);
 await page.clock.setFixedTime(new Date('2026-11-25T15:00:01Z'));
 await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
 const tomorrow=await ids();assert.ok(tomorrow.every((id,i)=>id!==today[i]),JSON.stringify({today,tomorrow}));
 assert.deepEqual((await experienceLinks()).map(n=>n.id),tomorrow);assert.deepEqual((await detailLinks()).map(n=>n.id),tomorrow);
 // Use the real game page and its existing school picker + Start button; all API calls are intercepted.
 const cardIndex=tier===1?1:0;
 selectedSchool={school_id:tomorrow[cardIndex],school_name:await page.locator('#beaguTodaySchools .beagu-home-school-name').nth(cardIndex).innerText(),region:'부산',eligible:true,difficulty:cardIndex?'extreme':'easy'};
 await page.locator('#beaguTodaySchools .court-school-experience').nth(cardIndex).click();
 await page.waitForFunction(s=>document.querySelector('#volley-ready-title')?.textContent===s.school_name,selectedSchool);
 assert.equal(new URL(page.url()).pathname,'/teacher-volleyball.html');assert.equal(new URL(page.url()).searchParams.get('school_id'),selectedSchool.school_id);
 assert.equal(await page.locator('#arcade-school-picker').getAttribute('data-school-id'),selectedSchool.school_id);
 assert.match(await page.locator('#volley-ready-detail').innerText(),new RegExp(selectedSchool.difficulty.toUpperCase()));
 assert.equal(await page.locator('#start').isEnabled(),true);
 await page.locator('#volley-school-choose').click();
 await page.waitForFunction(()=>document.querySelector('#start')?.textContent.includes('여기까지 기록'));
 assert.equal(startedSchool,selectedSchool.school_id);
 if(tier===0){
  await page.locator('#volley-attack').waitFor({state:'visible'});
  assert.equal(await page.locator('#volley-joystick,#volley-spike,#volley-dash').count(),0);
  const boxes=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {courtBottom:r('#game').bottom,attackTop:r('#volley-attack').top,pauseTop:r('#pause').top}});
  assert.ok(boxes.attackTop>=boxes.courtBottom-1&&boxes.pauseTop>=boxes.courtBottom-1,JSON.stringify(boxes));
  await page.evaluate(()=>document.querySelector('#volley-attack').dispatchEvent(new PointerEvent('pointerdown',{pointerId:32,pointerType:'touch',bubbles:true,cancelable:true})));
  assert.equal(await page.locator('#volley-attack').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>document.querySelector('#volley-attack').dispatchEvent(new PointerEvent('pointercancel',{pointerId:32,pointerType:'touch',bubbles:true})));
  assert.equal(await page.locator('#volley-attack').getAttribute('aria-pressed'),'false');
 }
 await page.goto(origin+'/teacher-volleyball.html?school_id='+tomorrow[1-cardIndex]);
 await page.waitForFunction(()=>document.querySelector('#volley-ready-title')?.textContent==='조사 참여 필요');
 assert.equal(await page.locator('#start').isDisabled(),true);
 await page.goto(origin+(tier?'/search-lv1.html':'/search.html'));
 await page.waitForFunction(()=>document.querySelectorAll('#beaguInterest li').length===5);
 assert.equal(await page.locator('#beaguInterest li').count(),5);
 assert.equal(await page.locator('.beagu-core-nav a:visible').count(),5);
 assert.equal(await page.locator('#beaguTodaySchools').count(),0);
 assert.equal(await page.getByText('2026 자료 공개 기준',{exact:true}).count(),0);
 if(!tier){assert.equal(await page.locator('.beagu-interest-number').count(),0);assert.match(await page.locator('#beaguInterest li a').first().getAttribute('href'),/^school-report\.html\?school_id=/);}
 else{await page.locator('#searchInput').fill('검증초');await page.locator('#results .school-card').first().waitFor();assert.equal(await page.locator('#results .school-card').count(),7);
 // Actual available content width controls the layout, not the window width.
 for(const w of [360,390,768,1024,1440,1920]){
  await page.setViewportSize({width:w,height:900});
  const layout=await page.locator('#results').evaluate(el=>{const container=el.closest('#searchPanel')||el.closest('main');const available=container.getBoundingClientRect().width-parseFloat(getComputedStyle(container).paddingLeft)-parseFloat(getComputedStyle(container).paddingRight);return {available,columns:getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length,scroll:document.documentElement.scrollWidth,width:innerWidth}});
  const expected=layout.available>=1440?4:layout.available>=1024?3:layout.available>=600?2:1;
  assert.equal(layout.columns,expected,JSON.stringify(layout));assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));
 }
 await page.setViewportSize({width,height:900});
 assert.equal(await page.locator('#results .school-card .court-school-experience').count(),7);
 assert.equal(await page.locator('#results .school-card .court-school-experience').first().getAttribute('href'),'teacher-volleyball.html?school_id='+fixture[0].school_id);
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
