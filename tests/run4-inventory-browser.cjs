const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{
const read=p=>fs.readFileSync(p,'utf8'),html=read('teacher-run.html');
const start=html.indexOf('const inventoryKeys='),end=html.indexOf('function updateLabels(){',start),source=html.slice(start,end);
const keyStart=html.indexOf('window.addEventListener("keydown",e=>{'),keyEnd=html.indexOf('window.addEventListener("keyup",',keyStart);
assert(start>=0&&end>start&&keyStart>=0&&keyEnd>keyStart);
const keySource=html.slice(keyStart,keyEnd);
const css=['styles/arcade-fullscreen-v1.css','styles/arcade-playback-v1.css','styles/arcade-minimal-v11112.css','styles/arcade-fire-court-v1.css','styles/teacher-run-4-leave.css'].map(read).join('\n');
const markup='<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.stage{position:relative;width:100%;height:600px}#game{width:100%;height:100%}</style><div class="stage arcade-game-viewport fire-court-controls"><canvas id="game"></canvas><button id="pause" class="arcade-playback">⏸ 일시정지</button><div id="run4-leave-inventory" class="run4-leave"></div><div id="run4-leave-fullscreen" class="run4-leave"></div><div id="run4-active-effects" class="run4-active-effects" hidden></div></div>';
for(const [width,height,touch,full] of [[1440,900,false,false],[390,844,true,false],[390,844,true,true],[844,390,true,true]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});try{
 await page.route('**/*',r=>r.abort());await page.setContent(markup);await page.addStyleTag({content:css});
 await page.evaluate(full=>{document.body.className='beagu-minimal-run arcade-run-game-playing';if(full)document.querySelector('.stage').classList.add('arcade-fullscreen-fallback');},full);
 await page.addScriptTag({content:read('js/teacher-run-4-rules.js')});
 await page.addScriptTag({content:`(()=>{const rules=window.BeaguRun4Rules,$=id=>document.getElementById(id);let clock=25,state="playing",leave=rules.createLeave(),allies=rules.createAllies(),effects=rules.createEffects(),growth=rules.createGrowth(),mysteryBuffs={},mystery={good:[],bad:[]},life=40,maxLife=100,bosses={tier:{leave:1}},player={x:0,y:0,inv:0},leaveUiKey="";const recorded=[];const recordInput=(action,fields={})=>recorded.push({action,...fields});const setNotice=()=>{},playTone=()=>{},burst=()=>{},updateLabels=()=>syncLeave();const cooperate=()=>{if(allies.cooperate(clock)){solidarityUntil=clock+2;recordInput("cooperate");syncLeave();}};const pause=()=>{};leave.advance(clock);`+source+keySource+`syncLeave();window.fixture={recorded,clock:t=>{clock=t;syncLeave();},pause:()=>{state="paused";syncLeave();},resume:()=>{state="playing";syncLeave();}};})();`});
 const host=page.locator(full?'#run4-leave-fullscreen':'#run4-leave-inventory');const other=page.locator(full?'#run4-leave-inventory':'#run4-leave-fullscreen');
 assert.equal(await host.isVisible(),true);assert.equal(await other.isVisible(),false);assert.equal(await host.locator('button').count(),4);assert.equal(await host.locator('kbd').first().isVisible(),!touch);
 const slot=host.locator('button').first();
 if(touch){await slot.tap();await slot.tap();}else{await page.keyboard.press('z');await page.keyboard.press('z');}
 assert.deepEqual(await page.evaluate(()=>window.fixture.recorded),[{action:'collect',choice:5},{action:'leave',choice:5}]);
 const active=page.locator('#run4-active-effects');assert.equal(await active.isVisible(),true);
 await page.evaluate(()=>window.fixture.clock(26));assert.equal(await active.locator('.ending').count(),1);
 await page.evaluate(()=>window.fixture.pause());assert.equal(await slot.isDisabled(),true);
 await page.evaluate(()=>window.fixture.resume());await page.evaluate(()=>window.fixture.clock(28));assert.equal(await active.isVisible(),false);
 const bounds=await host.boundingBox();assert(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);
 }finally{await page.close();}
}
console.log('PASS desktop hotkeys, mobile touch, single inventory in expanded view, effect blink and expiry');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
