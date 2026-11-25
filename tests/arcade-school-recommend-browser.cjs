const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');const read=p=>fs.readFileSync(p,'utf8');
(async()=>{const b=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{
for(const width of [320,390,1440]){const p=await b.newPage({viewport:{width,height:800}});try{
await p.route('**/*',r=>r.abort());await p.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><div id="picker"></div><div id="row"><button>🏫 학교 선택하기</button></div>');
await p.addStyleTag({content:read('styles/arcade-school-picker-v1.css')});await p.evaluate(()=>{window.fetch=async url=>{const tier=new URL(url).searchParams.get('recommend');return {ok:true,json:async()=>({school:tier==='extreme'?null:{school_id:'1234567',school_name:'검증초등학교',region:'부산',eligible:true,difficulty:tier}})};};});
await p.addScriptTag({content:read('js/arcade-school-picker-v1.js')});await p.evaluate(()=>{window.picker=new window.ArcadeSchoolPicker('#picker');picker.attachRecommendation(document.querySelector('#row'));});
const select=p.locator('#row select');assert.equal(await select.locator('option').count(),6);const a=await p.locator('#row button').boundingBox(),c=await select.boundingBox();assert.ok(a.x+a.width<=c.x&&Math.abs(a.y-c.y)<2&&a.height>=44&&c.height>=44&&c.x+c.width<=width);
await select.selectOption('hard');await p.waitForFunction(()=>window.picker.get()?.difficulty==='hard');assert.equal(await p.locator('#picker input').inputValue(),'검증초등학교 · 부산');
await select.selectOption('extreme');await p.locator('.arcade-school-recommend-status').waitFor({state:'visible'});await p.waitForFunction(()=>document.querySelector('.arcade-school-recommend-status').textContent.includes('찾지 못했습니다'));assert.equal(await p.evaluate(()=>picker.get().difficulty),'hard');
await p.evaluate(()=>picker.setLocked(true));assert.equal(await select.isDisabled(),true);
}finally{await p.close();}}console.log('PASS responsive side-by-side school actions, all tiers, eligible selection, empty response and game lock');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
