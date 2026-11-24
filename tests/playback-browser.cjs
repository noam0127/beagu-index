/* Browser-only CSS and actual shared gesture script, no network or live game scores. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{const css=await fs.readFile('styles/arcade-playback-v1.css','utf8'),gest=await fs.readFile('js/arcade-gestures-v1.js','utf8'),rail=await fs.readFile('js/arcade-scroll-rail-v1.js','utf8');
const source=await fs.readFile('teacher-volleyball.html','utf8');
const cssStart=source.indexOf('/* Brawl-style multitouch controls:'),cssEnd=source.indexOf('</style>',cssStart);
const markupStart=source.indexOf('<div class="volleyball-touch-controls"'),markupEnd=source.indexOf('<div class="volley-ready-overlay"',markupStart);
assert(cssStart>=0&&cssEnd>cssStart&&markupStart>=0&&markupEnd>markupStart);
const controlsCss=source.slice(cssStart,cssEnd),controls=source.slice(markupStart,markupEnd);
for(const width of [320,390,768,1440])for(const mode of ['normal','arcade-fullscreen-fallback']){
 const page=await browser.newPage({viewport:{width,height:700}});try{
 await page.setContent('<style>body{margin:0}.arcade-game-viewport{position:relative;height:300px;width:100%}canvas{width:100%;height:100%}</style><div class="arcade-game-viewport '+mode+'"><canvas></canvas><button id="pause" class="arcade-playback" hidden>⏸ 일시정지</button></div><div class="arcade-mobile-scroll-rail"></div>');
 await page.addStyleTag({content:css});await page.addScriptTag({content:gest});await page.addScriptTag({content:rail});
 await page.locator('#pause').waitFor({state:'hidden'});await page.evaluate(()=>document.querySelector('#pause').hidden=false);await page.locator('#pause').waitFor({state:'visible'});
 const b=await page.locator('#pause').boundingBox(),a=await page.locator('.arcade-game-viewport').boundingBox();assert.ok(Math.abs(b.x+b.width/2-(a.x+a.width/2))<2);assert.ok(b.height>=44);assert.ok(b.y+b.height<=a.y+a.height);assert.equal(await page.locator('.arcade-mobile-scroll-rail').count(),0);
 await page.evaluate(()=>{let paused=false;const btn=document.querySelector('#pause');btn.onclick=()=>{paused=!paused;btn.textContent=paused?'▶ 계속하기':'⏸ 일시정지'};});await page.locator('#pause').click();assert.equal(await page.locator('#pause').innerText(),'▶ 계속하기');await page.locator('#pause').click();assert.equal(await page.locator('#pause').innerText(),'⏸ 일시정지');
 console.log('PASS playback viewport='+width+' mode='+mode);
 if(width<=768){
  const touch=await browser.newPage({viewport:{width,height:700},hasTouch:true,isMobile:true});
  try{
   await touch.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.arcade-game-viewport{position:relative;height:300px;width:100%}canvas{width:100%;height:100%}</style><div class="court arcade-game-viewport volleyball-playing '+mode+'"><canvas></canvas><button id="pause" class="arcade-playback">⏸ 일시정지</button>'+controls+'</div>');
   await touch.addStyleTag({content:controlsCss+'\n'+css});
   for(const id of ['volley-joystick','volley-spike','volley-dash']){
    const c=await touch.locator('#'+id).boundingBox(),p=await touch.locator('#pause').boundingBox();
    assert(c&&p&&c.width>=44&&c.height>=44);assert(c.y+c.height<=p.y+1,'control overlaps pause');
   }
   console.log('PASS joystick layout viewport='+width+' mode='+mode);
  }finally{await touch.close()}
 }
 }finally{await page.close()}
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
