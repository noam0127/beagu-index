const assert=require('node:assert/strict'),fs=require('node:fs/promises'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{
 const html=await fs.readFile('challenge.html','utf8'),js=await fs.readFile('js/challenge.js','utf8'),ref=await fs.readFile('js/challenge-referral-v1.js','utf8'),css=await fs.readFile('styles/challenge-milestone-v1.css','utf8');const source=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 const cssFiles=await Promise.all(['styles/challenge-layout-v1.css','styles/challenge-premium-grid-v1.css','styles/beagu-clean-v1.css'].map(p=>fs.readFile(p,'utf8')));
 for(const width of [390,1440])for(const scenario of [{ordinal:777,level:1,count:0,promoted:false},{ordinal:778,level:2,count:0,promoted:false},{ordinal:777,level:1,count:12,promoted:true}]){
  const page=await browser.newPage({viewport:{width,height:1000}});try{
   await page.route('https://fixture.invalid/**',route=>route.fulfill({contentType:'text/html',body:source}));await page.route('**/*',route=>route.request().url().startsWith('https://fixture.invalid/')?route.fallback():route.abort());
   await page.goto('https://fixture.invalid/challenge.html');
   for(const content of [...cssFiles,css])await page.addStyleTag({content});
   await page.evaluate(s=>{
    window.SUPABASE_URL='https://fixture.invalid';window.beaguVisitor='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    sessionStorage.setItem('beagu-level-session-v1','b'.repeat(64));localStorage.setItem('beagu-referral-device-secret-v1','c'.repeat(64));
    document.querySelector('#challengeAccessPanel').setAttribute('data-auth-level',String(s.level));document.querySelector('#challengeProtected').hidden=false;
    window._captures=[];window._shares=[];window._count=s.count;window._promoted=s.promoted;
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window._shares.push(data)}});
    window.fetch=async(url)=>({ok:true,status:200,json:async()=>String(url).includes('identity')?{participantNo:s.ordinal,identityCode:'ABCDEFGHJK'}:{link:'https://baeguindex.com/survey.html?ref='+'a'.repeat(64),level:window._promoted?2:1,validReferrals:window._count,provisional:window._promoted}});
    window.html2canvas=async(root)=>{window._captures.push({text:root.textContent,level:root.dataset.level,private:!!root.querySelector('#identityCode,#challengeReferralLink')});const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;return canvas;};
   },scenario);
   await page.addScriptTag({content:js});await page.addScriptTag({content:ref});await page.evaluate(()=>window.dispatchEvent(new Event('beagu:challenge-access-granted')));
   const expected=scenario.promoted||scenario.level===2?'2':'1';
   await page.waitForFunction(({expected,count})=>document.querySelector('#certificate').dataset.level===expected&&document.querySelector('#challengeReferralCount').textContent===count.toLocaleString('ko-KR')+'건'&&!document.querySelector('#capture').disabled&&window._captures.length>0,{expected,count:scenario.count});
   assert.equal(await page.locator('#certificateMilestone').isVisible(),scenario.ordinal===777);assert.equal(await page.locator('#copyIdentityCode').isVisible(),scenario.promoted);
   const captures=await page.evaluate(()=>window._captures);assert.equal(captures.at(-1).level,expected);assert(captures.every(x=>!x.private&&!x.text.includes('ABCDEFGHJK')&&!x.text.includes('?ref=')));
   if(expected==='2')assert.equal(await page.locator('#certificateLevelBanner').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(109, 54, 179)');
   await page.locator('#shareChallengeReferral').click();const shares=await page.evaluate(()=>window._shares);assert.equal(shares.length,1);assert(shares[0].url.startsWith('https://baeguindex.com/survey.html?ref='));assert(!JSON.stringify(shares[0]).includes('ABCDEFGHJK'));
   // Hold a real UI refresh while parsing its response, then revoke access.
   await page.evaluate(()=>{window._staleReleased=false;window.fetch=async()=>({ok:true,status:200,json:()=>new Promise(resolve=>{window._releaseStale=()=>{resolve({link:'https://baeguindex.com/survey.html?ref='+'d'.repeat(64),level:2,validReferrals:99,provisional:true});window._staleReleased=true;}})});window.dispatchEvent(new Event('focus'));});
   await page.waitForFunction(()=>typeof window._releaseStale==='function');
   await page.evaluate(()=>{sessionStorage.removeItem('beagu-level-session-v1');document.querySelector('#challengeAccessPanel').setAttribute('data-auth-level','0');window.dispatchEvent(new Event('beagu:challenge-access-revoked'));window._releaseStale();});
   await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,20)));
   assert.equal(await page.locator('#capture').isDisabled(),true);assert.equal(await page.locator('#certificateMilestone').isVisible(),false);assert.equal(await page.locator('#shareChallengeReferral').isVisible(),false);assert.equal(await page.locator('#challengeReferralLink').inputValue(),'');
   console.log('PASS milestone viewport='+width+' ordinal='+scenario.ordinal+' level='+scenario.level+' promoted='+scenario.promoted);
  }finally{await page.close()}
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
