const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
const read=p=>fs.readFileSync(p,'utf8');
const css=['styles/school-search-card-v1.css','styles/school-view-counts-v1.css','styles/beagu-ui-refresh-v2.css','styles/school-mbti-v1.css','styles/beagu-fullset-school-v11111.css','styles/beagu-light-touch-v1111.css','styles/school-glory-v1.css'];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
 try{
 for(const tier of [0,1,2])for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.route('**/*',r=>r.abort());
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><body class="beagu-ui-page '+(tier?'beagu-page-lv1':'beagu-page-search')+'"><main style="max-width:1400px;margin:auto;padding:12px;box-sizing:border-box"><section id="searchPanel" style="container:fullset-search/inline-size"><div id="results" class="results"></div></section></main></body>');
  for(const path of css)await page.addStyleTag({content:read(path)});
  for(const path of ['js/school-search-card-v1.js','js/school-view-counts-v1.js','js/school-game-points-v1.js'])await page.addScriptTag({content:read(path)});
  await page.evaluate(async tier=>{
   const school={school_id:'1234567',school_name:'아주긴이름의검증초등학교',sido_standard:'부산',support_office:'동래교육지원청',student_count:624,male_teacher_ratio:21.5,junior_teacher_ratio:12.3,housing_price_won:987654321};
   const host=document.getElementById('results'),api=window.BeaguSchoolSearchCard;
   for(let i=0;i<3;i++){
    const id=String(1234567+i),p=api.percentiles({publicValues:[15,null,40],value2026:i===0?42.8:i===1?0:100});
    const {card,open,detail}=api.createCard({...school,school_id:id},{level:tier,percentile:p});
    api.updateRecordedYears(card,['2023','2024']);host.append(card);
    if(detail){open.addEventListener('click',()=>{detail.hidden=!detail.hidden;open.setAttribute('aria-expanded',String(!detail.hidden))});}
   }
   window.supabaseClient={rpc:async(name,args)=>({data:args.p_school_ids.map((id,i)=>name==='beagu_school_game_points'?{school_id:id,points:i===0?'128450':0}:{school_id:id,views:3218+i}),error:null})};
   await window.BeaguSchoolGamePoints.refreshCards(host);
   await window.BeaguSchoolViewCounts.refreshCards(host);
  },tier);
  const card=page.locator('.school-glory-card').first();
  assert.equal(await card.locator('.glory-score').textContent(),'42.8%');
  assert.equal(await card.locator('[role="progressbar"]').getAttribute('aria-valuenow'),'42.8');
  assert.ok(Math.abs(await card.locator('.glory-track').evaluate(n=>n.firstElementChild.getBoundingClientRect().width/n.getBoundingClientRect().width)-.428)<.02);
  assert.equal(await page.locator('.glory-score').nth(1).textContent(),'0.0%');
  assert.equal(await page.locator('.glory-score').nth(2).textContent(),'100.0%');
  assert.equal(await card.locator('.glory-record-years').textContent(),'조사기록 2023 · 2024 · 2025 · 2026');
  assert.equal(await card.locator('.school-view-number').textContent(),'3,218');
  assert.equal(await card.locator('.glory-points-value').textContent(),'128,450 P');
  assert.equal(await card.locator('.court-school-experience').getAttribute('href'),(tier?'teacher-run.html':'teacher-volleyball.html')+'?school_id=1234567');
  assert.equal(await card.locator('.percentile-grid,.percentile-graph').count(),0);
  assert.equal(await card.locator('.glory-fact-value').first().textContent(),tier?'624명':'Lv.1+');
  if(tier){assert.equal(await card.locator('.school-detail').isVisible(),false);await card.locator('.glory-detail-trigger').click();assert.equal(await card.locator('.school-detail').isVisible(),true);}
  else assert.equal(await card.locator('.view-button').getAttribute('href'),'school-report.html?school_id=1234567');
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,cards:[...document.querySelectorAll('.school-glory-card')].map(c=>{const r=c.getBoundingClientRect();return [...c.querySelectorAll('.glory-actions a,.glory-actions button,.glory-points-value')].every(n=>{const x=n.getBoundingClientRect();return x.left>=r.left-1&&x.right<=r.right+1})})}));
  assert.ok(layout.scroll<=layout.width+1&&layout.cards.every(Boolean),JSON.stringify({tier,width,layout}));
  if(tier===2&&width===1440){await page.screenshot({path:'artifacts/v1114/desktop.png',fullPage:true});}
  if(tier===0&&width===390){await page.screenshot({path:'artifacts/v1114/mobile.png',fullPage:true});}
  await page.close();console.log('PASS school glory fixture',tier,width);
 }
 // No unapproved 2026, teacher data, or stale 2026 record year.
 const page=await browser.newPage();
 await page.addScriptTag({content:read('js/school-search-card-v1.js')});
 const failClosed=await page.evaluate(()=>{
  const api=window.BeaguSchoolSearchCard,p=api.percentiles({publicValues:[42,null,null],value2026:99,locked:true});
  const {card}=api.createCard({school_id:'1234567',school_name:'검증초',student_count:999},{level:0,percentile:p});
  api.updateRecordedYears(card,['2023']);document.body.append(card);
  return {score:card.querySelector('.glory-score').textContent,years:card.querySelector('.glory-record-years').textContent,track:!!card.querySelector('.glory-track'),fact:card.querySelector('.glory-fact-value').textContent};
 });
 assert.deepEqual(failClosed,{score:'🔒 Lv.1+ 승인 시',years:'조사기록 2023',track:false,fact:'Lv.1+'});
 await page.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
