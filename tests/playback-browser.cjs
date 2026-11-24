/* Browser-only CSS and actual shared gesture script, no network or live game scores. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{const css=await fs.readFile('styles/arcade-playback-v1.css','utf8'),gest=await fs.readFile('js/arcade-gestures-v1.js','utf8'),rail=await fs.readFile('js/arcade-scroll-rail-v1.js','utf8');
for(const width of [320,390,768,1440])for(const mode of ['normal','arcade-fullscreen-fallback']){
 const page=await browser.newPage({viewport:{width,height:700}});try{
 await page.setContent('<style>body{margin:0}.arcade-game-viewport{position:relative;height:300px;width:100%}canvas{width:100%;height:100%}</style><div class="arcade-game-viewport '+mode+'"><canvas></canvas><button id="pause" class="arcade-playback" hidden>⏸ 일시정지</button></div><div class="arcade-mobile-scroll-rail"></div>');
 await page.addStyleTag({content:css});await page.addScriptTag({content:gest});await page.addScriptTag({content:rail});
 await page.locator('#pause').waitFor({state:'hidden'});await page.evaluate(()=>document.querySelector('#pause').hidden=false);await page.locator('#pause').waitFor({state:'visible'});
 const b=await page.locator('#pause').boundingBox(),a=await page.locator('.arcade-game-viewport').boundingBox();assert.ok(Math.abs(b.x+b.width/2-(a.x+a.width/2))<2);assert.ok(b.height>=44);assert.ok(b.y+b.height<=a.y+a.height);assert.equal(await page.locator('.arcade-mobile-scroll-rail').count(),0);
 await page.evaluate(()=>{let paused=false;const btn=document.querySelector('#pause');btn.onclick=()=>{paused=!paused;btn.textContent=paused?'▶ 계속하기':'⏸ 일시정지'};});await page.locator('#pause').click();assert.equal(await page.locator('#pause').innerText(),'▶ 계속하기');await page.locator('#pause').click();assert.equal(await page.locator('#pause').innerText(),'⏸ 일시정지');
 console.log('PASS playback viewport='+width+' mode='+mode);
 }finally{await page.close()}
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
