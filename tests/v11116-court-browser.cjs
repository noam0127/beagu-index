'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright');
const origin='https://court-fixture.invalid', root=process.cwd();
const school=tier=>({school_id:'1234567',school_name:'격리검증초등학교',region:'부산',eligible:true,difficulty:tier,available_years:[2025],missing_years:[2023,2024,2026]});
const stub="window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null},error:null}),getUser:async()=>({data:{user:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>{const p={then:(a,b)=>Promise.resolve({data:[],count:0,error:null}).then(a,b)};for(const m of ['select','eq','in','limit','range','order','ilike','or','maybeSingle','single','gte','lte','not'])p[m]=()=>p;return p},rpc:async()=>({data:[],error:null})})};";
const config='const SUPABASE_URL="https://court-fixture.invalid";const SUPABASE_PUBLISHABLE_KEY="synthetic-only";const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);';
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
function observe(src,kind){
 const anchor=kind==='run'?'resize();intro();requestAnimationFrame(tick);postHeight();':'  syncUI();\n  render();\n  requestAnimationFrame(frame);';
 assert.equal(src.split(anchor).length,2);
 // Test-only observations and time/benefit setup; never shipped in production pages.
 const probe=kind==='run'?'window.__courtFixture={state:()=>state,age:()=>getAge(),prepare:()=>{clock=100;leave.advance(25);leave.advance(50);leave.advance(100);allies.join(clock,()=>0);allies.join(clock,()=>0);updateLabels();},slots:()=>inventorySlots(leave.state(),state==="playing",leave.remaining(clock)).map(x=>x.status),cooperation:()=>solidarityUntil,notice:()=>notice};':'window.__courtFixture={state:()=>state.phase,snapshot:()=>({dash:state.dashFrames,spike:state.spikeBufferFrames,x:left.x,y:left.y}),resetAttack:()=>{state.dashFrames=0;state.spikeBufferFrames=0;state.dashCooldownFrames=0;state.specialChargeFrames=0;lastTapAt=0;}};';
 return src.replace(anchor,probe+'\n'+anchor);
}
(async()=>{const b=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
try{
 for(const cfg of [{width:1440,height:900,touch:false},{width:390,height:844,touch:true},{width:844,height:390,touch:true}]){
 for(const kind of ['run','volley']){
 const context=await b.newContext({viewport:{width:cfg.width,height:cfg.height},isMobile:cfg.touch,hasTouch:cfg.touch,serviceWorkers:'block'});
 try{
 await context.addInitScript(()=>sessionStorage.setItem('beagu-level-session-v1','a'.repeat(64)));
 let picked='normal',recommendCalls=0;
 await context.route('**/*',async route=>{
 const u=new URL(route.request().url()),file=decodeURIComponent(u.pathname.slice(1));
 const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'},body:JSON.stringify(data)});
 if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'application/javascript',body:stub});
 if(u.hostname.endsWith('.supabase.co')){if(route.request().method()==='OPTIONS')return json({});if(u.pathname.endsWith('/beagu-level-api'))return json({level:1,provisional:false});
 if(u.pathname.endsWith('/arcade-leaderboard')){if(u.searchParams.has('recommend')){recommendCalls++;picked=u.searchParams.get('recommend');return json({school:school(picked)});}if(u.searchParams.has('school_id'))return json({school:school(picked)});if(route.request().method()==='POST'){const data=route.request().postDataJSON();assert.equal(data.action,'start');return json({school:school(picked),session:'fixture-session',matchRule:'deuce_v1'});}return json({top10:[],fastestTop10:[]});}return json({});}
 if(u.origin!==origin||file.includes('..'))return route.abort();
 if(file==='js/supabase-config.js')return route.fulfill({contentType:'application/javascript',body:config});
 try{const data=await fs.readFile(path.join(root,file));return route.fulfill({contentType:MIME[path.extname(file)]||'application/octet-stream',body:file==='teacher-run.html'||file==='teacher-volleyball.html'?observe(data.toString('utf8'),kind):data});}catch{return route.abort();}
 });
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/'+(kind==='run'?'teacher-run.html':'teacher-volleyball.html'),{waitUntil:'domcontentloaded'});
 if(kind==='run')await p.locator('#teacher-run-protected').waitFor({state:'visible'});
 await p.locator('.arcade-school-recommend').selectOption('normal');
 await p.waitForFunction(()=>document.querySelector('#arcade-school-picker').dataset.schoolId==='1234567');
 assert.equal(recommendCalls,1);
 if(kind==='run')await p.getByRole('button',{name:'▶ 이 학교로 시작',exact:true}).click();else await p.locator('#volley-school-choose').click();
 await p.waitForFunction(()=>window.__courtFixture?.state()==='playing');
 const pause=p.locator('#pause');await pause.waitFor({state:'visible'});
 await p.waitForFunction(t=>document.documentElement.classList.contains('arcade-play-locked')===t,cfg.touch);
 const locked=await p.evaluate(()=>document.body.style.position);assert.equal(locked,cfg.touch?'fixed':'');
 const bounds=await pause.boundingBox();assert(bounds&&bounds.height>=44,JSON.stringify({cfg,kind,bounds}));
 if(cfg.touch)assert(bounds.y>=-1&&bounds.y+bounds.height<=cfg.height+1,JSON.stringify({cfg,kind,bounds}));
 if(kind==='run'){
  const age=p.locator('#run-court-age');assert(await age.isVisible());assert.match(await age.innerText(),/24세[\s\S]*정년 62세/);
  if(!cfg.touch){
   await p.evaluate(()=>window.__courtFixture.prepare());assert.match(await age.innerText(),/44세[\s\S]*정년 62세/);
   for(const [code,index] of [['KeyZ',0],['KeyX',1],['KeyC',2]]){
    // Korean IME key value differs from the physical key code.
    await p.evaluate(code=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'한',code,bubbles:true,cancelable:true})),code);
    assert.equal((await p.evaluate(()=>window.__courtFixture.slots()))[index],'held');
   }
   await p.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'한',code:'KeyV',bubbles:true,cancelable:true})));
   assert((await p.evaluate(()=>window.__courtFixture.cooperation()))>0);
  }
 }else if(!cfg.touch){
  await p.locator('#game').focus();await p.evaluate(()=>window.__courtFixture.resetAttack());await p.keyboard.press('Space');
  const snap=await p.evaluate(()=>window.__courtFixture.snapshot());assert(snap.dash>0&&snap.spike>0,JSON.stringify(snap));
 }else{
  // Dispatch realistic touch pointer movements directly onto the actual game canvas.
  const check=await p.evaluate(async()=>{const c=document.querySelector('#game'),r=c.getBoundingClientRect(),x=r.left+r.width*.2,y=r.top+r.height*.75,probe=window.__courtFixture;
   const fire=(type,dx)=>c.dispatchEvent(new PointerEvent(type,{pointerId:17,pointerType:'touch',clientX:x+dx,clientY:y,bubbles:true,cancelable:true}));
   probe.resetAttack();fire('pointerdown',0);await new Promise(r=>setTimeout(r,90));fire('pointermove',8);const slow=probe.snapshot();await new Promise(r=>setTimeout(r,20));fire('pointermove',70);const fast=probe.snapshot();fire('pointerup',70);return {slow,fast};});
  assert.equal(check.slow.dash,0);assert.equal(check.slow.spike,0);assert(check.fast.dash>0&&check.fast.spike>0,JSON.stringify(check));
 }
 await pause.click();await p.waitForFunction(()=>window.__courtFixture.state()==='paused');assert.match(await pause.innerText(),/계속하기/);
 await pause.click();await p.waitForFunction(()=>window.__courtFixture.state()==='playing');
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS actual court page',kind,cfg.width,cfg.height);
 }finally{await context.close();}
 }
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
