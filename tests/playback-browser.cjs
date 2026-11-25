/* Browser-only CSS and actual shared gesture script, no network or live game scores. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{const css=await fs.readFile('styles/arcade-playback-v1.css','utf8'),gest=await fs.readFile('js/arcade-gestures-v1.js','utf8'),rail=await fs.readFile('js/arcade-scroll-rail-v1.js','utf8');
const source=await fs.readFile('teacher-volleyball.html','utf8');
const cssStart=source.indexOf('/* Full Set touch controls:'),cssEnd=source.indexOf('</style>',cssStart);
assert(cssStart>=0&&cssEnd>cssStart);assert(!source.includes('id="volley-attack"'));
const controlsCss=source.slice(cssStart,cssEnd),controls='',fullscreenCss=await fs.readFile('styles/arcade-fullscreen-v1.css','utf8');
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
   await touch.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.arcade-game-viewport{position:relative;width:100%;overflow:hidden}canvas{display:block;width:100%;height:auto;aspect-ratio:9/5}</style><div class="court arcade-game-viewport volleyball-playing '+mode+'"><canvas width="900" height="500"></canvas><button id="pause" class="arcade-playback">⏸ 일시정지</button>'+controls+'</div>');
   await touch.addStyleTag({content:fullscreenCss+'\n'+css+'\n'+controlsCss});
   assert.equal(await touch.locator('#volley-joystick,#volley-spike,#volley-dash').count(),0);
   assert.equal(await touch.locator('#volley-attack').count(),0);const p=await touch.locator('#pause').boundingBox(),canvas=await touch.locator('canvas').boundingBox();assert(p&&canvas&&canvas.width>0&&canvas.height>0&&p.height>=44);
   console.log('PASS direct touch controls layout viewport='+width+' mode='+mode);
  }finally{await touch.close()}
 }
 }finally{await page.close()}
}
// New expanded court: exact production fullscreen CSS and auto-rotation event.
const wide=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});try{
 await wide.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div class="game-shell"><div class="court arcade-game-viewport" data-arcade-fullscreen><button data-arcade-fullscreen-button class="arcade-fullscreen-toggle"></button><div class="arcade-fullscreen-hud arcade-volley-fullscreen-hud"><strong>8</strong><strong>12</strong></div><canvas id="game" width="900" height="500"></canvas></div></div>');
 await wide.addStyleTag({content:fullscreenCss});await wide.addScriptTag({content:await fs.readFile('js/arcade-fullscreen-v1.js','utf8')});await wide.evaluate(()=>window.dispatchEvent(new CustomEvent('beagu:volley-landscape',{detail:true})));
 const bounds=await wide.locator('#game').boundingBox();assert(bounds&&Math.abs(bounds.width-844)<2&&Math.abs(bounds.height-390)<2);assert.deepEqual(await wide.locator('.arcade-volley-fullscreen-hud strong').allTextContents(),['8','12']);assert.equal(await wide.locator('#game').evaluate(e=>getComputedStyle(e).objectFit),'fill');
 await wide.evaluate(()=>window.dispatchEvent(new CustomEvent('beagu:volley-landscape',{detail:false})));assert.equal(await wide.locator('.arcade-fullscreen-fallback').count(),0);
}finally{await wide.close();}
// Browser integration: actual canvas pixels, both result layouts, PNG and clipboard fallback.
const share=await fs.readFile('js/arcade-result-share-v1.js','utf8'),shareCss=await fs.readFile('styles/arcade-result-share-v1.css','utf8');
for(const compact of [false,true]){
 const p=await browser.newPage({viewport:{width:390,height:700}});
 try{
  await p.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="mount" style="position:relative;width:350px;height:360px;overflow:auto"><canvas id="game" width="900" height="500" style="width:100%"></canvas></div>');
  await p.addStyleTag({content:shareCss});await p.addScriptTag({content:share});
  await p.evaluate(compact=>{
   const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d');ctx.fillStyle='#df4530';ctx.fillRect(0,0,900,500);
   window.ClipboardItem=class {constructor(items){this.items=items;}};
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{
    const blob=items[0].items['image/png'],bmp=await createImageBitmap(blob);
    const sample=document.createElement('canvas');sample.width=bmp.width;sample.height=bmp.height;const c=sample.getContext('2d');c.drawImage(bmp,0,0);
    window.png={type:blob.type,size:blob.size,pixel:Array.from(c.getImageData(500,250,1,1).data)};
   }}});
   window.result=window.BeaguArcadeResult.create(document.querySelector('#mount'),canvas,{compact});
   window.result.show({game:compact?'험난한 교직생활':'선생님배구',title:'역전승!',detail:'검증 결과',metrics:['25 : 23','2,500점'],...(compact?{certificateLines:['버전 4.0','정년퇴직 성공']}: {})});
  },compact);
  await p.waitForFunction(()=>!document.querySelector('.arcade-result-copy').disabled);
  assert.equal(await p.locator('.arcade-result-download').isVisible(),true);
  await p.locator('.arcade-result-copy').click();await p.waitForFunction(()=>window.png);
  const png=await p.evaluate(()=>window.png);assert.equal(png.type,'image/png');assert.ok(png.size>1000);assert.deepEqual(png.pixel,[223,69,48,255]);
  assert.equal(await p.locator('.arcade-result-brag').getAttribute('href'),'https://indischool.com/tweets/channels/lounge');assert.equal(await p.locator('.arcade-result-brag').getAttribute('target'),'_blank');
  await p.evaluate(()=>{navigator.clipboard.write=async()=>{throw Error('denied');};});
  await p.locator('.arcade-result-copy').click();await p.locator('.arcade-result-download').waitFor({state:'visible'});
  const download=p.waitForEvent('download');await p.locator('.arcade-result-download').click();assert.equal((await download).suggestedFilename(),'baegu-game-result.png');
  await p.evaluate(()=>window.result.clear());assert.equal(await p.locator('.arcade-result-copy').count(),0);
  console.log('PASS actual canvas PNG clipboard and download fallback compact='+compact);
 }finally{await p.close();}
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
