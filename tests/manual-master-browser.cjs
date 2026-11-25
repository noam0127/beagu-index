const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{
for(const width of [390,1440]){const page=await browser.newPage({viewport:{width,height:900}});try{
await page.route('**/*',r=>r.abort());
await page.setContent('<div id="adminAuto2026" hidden></div>');
await page.evaluate(()=>{window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}};window.__calls=[];window.__active=3;window.fetch=async(_url,opts)=>{const b=JSON.parse(opts.body);window.__calls.push(b);if(b.action==='auto_status')return {ok:true,json:async()=>({total:3,structural_pass:3,auto_ready:2,scope_pending:0,review_required:1,source_versions:['fixture-v1']})};if(b.action==='manual_master_publish'){if(!b.csv.includes('fixture-csv'))return {ok:false};const previous=window.__active;window.__active=4;return {ok:true,json:async()=>({ok:true,eligible:2,blocked:1,question_eligible:1,question_blocked:1,batch_id:4,previous_batch:previous})}};if(b.action==='manual_master_restore'){if(b.expected_batch!==window.__active)return {ok:false};window.__active=b.batch_id;return {ok:true,json:async()=>({ok:true,batch_id:b.batch_id})}};return {ok:false};}});
await page.addScriptTag({content:fs.readFileSync('js/beagu-2026-auto-admin-v1.js','utf8')});
await page.evaluate(()=>Beagu2026ReviewAdmin.mount('viewer'));assert.equal(await page.locator('#adminAuto2026').isVisible(),false);
await page.evaluate(()=>Beagu2026ReviewAdmin.mount('owner'));
const file=page.getByLabel('검토 완료 최종 마스터 파일'),button=page.getByRole('button',{name:'검토 완료 마스터 업로드 · 즉시 반영'});
await file.waitFor();
await file.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('bad')});await button.click();
await page.getByText('처리 실패 · 최신 자료 및 MFA를 확인하세요.').waitFor();assert.equal(await page.evaluate(()=>window.__active),3);
const payload=JSON.stringify({kind:'BEAGU_FINAL_MASTER_2026_V1',percentile_csv:'fixture-csv',question_refs:[{school_id:'1000001',payload_sha256:'a'.repeat(64)}]});
await file.setInputFiles({name:'final-master.json',mimeType:'application/json',buffer:Buffer.from(payload)});await button.click();
await page.getByText('반영 적격 학교 2개교 · 기존 보호조건에 따른 제외 1개교 · 문항 반영 적격 1개교 · 문항 제외 1개교 · 배치 4',{exact:true}).waitFor();
assert.equal(await page.evaluate(()=>window.__active),4);const sent=await page.evaluate(()=>window.__calls.filter(x=>x.action==='manual_master_publish').at(-1));assert.equal(sent.csv,payload);assert.equal(sent.confirmation,'FINAL_MASTER_PUBLISH');
page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'직전 마스터 복원'}).click();await page.getByText('이전 마스터 복원 완료',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__active),3);
await page.evaluate(()=>Beagu2026ReviewAdmin.reset());assert.equal(await page.locator('#adminAuto2026').isVisible(),false);
console.log('PASS Chromium manual master upload, immediate response, blocked counts and restore '+width+'px (mock API)');
}finally{await page.close()}}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
