// Browser tests against actual static account UI, intercepted synthetic API only.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const {chromium}=require('playwright');
const origin='http://127.0.0.1:8127',endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-account-v1';
const account='K7M4Q8TX2A',password='fixture-password-123',newPassword='replacement-password-456',device='a'.repeat(64),token='b'.repeat(64);
const assets=new Map([['/account.html','text/html'],['/js/beagu-account-v1.js','text/javascript'],['/styles/beagu-account-v1.css','text/css']]);
const server=http.createServer(async(req,res)=>{const p=new URL(req.url,origin).pathname;try{if(!assets.has(p)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':assets.get(p)});res.end(await fs.readFile('.'+p));}catch{res.end();}});
(async()=>{
 await new Promise(r=>server.listen(8127,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
  // Fail closed if the account JS is unavailable: no credentials in query string or network.
  const noJS=await browser.newContext({javaScriptEnabled:false});
  const noPage=await noJS.newPage();let submissions=0;
  await noJS.route('**/*',route=>{const u=new URL(route.request().url());if(route.request().method()!=='GET'||(u.pathname==='/account.html'&&u.search))submissions++;return u.origin===origin?route.continue():route.abort();});
  await noPage.goto(origin+'/account.html');
  await noPage.locator('#accountLogin [name="account_id"]').fill(account);
  await noPage.locator('#accountLogin [name="password"]').fill(password);
  await noPage.locator('#accountLogin button').click({noWaitAfter:true});
  await noPage.waitForTimeout(250);
  assert.equal(noPage.url(),origin+'/account.html');assert.equal(submissions,0);
  await noJS.close();console.log('PASS script-disabled credential submission blocked by CSP');
  for(const viewport of [{width:1280,height:850},{width:390,height:844}]){
   const ctx=await browser.newContext({viewport,acceptDownloads:true});let recovery='',pw=password,level=1,session=false,requests=0;const errors=[];
   await ctx.addInitScript(d=>localStorage.setItem('beagu-referral-device-secret-v1',d),device);
   await ctx.route('**/*',async route=>{
    const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();
    if(url!==endpoint)return route.abort();
    const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-beagu-session','content-type':'application/json'};
    const send=(status,data)=>route.fulfill({status,headers,body:JSON.stringify(data)});
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    requests++;const b=route.request().postDataJSON(),sessionToken=route.request().headers()['x-beagu-session'];
    const owner={account_id:account,level,lv2_active:level===2,nickname:'Il|ǀ❘ı∣│Il'};
    if(b.action==='signup'){assert.equal(b.code,account);assert.equal(b.account_id,account);assert.equal(b.deviceSecret,device);assert.match(b.new_recovery,/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{13}$/);recovery=b.new_recovery;return send(201,owner);}
    if(b.action==='password_login'){if(b.account_id!==account||b.password!==pw)return send(401,{error:'LOGIN_FAILED'});session=true;return send(200,{...owner,token});}
    if(b.action==='status')return session&&sessionToken===token?send(200,owner):send(401,{error:'LOGIN_FAILED'});
    if(b.action==='recover'){if(b.account_id!==account||b.recovery!==recovery)return send(403,{error:'RECOVERY_FAILED'});assert.notEqual(b.new_recovery,recovery);recovery=b.new_recovery;pw=b.password;session=false;return send(200,owner);}
    if(b.action==='logout'){session=false;return send(200,{ok:true});}
    return send(400,{error:'INVALID_REQUEST'});
   });
   const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/account.html');const form=(id,name)=>page.locator('#'+id+' [name="'+name+'"]');
   const submit=async id=>page.locator('#'+id+' button').click();
   await form('accountSignup','code').fill(account);await form('accountSignup','password').fill(password);await submit('accountSignup');
   await page.locator('#issuedAccount').waitFor({state:'visible'});assert.equal(await page.locator('#cardAccount').innerText(),account);assert.equal(await page.locator('#cardLv2').innerText(),'Lv.2 비활성');
   const old=await page.locator('#cardRecovery').innerText();assert.match(old,/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{5}$/);assert.equal(old.replaceAll('-',''),recovery);
   const downloadEvent=page.waitForEvent('download');await page.locator('#accountSaveCard').click();const download=await downloadEvent;
   const data=await fs.readFile(await download.path(),'utf8');assert.ok(data.includes(account)&&data.includes(old)&&data.includes('Lv.2 비활성'));assert.ok(!data.includes(password));
   await page.locator('#accountHideCard').click();assert.equal(await page.locator('#cardRecovery').textContent(),'');
   await form('accountLogin','password').fill(password);await submit('accountLogin');await page.locator('#accountSummary').waitFor({state:'visible'});assert.equal(await page.locator('#currentLv2').innerText(),'Lv.2 비활성');
   level=2;await page.reload();await page.locator('#accountSummary').waitFor({state:'visible'});assert.equal(await page.locator('#currentAccount').innerText(),account);assert.equal(await page.locator('#currentLv2').innerText(),'Lv.2 활성');
   await form('accountRecover','recovery').fill(old.toLowerCase());await form('accountRecover','password').fill(newPassword);await submit('accountRecover');await page.locator('#issuedAccount').waitFor({state:'visible'});
   assert.equal(await page.locator('#cardLv2').innerText(),'Lv.2 활성');const replacement=await page.locator('#cardRecovery').innerText();assert.notEqual(replacement,old);
   assert.equal(await form('accountRecover','recovery').inputValue(),'');assert.equal(await form('accountRecover','password').inputValue(),'');
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('beagu-account-session-v1')),null);
   await page.locator('#accountHideCard').click();
   await form('accountRecover','account_id').fill(account);await form('accountRecover','recovery').fill(old);await form('accountRecover','password').fill(password);await submit('accountRecover');await page.waitForFunction(()=>document.querySelector('#accountMessage').textContent.includes('실패'));
   await form('accountLogin','password').fill(newPassword);await submit('accountLogin');await page.locator('#accountSummary').waitFor({state:'visible'});
   await page.locator('#accountLogout').click();await page.locator('#accountSummary').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>sessionStorage.getItem('beagu-level-session-v1')),null);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');
   assert.equal(await page.locator('input[type=email],input[type=tel]').count(),0);
   assert.deepEqual(errors,[]);assert.ok(requests>=7);await ctx.close();
   console.log('PASS actual account UI browser '+viewport.width+'px: download, live Lv2, lowercase recovery, old-code denial, logout');
  }
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
