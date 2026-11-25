const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{
const read=p=>fs.readFileSync(p,'utf8');
const rows=[{score:9000,school_name:'테스트초',outcome:'victory',playerPoints:26,cpuPoints:24,deuce:true},{score:8000,school_name:'테스트초',outcome:'defeat',playerPoints:23,cpuPoints:25},{score:7000,school_name:'테스트초',outcome:'stopped',playerPoints:12,cpuPoints:14},{score:6000,school_name:'테스트초'}];
for(const width of [320,390,1440]){const p=await browser.newPage({viewport:{width,height:900}});try{
await p.route('**/*',r=>r.abort());
await p.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="rank"></div>');
await p.addStyleTag({content:read('styles/arcade-cabinet-v1.css')});
await p.evaluate(rows=>{window.fetch=async()=>({ok:true,json:async()=>({top10:rows,fastestTop10:[{timeTenths:800,school_name:'테스트초',outcome:'victory',playerPoints:26,cpuPoints:24,deuce:true},{timeTenths:900,school_name:'테스트초'}]})});},rows);
await p.addScriptTag({content:read('js/arcade-leaderboard-v1.js')});
await p.evaluate(()=>{window.rank=new window.ArcadeLeaderboard('volleyball_25','#rank');});
await p.waitForFunction(()=>window.rank.board.length===4);
await p.locator('.arcade-ranking-toggle').click();
assert.deepEqual(await p.locator('.arcade-rank-outcome').allTextContents(),['듀스 승리 26:24','패배 23:25','중도 종료 12:14','결과 미확인','듀스 승리 26:24','승리']);
assert.ok(await p.locator('.arcade-rank-outcome').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().width<=e.parentElement.getBoundingClientRect().width+1)));
await p.evaluate(()=>{window.rank=new window.ArcadeLeaderboard('teacher_run_retirement','#rank');});
await p.waitForFunction(()=>window.rank.board.length===4);
assert.equal(await p.locator('.arcade-rank-outcome').count(),0);
}finally{await p.close();}}
console.log('PASS 320/390/1440px ranking outcome display, fallback and career game unchanged');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
