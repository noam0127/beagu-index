const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});try{
 const p=await b.newPage({viewport:{width:390,height:844}});
 await p.route('**/*',r=>r.abort());await p.setContent('<div id="adminAuto2026" hidden></div>');
 await p.evaluate(()=>{
 window.SUPABASE_URL='https://fixture.invalid';window.supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:'admin-token'}}})}};
 window.sent=[];window.calls=[];window.denyGoogle=false;window.denyRead=false;
 window.google={accounts:{oauth2:{initTokenClient:o=>({requestAccessToken:()=>{window.calls.push(['oauth',o.scope,o.include_granted_scopes]);o.callback(window.denyGoogle?{error:'access_denied'}:{access_token:'fixture-google',scope:o.scope});}})}}};
 window.fetch=async(url,opts)=>{window.calls.push([url,opts.headers.Authorization||opts.headers.authorization,opts.method]);if(url.startsWith('https://sheets.googleapis.com/')){
 if(window.denyRead)return new Response('{}',{status:403});
 if(url.includes('/values/'))return Response.json({values:[['학교ID','백분위','Q01','Q22.1','Q31','Q51'],['1000001','82.34%','보통이다','그렇다','PRIVATE','PRIVATE']]});
 return Response.json({sheets:[{properties:{sheetId:0,title:'2026',sheetType:'GRID'}},{properties:{sheetId:123,title:"최종'편집본",sheetType:'GRID'}}]});}
 if(url.startsWith('https://fixture.invalid/')){window.sent.push(JSON.parse(opts.body));return Response.json({ok:true,schools:1});}throw Error('unexpected external request');
 };
 });
 for(const f of ['js/beagu-edited-sheet-v1.js','js/beagu-2026-edited-admin-v1.js'])await p.addScriptTag({content:fs.readFileSync(f,'utf8')});
 await p.evaluate(()=>Beagu2026ReviewAdmin.mount('viewer'));assert.equal(await p.locator('#adminAuto2026').isVisible(),false);
 await p.evaluate(()=>Beagu2026ReviewAdmin.mount('owner'));
 await p.getByLabel('Google 웹 OAuth 클라이언트 ID').fill('fixture-client.apps.googleusercontent.com');
 const input=p.getByLabel('2026 최종 스프레드시트 링크'),button=p.getByRole('button',{name:'최종 편집본 반영'});
 await input.fill('https://evil.invalid/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit');await button.click();await p.getByText('Google 스프레드시트 원본 링크만 사용할 수 있습니다.').waitFor();assert.equal(await p.evaluate(()=>calls.length),0);
 await input.fill('https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit#gid=123');await button.click();await p.getByText('1개교 편집본 반영 완료 · 기존 공개중단은 유지됩니다.').waitFor();
 const {sent,calls}=await p.evaluate(()=>({sent,calls}));assert.deepEqual(sent[0],{action:'edited_2026_publish',confirmation:'FINAL_EDITED_FILE',table:[['학교ID','백분위','Q01','Q22.1'],['1000001','82.34%','보통이다','그렇다']]});
 assert(!JSON.stringify(sent).includes('fixture-google'));assert(!JSON.stringify(sent).includes('PRIVATE'));
 assert.deepEqual(calls[0],['oauth','https://www.googleapis.com/auth/spreadsheets.readonly',false]);assert(calls[1][0].includes('fields='));assert(decodeURIComponent(calls[2][0]).includes("'최종''편집본'"));assert(calls[2][0].includes('FORMATTED_VALUE'));assert.equal(calls[2][1],'Bearer fixture-google');assert.equal(calls[3][1],'Bearer admin-token');
 await p.evaluate(()=>{denyGoogle=true});await button.click();await p.getByText('Google 스프레드시트 읽기 권한이 필요합니다.').waitFor();assert.equal(await p.evaluate(()=>sent.length),1);
 await p.evaluate(()=>{denyGoogle=false;denyRead=true});await button.click();await p.getByText('Google 계정의 읽기 권한 또는 Sheets API 설정을 확인하세요.').waitFor();assert.equal(await p.evaluate(()=>sent.length),1);
 await p.evaluate(()=>Beagu2026ReviewAdmin.reset());assert.equal(await p.locator('#adminAuto2026').isVisible(),false);
 console.log('PASS native Sheets link, explicit tab, read-only OAuth, displayed percent, Q31/Q51 stripped, no Google token forwarded, permission failure and owner-only UI');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
