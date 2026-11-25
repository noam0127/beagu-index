const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{
for(const width of [360,768,1440]){const page=await browser.newPage({viewport:{width,height:900}});try{
await page.route('**/*',r=>r.abort());
const html=fs.readFileSync('tests/fixtures/admin-v1115-legacy.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
await page.setContent(html);
await page.evaluate(()=>{const box=document.querySelector('#admin2026Box');document.body.replaceChildren(box);window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}};window.fetch=async()=>({ok:true,json:async()=>({items:[]})});});
await page.addStyleTag({content:fs.readFileSync('styles/beagu-admin-v1.css','utf8')});
await page.addScriptTag({content:fs.readFileSync('js/beagu-2026-civic-admin-v1.js','utf8')});
const box=page.locator('#admin2026Box'),host=page.locator('#adminReview2026');
assert.equal(await box.getAttribute('open'),null);assert.equal(await host.isVisible(),false);
await box.locator(':scope > summary').click();assert.equal(await host.isVisible(),true);
for(const id of ['adminReview2026Total','adminReview2026Technical','adminReview2026Approved'])assert.equal(await host.locator('#'+id).isVisible(),true);
for(const label of ['학교별 검수 및 승인','일괄 승인','레벨별 공개 승인','수집·동기화 기록','신고·정정 및 응답 신뢰성']){
const summary=host.locator('summary').filter({hasText:label}).first();await summary.click();
assert.equal(await summary.evaluate(n=>n.parentElement.open),true);
}
for(const id of ['adminReview2026Filter','adminBulkApprovalApply','adminLevelReleaseButton0','adminLevelReleaseButton1','adminLevelReleaseButton2','adminWaterwayRaw'])assert.equal(await host.locator('#'+id).isVisible(),true);
for(const id of ['adminBulkApprovalApply','adminLevelReleaseButton0','adminLevelReleaseButton1','adminLevelReleaseButton2'])assert.equal(await host.locator('#'+id).isDisabled(),true);
await page.evaluate(()=>window.BeaguCivicAdmin.mount('owner'));await page.waitForFunction(()=>document.querySelector('#civicAdminMessage').textContent.includes('최근 0건'));
assert.equal(await page.locator('#admin2026Reports #civicAdminList').isVisible(),true);
await page.evaluate(()=>window.BeaguCivicAdmin.reset());assert.equal(await page.locator('#civicAdminList').isVisible(),false);
await box.locator(':scope > summary').click();assert.equal(await host.isVisible(),false);
console.log('PASS admin compact viewport',width);
}finally{await page.close();}}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
