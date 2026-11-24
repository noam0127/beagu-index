const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright');
const {instrumentTrustedSource,replayInPage}=require('../docs/run4-ranking-preflight/replay-engine.cjs');
const origin='http://light-touch.invalid',mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
const fixture=Array.from({length:7},(_,i)=>({school_id:String(7003915+i),school_name:'검증초등학교 '+i,sido_standard:'부산',region:'부산',support_office:'동래교육지원청',address:'부산',visitors:12+i,growth:i,housing_price_won:123000000,student_count:200}));
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
try{for(const [width,tier] of [[390,0],[768,1],[1440,2]]){
 const context=await browser.newContext({viewport:{width,height:900},...(tier===0?{hasTouch:true,isMobile:true}:{})});
 try{await context.addInitScript(({origin,tier})=>{if(location.origin===origin&&tier)sessionStorage.setItem('beagu-level-session-v1','a'.repeat(64))},{origin,tier});
 let sorted=false, detailRequested=false,comparisonRequested=false;let selectedSchool=null,startedSchool=null,officialFixture=false;const officialCalls=[];
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
 }else if(u.pathname.endsWith('/run4-official')){
   assert.equal(officialFixture,true);assert.ok(token);const body=route.request().postDataJSON();officialCalls.push(body);
   if(a==='start')data={game:'teacher_run_retirement_v4',version:'4.0',session:'11111111-1111-4111-8111-111111111111',difficulty:selectedSchool.difficulty,seed:42};
   else if(a==='submit'){assert.deepEqual(Object.keys(body).sort(),['action','replay','sessionId']);data={game:'teacher_run_retirement_v4',version:'4.0',score:0,retired:false,bossCount:0};}
   else if(a==='list')data={game:'teacher_run_retirement_v4',version:'4.0',records:[{score:17626,difficulty:'easy',survivalSeconds:190,retired:true,bossCount:5}]};
   else throw Error('unexpected official action');
 }else if(u.pathname.endsWith('/arcade-leaderboard')){
   if(route.request().method()==='POST'&&a==='start'){const body=route.request().postDataJSON();startedSchool=body.school_id;assert.equal(body.game,'volleyball_25');data={session:'fixture-only-session',school:selectedSchool};}
   else if(u.searchParams.has('school_id')){const id=u.searchParams.get('school_id');data={school:selectedSchool?.school_id===id?selectedSchool:{school_id:id,school_name:'다른 검증 학교',region:'부산',eligible:false,difficulty:null}};}
   else data={top10:[],fastestTop10:[]};
 }else if(u.pathname.endsWith('/beagu-school-interest-v1'))data={rising:fixture.map(({housing_price_won,visitors,growth,...v})=>token?{...v,visitors,growth}:v)};
 if(u.pathname.endsWith('/beagu-notice-audience-v1'))data={level:token?tier:0,notices:[{audience:'all',body:'공통 검증 공지'},{audience:String(token?tier:0),body:'레벨 검증 공지'}]};
 return route.fulfill({status:200,headers:cors,body:JSON.stringify(data)});}
 if(u.origin!==origin)return route.abort();const p=decodeURIComponent(u.pathname).replace(/^\/+/, '');if(!p||p.includes('..'))return route.abort();
 try{
  let body=await fs.readFile(p);
  if(p==='js/run4-official-client-v1.js'&&officialFixture)body=body.toString('utf8').replace('enabled:false,endpoint:','enabled:true,endpoint:');
  if(p==='teacher-run-4-preview.html'){
   if(u.searchParams.get('replay_fixture')==='1')return route.fulfill({contentType:'text/html',body:instrumentTrustedSource(body.toString('utf8'))});
   // Fixture-only accelerated clock. Production game code is not instrumented.
   // Restore HP to isolate lifecycle integration from stochastic survival balance.
   const anchor='resize();intro();requestAnimationFrame(tick);postHeight();';
   const source=body.toString('utf8');assert.ok(source.includes(anchor));
   body=source.replace(anchor,`resize();intro();postHeight();
    window.__run4Fixture=Object.freeze({
      snapshot:()=>({state,clock,stage,life,maxLife,leave:leave.state(),boss:bosses.active(),defeated:bosses.defeated(),allies:allies.count(),score}),
      advance:target=>{for(let i=0;i<6000&&state==="playing"&&clock<target;i++){life=maxLife;update(Math.min(.04,Math.max(1e-7,target-clock)));}draw();syncLeave();return window.__run4Fixture.snapshot();},
      // Test-only legal steering: inspect nearby hazards and choose a reachable
      // target, never assign HP, invulnerability, score or actual player position.
      naturalAdvance:target=>{
       let aimAt=-1;
       for(let i=0;i<6000&&state==="playing"&&clock<target;i++){
        if(clock>=aimAt){
         aimAt=clock+.18;
         const threats=[
          ...items.filter(a=>!a.good).map(a=>({x:a.x,y:a.y,vx:0,vy:a.speed,r:a.r})),
          ...paperBullets.map(a=>({x:a.x,y:a.y,vx:a.vx,vy:a.vy,r:a.r})),
          ...bossProjectiles.filter(a=>!a.friendly).map(a=>({x:a.x,y:a.y,vx:a.vx,vy:a.vy,r:a.r})),
          ...sideStudents.map(a=>({x:a.x,y:a.y-10,vx:a.vx*(175+stage*10),vy:0,r:a.r}))
         ];
         const xs=Array.from({length:11},(_,n)=>27+(W-54)*n/10),ys=canPlayerRise()?[Math.max(76,H*.35),H*.60,H-52]:[H-52];
         let bestAim={x:player.x,y:player.y},bestUtility=-Infinity,minGap=Infinity;
         for(const a of threats)minGap=Math.min(minGap,Math.hypot(player.x-a.x,player.y-a.y)-a.r-player.r);
         for(const x of xs)for(const y of ys){
          const distance=Math.hypot(x-player.x,y-player.y);
          let utility=-distance*.025;
          for(const a of threats)for(const t of [.18,.4,.65]){
           const fraction=Math.min(1,285*profile.heroSpeed*growth.effects().speed*t/Math.max(1,distance));
           const px=player.x+(x-player.x)*fraction,py=player.y+(y-player.y)*fraction;
           const gap=Math.hypot(px-a.x-a.vx*t,py-a.y-a.vy*t)-a.r-player.r;
           if(gap<60)utility-=(60-gap)*(gap<0?4:1);
          }
          for(const a of items)if(a.good&&a.y>H*.2){const d=Math.hypot(x-a.x,y-a.y-a.speed*.35);if(d<85)utility+=(85-d)*(.25+(1-life/maxLife)*.45);}
          if(utility>bestUtility){bestUtility=utility;bestAim={x,y};}
         }
         pointerId=999;pointerX=bestAim.x;pointerY=bestAim.y;
         // Use the same available actions and cooldowns as a real player.
         const held=leave.state().held;
         if(life/maxLife<.55&&held.length&&!leave.active(clock)){
          const b=leave.use(held[held.length-1].years,clock,life,maxLife,bosses.tier.leave);
          if(b)life=b.hp; // actual legal leave healing, not a fixture HP reset
         }
         if((minGap<20||bosses.active())&&specialCooldown<=0)activateSpecial();
         if(allies.canCooperate(clock)&&(life/maxLife<.65||bosses.active()))cooperate();
         for(const p of leave.state().pending)leave.collect(p.years);
        }
        update(Math.min(.04,Math.max(1e-7,target-clock)));
       }
       draw();syncLeave();return window.__run4Fixture.snapshot();
      }
    });`);
  }
  return route.fulfill({contentType:mime[path.extname(p)]||'application/octet-stream',body})
 }catch{return route.fulfill({status:404,body:''})}});
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
 assert.equal(await page.locator('#beaguTodaySchools .beagu-home-showcase-head span').innerText(),'새로고침마다 변경');
 assert.equal(await page.locator('.beagu-core-nav a:visible').count(),5);
 assert.equal(await page.locator('.light-touch-visit.card').count(),1);
 const layout=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect();return {actions:box('.beagu-home-actions').bottom,schools:box('#beaguTodaySchools').top,visits:box('.light-touch-visit').bottom,notice:box('.beagu-home-notice').top,columns:getComputedStyle(document.querySelector('.light-touch-visit>div')).gridTemplateColumns.split(' ').length,scroll:document.documentElement.scrollWidth,width:innerWidth};});
 assert.ok(layout.actions<=layout.schools+1&&layout.visits<=layout.notice+1,JSON.stringify(layout));assert.equal(layout.columns,3);assert.ok(layout.scroll<=layout.width+1,JSON.stringify(layout));
 assert.equal(await page.locator('#courtNoticeToggle').getAttribute('aria-expanded'),'false');
 await page.locator('#courtNoticeToggle').click();assert.equal(await page.locator('#courtNoticeToggle').getAttribute('aria-expanded'),'true');
 await page.locator('#courtNoticeToggle').click();assert.equal(await page.locator('#courtNoticeToggle').getAttribute('aria-expanded'),'false');
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#beaguTodaySchools .beagu-home-school-name').length===2);
 const refreshed=await ids();assert.ok(refreshed.every((id,i)=>id!==today[i]),JSON.stringify({today,refreshed}));
 await page.clock.setFixedTime(new Date('2026-11-25T15:00:01Z'));
 await page.evaluate(()=>{window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('beagu:level-state-updated'));});
 assert.deepEqual(await ids(),refreshed,'midnight and auth repaint do not resample');
 const again=await ids();
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#beaguTodaySchools .beagu-home-school-name').length===2);
 const tomorrow=await ids();assert.ok(tomorrow.every((id,i)=>id!==again[i]),JSON.stringify({again,tomorrow}));
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
  await page.waitForTimeout(5000);
  await page.locator('#start').click();
  await page.locator('.arcade-result-full').waitFor({state:'visible'});
  assert.match(await page.locator('.arcade-result-title').innerText(),/도전의 기록/);
  await page.waitForFunction(()=>!document.querySelector('.arcade-result-copy').disabled);
  assert.equal(await page.locator('.arcade-result-brag').getAttribute('href'),'https://indischool.com/tweets/channels/lounge');
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
 if(tier===2){
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  selectedSchool={...selectedSchool,difficulty:'easy',eligible:true};
  await page.goto(origin+'/teacher-run-4-preview.html?school_id='+selectedSchool.school_id);
  await page.locator('#teacher-run-protected').waitFor({state:'visible'});
  await page.getByRole('button',{name:'▶ 이 학교로 시작',exact:true}).waitFor();
  await page.getByRole('button',{name:'▶ 이 학교로 시작',exact:true}).click();
  await page.waitForFunction(()=>window.__run4Fixture?.snapshot().state==='playing');
  let result=await page.evaluate(()=>window.__run4Fixture.advance(25.01));
  assert.equal(result.state,'between');assert.ok(Math.abs(result.clock-25)<.06);assert.equal(result.leave.pending[0].days,3);
  assert.equal(await page.locator('#choices button').count(),3);
  await page.locator('#choices button').first().click();
  await page.locator('#run4-leave-inventory button.run4-leave-pick').click();
  await page.locator('#run4-leave-inventory').getByRole('button',{name:'5년 휴가권 3일 사용'}).click();
  assert.equal((await page.evaluate(()=>window.__run4Fixture.snapshot())).leave.used,1);
  for(const year of [10,15,20,25,30,35]){
   result=await page.evaluate(t=>window.__run4Fixture.advance(t),year*5+.05);
   assert.equal(result.state,'between',JSON.stringify({year,result}));assert.ok(Math.abs(result.clock-year*5)<.08);assert.equal(await page.locator('#choices button').count(),3);
   await page.locator('#choices button').first().click();
  }
  result=await page.evaluate(()=>window.__run4Fixture.advance(190));
  assert.equal(result.state,'over');assert.equal(result.clock,190);assert.match(await page.locator('#overlayTitle').innerText(),/정년퇴직/);
  assert.equal(await page.locator('#choices button').count(),2);assert.match(await page.locator('#overlayDesc').innerText(),/보스 .*\/5/);
  assert.match(await page.locator('#overlayDesc').innerText(),/교실을 지켜왔습니다/);
  await page.waitForFunction(()=>!document.querySelector('.arcade-result-copy').disabled);
  assert.equal(await page.locator('.arcade-result-brag').getAttribute('href'),'https://indischool.com/tweets/channels/lounge');
  await page.getByRole('button',{name:'↻ 다시 하기',exact:true}).click();
  await page.waitForFunction(()=>window.__run4Fixture.snapshot().state==='playing'&&window.__run4Fixture.snapshot().clock===0);
  assert.equal((await page.evaluate(()=>window.__run4Fixture.snapshot())).leave.used,0);
  assert.deepEqual(errors,[]);
  console.log('PASS 4.0 actual page lifecycle with fixture-only accelerated clock and restored HP (not natural-play balance)');
  const outcomes=[];
  for(const difficulty of ['easy','normal','hard','very_hard','extreme']){
   selectedSchool={...selectedSchool,difficulty};
   await page.goto(origin+'/teacher-run-4-preview.html?school_id='+selectedSchool.school_id);
   await page.locator('#teacher-run-protected').waitFor({state:'visible'});
   const start=page.getByRole('button',{name:'▶ 이 학교로 시작',exact:true});await start.waitFor();
   await page.evaluate(()=>{let seed=20261125;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
   await start.click();await page.waitForFunction(()=>window.__run4Fixture?.snapshot().state==='playing');
   let run;
   for(let step=0;step<9;step++){
    run=await page.evaluate(()=>window.__run4Fixture.naturalAdvance(190));
    if(run.state==='over')break;
    assert.equal(run.state,'between',JSON.stringify({difficulty,step,state:run.state,clock:run.clock}));
    const buttons=page.locator('#choices button'),labels=await buttons.allTextContents();
    const priorities=['자기관리','생활지도','위기 대응','동료 관계','교육자의 신념','학급운영','수업 전문성','업무 능력','교직 경험','전문적 학습공동체'];
    const chosen=priorities.map(label=>labels.findIndex(x=>x.includes(label))).find(i=>i>=0);
    await buttons.nth(chosen??0).click();
   }
   assert.equal(run?.state,'over');
   assert.ok(Number.isFinite(run.score)&&run.score>=0&&run.life>=0&&run.life<=run.maxLife);
   outcomes.push({difficulty,seconds:Number(run.clock.toFixed(2)),bosses:run.defeated.length,score:run.score,retired:run.clock===190});
   console.log('RUN4_TIER_PROBE '+JSON.stringify(outcomes[outcomes.length-1]));
   await page.waitForFunction(()=>!document.querySelector('.arcade-result-copy').disabled);
   const records=await page.evaluate(()=>JSON.parse(localStorage.getItem('beaguRun4LocalRecordsV1')||'[]'));
   assert.ok(records.length>0,'4.0 local results must actually persist');
   assert.ok(records.every(r=>r.game==='teacher_run_retirement_v4'&&r.version==='4.0'&&!('school_id'in r)&&!('school_name'in r)&&!('verified'in r)));
  }
  console.log('RUN4_NATURAL_BALANCE '+JSON.stringify(outcomes));
  // Run the actual game physics twice with identical input in two viewport sizes.
  selectedSchool={...selectedSchool,difficulty:'normal',eligible:true};
  const trace=[{tick:0,action:'move',x:.5,y:.85},{tick:120,action:'move',x:.25,y:.7},{tick:240,action:'release'},{tick:300,action:'stop'}];
  async function reproduce(viewport,events=trace){
   await page.setViewportSize(viewport);
   await page.goto(origin+'/teacher-run-4-preview.html?school_id='+selectedSchool.school_id+'&replay_fixture=1&recording=1');
   await page.locator('#teacher-run-protected').waitFor({state:'visible'});
   await page.getByRole('button',{name:'▶ 이 학교로 시작',exact:true}).waitFor();
   return replayInPage(page,{seed:42,difficulty:'normal',replay:events,elapsed:6});
  }
  const replayA=await reproduce({width:390,height:700});
  const replayB=await reproduce({width:1440,height:900});
  assert.deepEqual(replayA,replayB);assert.equal(replayA.victory,false);assert.equal(replayA.survivalSeconds,5);
  await assert.rejects(()=>reproduce({width:390,height:700},[{tick:0,action:'leave',choice:20},{tick:300,action:'stop'}]),/invalid_leave/);
  await assert.rejects(()=>reproduce({width:390,height:700},[{tick:0,action:'move',x:.5,y:.5,score:999999},{tick:300,action:'stop'}]),/invalid_replay/);
  // Real UI pointer/keyboard capture in the same deterministic practice mode.
  await page.goto(origin+'/teacher-run-4-preview.html?school_id='+selectedSchool.school_id+'&replay_fixture=1&recording=1');
  await page.locator('#teacher-run-protected').waitFor({state:'visible'});
  await page.getByRole('button',{name:'▶ 이 학교로 시작',exact:true}).waitFor();
  await page.evaluate(()=>window.__trustedRun4Replay.startSeed(42));
  const game=page.locator('#game');await game.scrollIntoViewIfNeeded();const rect=await game.boundingBox();
  await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.8);
  await page.mouse.down();await page.evaluate(()=>window.__trustedRun4Replay.stepTo(60));await page.mouse.up();
  await game.focus();await page.keyboard.down('ArrowRight');await page.evaluate(()=>window.__trustedRun4Replay.stepTo(120));await page.keyboard.up('ArrowRight');
  await page.locator('#pause').click();await page.getByRole('button',{name:'↩ 처음으로',exact:true}).click();
  await page.waitForFunction(()=>!!window.__trustedRun4Replay.envelope());
  const captured=await page.evaluate(()=>window.__trustedRun4Replay.envelope());
  assert.ok(captured.events.some(e=>e.action==='move')&&captured.events.some(e=>e.action==='keys')&&captured.events.at(-1).action==='stop');
  assert.deepEqual(await reproduce({width:1440,height:900},captured.events),captured.result);
  // Full legal-input EASY recording through all seven growth prompts, no HP resets.
  selectedSchool={...selectedSchool,difficulty:'easy'};
  await page.goto(origin+'/teacher-run-4-preview.html?school_id='+selectedSchool.school_id+'&replay_fixture=1&recording=1');
  await page.locator('#teacher-run-protected').waitFor({state:'visible'});
  await page.getByRole('button',{name:'▶ 이 학교로 시작',exact:true}).waitFor();
  await page.evaluate(()=>window.__trustedRun4Replay.startSeed(20261125));
  let full;
  for(let i=0;i<9;i++){
   full=await page.evaluate(()=>window.__trustedRun4Replay.autoAdvance());
   if(full.state==='over')break;
   assert.equal(full.state,'between');
   const buttons=page.locator('#choices button'),labels=await buttons.allTextContents();
   const preferred=['자기관리','생활지도','위기 대응','동료 관계','교육자의 신념','학급운영','수업 전문성','업무 능력','교직 경험','전문적 학습공동체'].map(label=>labels.findIndex(x=>x.includes(label))).find(i=>i>=0);
   await buttons.nth(preferred??0).click();
  }
  const fullCapture=await page.evaluate(()=>window.__trustedRun4Replay.envelope());
  assert.equal(full.clock,190,JSON.stringify(full));assert.equal(fullCapture.result.victory,true);assert.equal(fullCapture.events.at(-1).tick,11400);
  await page.setViewportSize({width:390,height:700});
  await page.goto(origin+'/teacher-run-4-preview.html?school_id='+selectedSchool.school_id+'&replay_fixture=1&recording=1');
  await page.locator('#teacher-run-protected').waitFor({state:'visible'});await page.getByRole('button',{name:'▶ 이 학교로 시작',exact:true}).waitFor();
  const fullReplay=await replayInPage(page,{seed:fullCapture.seed,difficulty:'easy',replay:fullCapture.events,elapsed:190});
  assert.deepEqual(fullReplay,fullCapture.result);
  console.log('PASS RUN4_FULL_REPLAY '+JSON.stringify({events:fullCapture.events.length,result:fullReplay}));
  // Actual replay engine through the server boundary (fixture auth/store only).
  const {createBoundary}=require('../docs/run4-ranking-preflight/server-boundary.cjs');
  const {createReplayVerifier}=require('../docs/run4-ranking-preflight/replay-worker.cjs');
  const vm=require('node:vm'),policyWindow={};
  vm.runInNewContext(await fs.readFile('js/teacher-run-4-records-v1.js','utf8'),{window:policyWindow});
  const policy=policyWindow.BeaguRun4Records,actorHash='a'.repeat(64);
  const sid='11111111-1111-4111-8111-111111111111';
  let serverTime=0,serverSession=null,verifiedResult=null,opened=0,closed=0;
  const verifier=createReplayVerifier({maxConcurrent:1,openTrustedPage:async difficulty=>{
   assert.equal(difficulty,'easy');opened++;
   const worker=await context.newPage();
   try{
    await worker.goto(origin+'/teacher-run-4-preview.html?school_id='+selectedSchool.school_id+'&replay_fixture=1&recording=1');
    await worker.locator('#teacher-run-protected').waitFor({state:'visible'});
    await worker.getByRole('button',{name:'▶ 이 학교로 시작',exact:true}).waitFor();
    return {page:worker,dispose:async()=>{closed++;await worker.close();}};
   }catch(e){closed++;await worker.close();throw e;}
  }});
  const boundary=createBoundary({policy,authenticate:async c=>c==='fixture-lv1'?{level:1,hash:actorHash}:null,
   resolveSchool:async id=>id===selectedSchool.school_id?{eligible:true,difficulty:'easy'}:null,
   store:{createIfBelowLimit:async session=>{if(serverSession)return false;serverSession=session;return true;},get:async id=>id===sid?serverSession:null,
    insertVerifiedOnce:async(session,result)=>{if(verifiedResult||session.id!==sid)return false;verifiedResult=result;serverSession.submitted=true;return true;}},
   replayVerifier:verifier,now:()=>serverTime,newId:()=>sid,seed:()=>fullCapture.seed});
  await assert.rejects(()=>boundary.start({credentials:'invalid',schoolId:selectedSchool.school_id}),/unauthorized/);
  const issued=await boundary.start({credentials:'fixture-lv1',schoolId:selectedSchool.school_id});assert.equal(issued.seed,fullCapture.seed);
  serverTime=190000;
  await assert.rejects(()=>boundary.submit({credentials:'fixture-lv1',sessionId:sid,replay:[{tick:0,action:'leave',choice:20},{tick:60,action:'stop'}]}),/invalid_leave/);
  assert.equal(verifiedResult,null);
  const accepted=await boundary.submit({credentials:'fixture-lv1',sessionId:sid,replay:fullCapture.events,score:999999,verified:true});
  assert.deepEqual(JSON.parse(JSON.stringify(verifiedResult)),fullCapture.result);
  assert.equal(accepted.score,fullCapture.result.score);assert.equal(accepted.retired,true);
  await assert.rejects(()=>boundary.submit({credentials:'fixture-lv1',sessionId:sid,replay:fullCapture.events}),/session_expired/);
  assert.equal(opened,closed);assert.equal(opened,2);
  console.log('PASS RUN4_BOUNDARY_REAL_REPLAY '+JSON.stringify({score:accepted.score,retired:accepted.retired,workerOpened:opened,workerClosed:closed,store:'fixture-only'}));
  // Optional isolated workflow only. No production address or credentials can be supplied.
  if(process.env.RUN4_DISPOSABLE_POSTGRES==='1'){
   const {verifyPersistentReplay}=require('../docs/run4-ranking-preflight/persistent-replay-test.cjs');
   await verifyPersistentReplay({policy,verifier,schoolId:selectedSchool.school_id,capture:fullCapture});
   assert.equal(opened,closed);
  }


  await page.setViewportSize({width,height:900});
  console.log('PASS real game replay: deterministic five-second partial match, cross viewport, premature leave and forged fields denied '+JSON.stringify(replayA));

  // Default-disabled client: no official calls in prior fixtures.
  assert.equal(officialCalls.length,0);
  officialFixture=true;selectedSchool={...selectedSchool,difficulty:'normal'};
  await page.goto(origin+'/teacher-run-4-preview.html?school_id='+selectedSchool.school_id+'&replay_fixture=1&recording=1');
  await page.locator('#teacher-run-protected').waitFor({state:'visible'});
  await page.locator('#run4-official-mode').check();
  await page.getByRole('button',{name:'▶ 이 학교로 시작',exact:true}).click();
  await page.waitForFunction(()=>window.__trustedRun4Replay.snapshot().state==='playing');
  await page.evaluate(()=>window.__trustedRun4Replay.stepTo(120));
  await page.locator('#pause').click();await page.getByRole('button',{name:'↩ 처음으로',exact:true}).click();
  await page.waitForFunction(()=>!!window.__trustedRun4Replay.envelope());
  const officialTrace=await page.evaluate(()=>window.__trustedRun4Replay.envelope());assert.equal(officialTrace.seed,42);
  assert.equal(officialCalls.filter(x=>x.action==='submit').length,0);
  await page.locator('#run4-official-submit').click();await page.waitForFunction(()=>document.querySelector('#run4-official-status').textContent.includes('공식 기록 승인'));
  assert.deepEqual(officialCalls.find(x=>x.action==='submit').replay,officialTrace.events);
  await page.locator('#run4-official-outcome').selectOption('retired');await page.locator('#run4-official-refresh').click();
  await page.waitForFunction(()=>document.querySelector('#run4-official-list').textContent.includes('17,626'));
  assert.equal(officialCalls.at(-1).outcome,'retired');officialFixture=false;
  console.log('PASS RUN4_OFFICIAL_UI server seed, explicit submission, trace only, separate filtered board (intercepted API)');
  assert.deepEqual(errors,[]);
  // This is a deterministic legal-input probe, not a human play session.
  // A failed tier remains a balance blocker, rather than being counted as complete.
  assert.ok(outcomes.every(r=>r.retired),'Natural-life balance probe: '+JSON.stringify(outcomes));
 }
 console.log('PASS fixture search width='+width+' tier='+tier);
 }finally{await context.close()}
 }}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
