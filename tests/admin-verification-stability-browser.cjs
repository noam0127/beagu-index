const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{
 const p=await b.newPage();await p.route('**/*',r=>r.abort());
 await p.setContent(fs.readFileSync('admin-updates.html','utf8').replace(/<script\b[\s\S]*?<\/script>/gi,''));
 await p.evaluate(()=>{window.SUPABASE_URL='https://fixture.invalid';window.SUPABASE_PUBLISHABLE_KEY='fixture';window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'fixture'}}})}};window.calls=[];window.tick=null;window.setInterval=fn=>{tick=fn;return 1};window.clearInterval=()=>{};window.fixture={direct_release_v1:true,direct_candidate_ready:true,direct_candidate_checked_at:Date.now(),state:{production_sha:'a'.repeat(40),production_version:'v1.11.13.3',draft_sha:'b'.repeat(40),draft_version:'v1.11.14',draft_summary:'fire'},production_history:[],staging_history:[],recent_jobs:[]};window.fetch=async(url,opt={})=>{if(String(url).startsWith('/release-info'))return {ok:true,json:async()=>({environment:'production',commit:'a'.repeat(40)})};const q=JSON.parse(opt.body);calls.push(q);if(q.action==='verify')return {ok:true,json:async()=>({permitted:true,mfa_verified:true,role:'owner'})};if(q.action==='status')return {ok:true,json:async()=>structuredClone(fixture)};throw Error('unexpected '+q.action);};});
 await p.addScriptTag({content:fs.readFileSync('js/beagu-admin-updates-v1.js','utf8')});
 const apply=p.locator('#releaseProdApply'),info=p.locator('#releaseDraftInfo');
 await p.waitForFunction(()=>!document.querySelector('#releaseProdApply').disabled);
 async function refresh(patch){await p.evaluate(patch);const count=await p.evaluate(()=>calls.length);await p.locator('#releaseRefresh').click();await p.waitForFunction(n=>calls.length>n,count);await p.waitForTimeout(80);}
 await refresh(()=>{fixture.direct_candidate_ready=null;});assert.equal(await apply.isEnabled(),true);
 await refresh(()=>{fixture.direct_candidate_ready=false;fixture.direct_candidate_reason='github_rate_limited';});assert.match(await info.textContent(),/호출 제한/);assert.equal(await apply.isEnabled(),true);
 await refresh(()=>{fixture.direct_candidate_reason='direct_ci_required';});assert.equal(await apply.isDisabled(),true);assert.match(await info.textContent(),/공식 CI/);
 await refresh(()=>{fixture.direct_candidate_ready=true;fixture.direct_candidate_reason=null;fixture.direct_candidate_checked_at=Date.now();});assert.equal(await apply.isEnabled(),true);
 await refresh(()=>{fixture.state.draft_summary='changed';fixture.direct_candidate_ready=null;});assert.equal(await apply.isDisabled(),true);
 await refresh(()=>{fixture.direct_candidate_ready=true;fixture.direct_candidate_checked_at=Date.now()-121000;});assert.equal(await apply.isDisabled(),true);
 assert.equal(await p.evaluate(()=>calls.filter(x=>x.action==='prod_direct_apply').length),0);
 console.log('PASS Chromium: quiet status, rate limit, hard failure, metadata change and proof expiry; no deployment');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
