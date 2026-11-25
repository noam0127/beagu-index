const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
try{
 const read=p=>fs.readFileSync(p,'utf8');
 const css=['styles/arcade-cabinet-v1.css','styles/arcade-fullscreen-v1.css','styles/arcade-playback-v1.css','styles/arcade-minimal-v11112.css','styles/arcade-fire-court-v1.css'].map(read).join('\n');
 for(const [w,h] of [[320,640],[390,844],[844,390],[1440,900]])for(const kind of ['volley','run'])for(const full of [false,true]){
  const page=await browser.newPage({viewport:{width:w,height:h},hasTouch:w<1000,isMobile:w<1000});try{
   await page.route('**/*',r=>r.abort());
   const s=read(kind==='volley'?'teacher-volleyball.html':'teacher-run.html');
   const inline=[...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
   await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}'+inline+'\n'+css+'</style><body class="beagu-minimal-'+kind+(kind==='run'?' arcade-run-game-playing':'')+'"><div class="'+(kind==='volley'?'court':'stage')+' arcade-game-viewport fire-court-controls '+(full?'arcade-fullscreen-fallback':'')+'"><canvas id="game" width="900" height="500"></canvas><button class="arcade-fullscreen-toggle">+</button><button id="pause" class="arcade-playback">⏸ 일시정지</button></div></body>');
   const p=await page.locator('#pause').boundingBox(),c=await page.locator('#game').boundingBox(),v=await page.locator('.fire-court-controls').boundingBox(),f=await page.locator('.arcade-fullscreen-toggle').boundingBox();
   assert(p&&c&&v&&f);assert(c.height>0&&p.height>=44);
   assert(p.y>=c.y+c.height-1,JSON.stringify({kind,w,h,full,p,c,v}));
   assert(p.y+p.height<=v.y+v.height+1);assert(Math.abs(p.x+p.width/2-(v.x+v.width/2))<2);
   assert(p.x+p.width<=f.x+1||f.x+f.width<=p.x+1||p.y+p.height<=f.y+1||f.y+f.height<=p.y+1);
   await page.evaluate(()=>document.querySelector('#pause').onclick=()=>{document.querySelector('#pause').textContent='▶ 계속하기';});
   await page.locator('#pause').click();assert.equal(await page.locator('#pause').innerText(),'▶ 계속하기');
  }finally{await page.close();}
 }
 console.log('PASS 16 offline Chromium control layouts, no pause/canvas or fullscreen-toggle overlap');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
