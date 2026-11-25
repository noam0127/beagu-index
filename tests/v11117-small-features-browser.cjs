/* Isolated Chromium component integration using the production input handlers, inventory functions and boss rules. No live requests or scores. */
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
 try{
 const source=read('teacher-run.html');assert.equal(source,read('teacher-run-4-preview.html'));
 const take=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);};
 const inventory=take('const inventoryKeys=','function updateLabels(){'),keyboard=take('window.addEventListener("keydown",e=>{','window.addEventListener("keyup"'),damage=take('function damageBoss(amount){','function joinAlly(){');
 for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:{width:mobile?390:1024,height:800},hasTouch:mobile,isMobile:mobile});
 try{
 await page.route('**/*',r=>r.abort());
 await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="run4-leave-inventory"></div><div id="run4-leave-fullscreen"></div><div id="run4-active-effects"></div><div id="graphs"></div>');
 await page.addScriptTag({content:read('js/teacher-run-4-rules.js')});
 await page.addScriptTag({content:read('js/school-search-card-v1.js')});
 await page.addScriptTag({content:`const rules=window.BeaguRun4Rules;let state="playing",clock=100,leave=rules.createLeave(),allies=rules.createAllies(),effects=rules.createEffects(),growth=rules.createGrowth(),mysteryBuffs={},mystery={good:[],bad:[]},life=40,maxLife=100,bosses=rules.createBosses("normal"),player={x:0,y:0,inv:0},leaveUiKey="",bossX=0,bossY=0,bossRate=1,bossGuard=0,bossSpawn=1,score=0;const events=[],hits=[],pressed=new Set();const $=id=>document.getElementById(id),recordInput=(action,fields={})=>events.push({action,...fields}),setNotice=()=>{},playTone=()=>{},burst=()=>{},updateLabels=()=>syncLeave(),pause=()=>{},keyMask=()=>0,cooperate=()=>{if(allies.cooperate(clock)){solidarityUntil=clock+2;recordInput("cooperate");syncLeave();}},float=(x,y,t)=>hits.push(t),resetBossThreats=()=>{},clearNearby=()=>{},addScore=n=>score+=n,crisisAwards=()=>{},run4=rules.create(),joinAlly=()=>{},gameRandom=()=>.5,openGrowth=()=>{};`+inventory+keyboard+damage+`
 window.fixture={advance(t){clock=t;leave.advance(t);syncLeave();},reset(t){clock=t;leave=rules.createLeave();life=40;events.length=0;leave.advance(t);syncLeave();},join(){allies.join(clock,()=>0);allies.join(clock,()=>0);syncLeave();},status(){return {life,events:events.slice(),used:leave.state().used}},boss(tier){clock=20;bosses=rules.createBosses(tier);bosses.advance(clock);hits.length=0;score=0;growth=rules.createGrowth();return bosses.active().hp;},hit(n){damageBoss(n);return {hp:bosses.active()?.hp??0,defeated:bosses.defeated().length,hits:hits.slice(),score}}};fixture.reset(100);`});
 const slots=page.locator('#run4-leave-inventory button');assert.equal(await slots.count(),4);
 if(mobile)await slots.nth(0).tap();else await page.keyboard.press('KeyZ');
 let status=await page.evaluate(()=>fixture.status());assert.equal(status.used,1);assert.equal(status.life,70);assert.deepEqual(status.events.map(e=>e.action),['collect','leave']);
 assert.equal(await slots.nth(0).isDisabled(),true);assert.equal(await slots.nth(1).isDisabled(),true);
 await page.evaluate(()=>fixture.advance(103));
 if(mobile)await slots.nth(1).tap();else await page.keyboard.press('KeyX');
 assert.equal((await page.evaluate(()=>fixture.status())).used,2);
 await page.evaluate(()=>fixture.advance(108));
 if(mobile)await slots.nth(2).tap();else await page.keyboard.press('KeyC');
 assert.equal((await page.evaluate(()=>fixture.status())).used,3);
 await page.evaluate(()=>{fixture.advance(115);fixture.join()});
 if(mobile)await slots.nth(3).tap();else await page.keyboard.press('KeyV');
 assert.equal((await page.evaluate(()=>fixture.status())).events.at(-1).action,'cooperate');
 // Real browser KeyboardEvent with non-Latin key value and physical code.
 await page.evaluate(()=>{fixture.reset(100);window.dispatchEvent(new KeyboardEvent('keydown',{key:'ㅋ',code:'KeyZ',bubbles:true,cancelable:true}));});
 assert.equal((await page.evaluate(()=>fixture.status())).used,1);
 let prev=0;for(const tier of ['easy','normal','hard','very_hard','extreme']){
 const hp=await page.evaluate(t=>fixture.boss(t),tier);assert(hp>prev);prev=hp;
 const partial=await page.evaluate(()=>fixture.hit(9));assert.equal(partial.hp,hp-9);assert.equal(partial.defeated,0);assert.equal(partial.hits[0],'-9');
 const end=await page.evaluate(n=>fixture.hit(n),hp);assert.equal(end.hp,0);assert.equal(end.defeated,1);assert.equal(end.score,500);
 assert.equal((await page.evaluate(()=>fixture.hit(999))).score,500);
 }
 await page.evaluate(()=>{for(const viewerTier of [0,1,2]){const c=BeaguSchoolSearchCard.percentiles({viewerTier,publicValues:[17,null,0],value2026:72,common2026:72,status2026:'published'});document.querySelector('#graphs').append(c);}});
 assert.deepEqual(await page.locator('#graphs .percentile-panel').evaluateAll(els=>els.map(e=>e.dataset.displayYear)),['2025','average','average']);
 assert.deepEqual(await page.locator('#graphs .percentile-panel .glory-score').allTextContents(),['0.0%','29.7%','29.7%']);
 assert.deepEqual(await page.evaluate(()=>[BeaguSchoolSearchCard.historicalMean([null,0,100],null),BeaguSchoolSearchCard.historicalMean([null,null,null],null),BeaguSchoolSearchCard.historicalMean([0,null,null],null)]),[50,null,0]);
 assert.deepEqual(await page.locator('#graphs .glory-year-row').evaluateAll(els=>els.map(e=>e.dataset.year)),['2026','2025','2024','2023']);
 assert.deepEqual(await page.locator('#graphs .glory-year-value').allTextContents(),['72.0%','0.0%','자료 없음','17.0%']);
 console.log('PASS Chromium '+(mobile?'touch':'keyboard')+' inventory, Korean physical key, boss HP/defeat and four-year cards (isolated components)');
 }finally{await page.close()}
 }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
