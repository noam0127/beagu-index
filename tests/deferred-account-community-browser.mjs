import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const read=p=>readFileSync(p,'utf8');
assert.match(read('challenge.html'),/<section id="level3-account" hidden inert/);
assert.match(read('levels.html'),/data-tier="3" hidden inert/);
assert.match(read('js/challenge-level3-v1.js'),/if\(!card\|\|card.hidden\|\|card.inert\)return/);
assert.match(read('postit.html'),/<template id="beaguDeferredCommunity">/);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const base='http://127.0.0.1:8124/';
 await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 for(const width of [375,1280]){
   await page.setViewportSize({width,height:900});
   await page.goto(base+'challenge.html#level3-create');
   assert.ok(await page.locator('#level3-account').isHidden());
   assert.ok(await page.locator('#level3Form').isHidden());
   assert.ok(await page.locator('#beaguAccountEntry').isHidden());
   await page.goto(base+'levels.html');
   assert.ok(await page.locator('.beagu-level-guide-card[data-tier="3"]').isHidden());
   for(const tier of [0,1,2])assert.ok(await page.locator('.beagu-level-guide-card[data-tier="'+tier+'"]').isVisible());
   await page.goto(base+'postit.html');
   assert.equal(await page.locator('#postitAccountForm').count(),0);
   assert.equal(await page.locator('#postitWriteForm').count(),0);
   assert.ok(await page.locator('#postit-main a[href="index.html"]').isVisible());
   await page.goto(base+'statistics.html');
   assert.ok(await page.locator('#comparePostit').isHidden());
 }
 console.log('PASS: deferred Lv3/account and community entry points on mobile and desktop; old direct link inert');
}finally{await browser.close();}
