// Chromium fixture only. Every external network request is intercepted or blocked.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {chromium} from "playwright";
const origin="http://127.0.0.1:8765";
const server=spawn("python3",["-m","http.server","8765","--bind","127.0.0.1"],{stdio:"ignore"});
const verified="a".repeat(64),codeOnly="b".repeat(64);
const school={school_id:"TEST001",name:"가상초등학교",region:"가상지역",students:100,percentile:null};
const operatorPost="93000000-0000-4000-8000-000000000001",rootComment="93000000-0000-4000-8000-000000000002",replyComment="93000000-0000-4000-8000-000000000003";
const initial=[{id:"legacy",body:"기존 포스트잇",subject_type:"school",school,created_at:"2026-11-26T00:00:00Z",likes:1,comments:0,mine:false,liked:false,reported:false},{id:operatorPost,body:"운영자 테스트 글",subject_type:"general",school:null,created_at:"2026-11-26T00:01:00Z",likes:0,comments:1,nickname:"카리브해매너티",is_operator:true,mine:false,liked:false,reported:false}];
let browser;
try{
 for(let i=0;i<50;i++){try{if((await fetch(origin+"/postit.html")).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,...(process.env.BEAGU_CHROMIUM_PATH?{executablePath:process.env.BEAGU_CHROMIUM_PATH}:{})});
 async function scenario(width,token){
  const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:"block"});
  const page=await context.newPage();const posts=structuredClone(initial);const writes=[];const reads=[];const commentWrites=[];let readNotification=false;
  const thread=[{id:rootComment,body:"원댓글 테스트",parent_id:null,nickname:"리베로",is_operator:false,created_at:"2026-11-26T00:02:00Z",likes:0,mine:false}];
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await context.addInitScript(t=>{if(t)sessionStorage.setItem("beagu-level-session-v1",t);},token);
  await context.route("**/*",async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===origin)return route.continue();
   const headers={"access-control-allow-origin":origin,"access-control-allow-headers":"*","access-control-allow-methods":"GET, POST, OPTIONS","content-type":"application/json"};
   const send=(body,status=200)=>route.fulfill({status,headers,body:JSON.stringify(body)});
   if(req.method()==="OPTIONS")return route.fulfill({status:204,headers});
   if(u.hostname!=="snvzwrexuqavnfvzgxqj.supabase.co")return route.abort();
   const body=req.method()==="POST"?req.postDataJSON():{};
   if(u.pathname.endsWith("/beagu-level-api")){
    if(body.action==="verify")return send({level:token?2:0,provisional:token===codeOnly,expires_at:"2099-01-01T00:00:00Z"});
    return send({error:"FIXTURE_ONLY"},403);
   }
   if(!u.pathname.endsWith("/beagu-postit-api-v1"))return send({});
   const action=u.searchParams.get("action")||body.action;
   const allowed=req.headers()["x-beagu-level-session"]===verified;
   if(action==="writer_status")return allowed?send({linked:true,readable:true}):send({error:"LEVEL_REQUIRED"},403);
   reads.push(action);
   if(!allowed)return send({error:"LEVEL_REQUIRED"},403);
   if(action==="posts"){const tag=u.searchParams.get("school_id"),focus=u.searchParams.get("post_id");return send({posts:posts.filter(p=>(!tag||p.school?.school_id===tag)&&(!focus||p.id===focus))});}
   if(action==="schools")return send({schools:[school]});
   if(action==="school_info")return send({schools:{TEST001:school}});
   if(action==="comments")return send({comments:u.searchParams.get("post_id")===operatorPost?thread:[]});
   if(action==="notifications")return send({notifications:[{comment_id:rootComment,post_id:operatorPost,kind:"comment",created_at:"2026-11-26T00:02:00Z",is_read:readNotification}]});
   if(action==="notification_read"){assert.equal(body.comment_id,rootComment);readNotification=true;return send({read:true});}
   if(action==="create_comment"){commentWrites.push(body);thread.push({id:replyComment,body:body.text,parent_id:body.parent_id,nickname:"세터",created_at:new Date().toISOString(),likes:0,mine:true});return send({id:replyComment},201);}
   if(action==="create_post"){
    writes.push(body);
    if([...body.text].length>300)return send({error:"INVALID_POST"},400);
    const id="fixture-"+writes.length;
    posts.unshift({id,body:body.text,subject_type:body.subject_type,school:body.school_id?school:null,created_at:new Date().toISOString(),likes:0,comments:0,nickname:"세터",is_operator:false,mine:true,liked:false,reported:false});
    return send({id},201);
   }
   return send({error:"UNEXPECTED_ACTION"},400);
  });
  await page.goto(origin+"/postit.html");
  if(token!==verified){
   await page.waitForFunction(()=>["0","2"].includes(document.getElementById("beaguLevelState").dataset.level));
   await page.waitForTimeout(350);
   assert.equal(await page.locator("#postitWriteForm").isVisible(),false);
   assert.equal(await page.locator("#postitBoardContent").isVisible(),false);
   assert.equal(await page.locator(".postit-entry").count(),0);
   assert.equal(writes.length,0);
   assert.equal(await page.locator("#lockerNotifications").isVisible(),false);
  }else{
   await page.locator("#postitWriteForm").waitFor({state:"visible"});
   await page.getByText("기존 포스트잇",{exact:true}).waitFor();
   await page.getByText("카리브해매너티 · 운영자",{exact:true}).waitFor();
   assert.equal(await page.locator("#postitBody").isVisible(),true);
   await page.locator("#postitBody").fill("가".repeat(301));
   assert.equal([...(await page.locator("#postitBody").inputValue())].length,300);
   assert.equal(await page.locator("#postitCounter").innerText(),"300 / 300");
   await page.locator("#postitSubmit").click();
   await page.getByText("가".repeat(300),{exact:true}).waitFor();
   await page.getByText("세터",{exact:true}).first().waitFor();
   assert.equal(writes[0].subject_type,"general");
   assert.equal("school_id" in writes[0],false);
   assert.equal([...writes[0].text].length,300);
   await page.locator("#postitSchoolSearch").fill("가상");
   await page.getByRole("option",{name:/가상초등학교/}).click();
   await page.locator("#postitContext").getByText("가상초등학교",{exact:true}).waitFor();
   await page.locator("#postitBody").fill("학교 이야기");
   await page.locator("#postitSubmit").click();
   await page.getByText("학교 이야기",{exact:true}).waitFor();
   assert.equal(writes[1].subject_type,"school");
   assert.equal(writes[1].school_id,"TEST001");
   await page.locator("#lockerClearTag").click();
   await page.getByText("가".repeat(300),{exact:true}).waitFor();
   assert.equal(await page.locator("#postitSchoolSearch").isVisible(),true);
   // Verify same tagged post via existing school-detail deep link, not a second store.
   await page.getByRole("link",{name:"#가상초등학교",exact:true}).first().click();
   await page.waitForURL("**/postit.html?school_id=TEST001");
   await page.getByText("학교 이야기",{exact:true}).waitFor();
   assert.equal(await page.getByText("가".repeat(300),{exact:true}).count(),0);
   await page.goto(origin+"/postit.html?school_id=TEST001&compose=1");
   await page.locator("#postitBody").waitFor({state:"visible"});
   await page.waitForFunction(()=>document.activeElement?.id==="postitBody");
   assert.equal(await page.getByText("가".repeat(300),{exact:true}).count(),0);
   assert.equal(await page.locator('input[type="email"],input[type="tel"]').count(),0);
   await page.locator("#lockerNotificationTitle").click();
   await page.getByRole("link",{name:/내 글에 댓글이 달렸습니다/}).click();
   await page.waitForURL("**/postit.html?post_id="+operatorPost);
   await page.getByText("원댓글 테스트",{exact:true}).waitFor();
   assert.equal(readNotification,true);
   await page.getByRole("button",{name:"답글",exact:true}).click();
   await page.locator(".bookmark-composer textarea").fill("대댓글 테스트");
   await page.locator(".bookmark-composer button[type=submit]").click();
   await page.locator(".locker-reply").getByText("대댓글 테스트",{exact:true}).waitFor();
   assert.equal(commentWrites[0].parent_id,rootComment);
   assert.equal(commentWrites[0].post_id,operatorPost);
   assert.equal(await page.locator(".locker-reply").getByRole("button",{name:"답글",exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,"mobile horizontal overflow");
   await page.evaluate(()=>{sessionStorage.removeItem("beagu-level-session-v1");document.getElementById("beaguLevelState").dataset.level="0";window.dispatchEvent(new CustomEvent("beagu:level-state-updated",{detail:{level:0}}));});
   await page.locator("#postitBoardContent").waitFor({state:"hidden"});
   assert.equal(await page.locator(".postit-entry").count(),0);
   assert.equal(await page.locator("#lockerNotifications").isVisible(),false);
   assert.equal(await page.locator("#lockerNotificationList li").count(),0);
  }
  assert.deepEqual(errors,[],"uncaught browser errors");
  await context.close();
 }
 await scenario(1280,"");await scenario(390,codeOnly);await scenario(1280,verified);await scenario(390,verified);
 // Load the actual page sections and production scripts in a minimal isolated
 // fixture, avoiding unrelated homepage/admin telemetry and authentication UI.
 const {readFileSync}=await import("node:fs");
 const homeMarkup=readFileSync("index.html","utf8").match(/<section[^>]*id="beaguHomeLocker"[\s\S]*?<\/section>/)[0];
 const adminMarkup=readFileSync("admin.html","utf8").match(/<section[^>]*id="adminLockerReports"[\s\S]*?<\/section>/)[0];
 const fixture=await browser.newContext({viewport:{width:390,height:850},serviceWorkers:"block"});
 const page=await fixture.newPage();let previewRequests=0,adminRequests=0,decision=null,allowOwner=false,allowPreview=false;
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await fixture.route("**/*",async route=>{
  const req=route.request(),u=new URL(req.url());
  const headers={"access-control-allow-origin":origin,"access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,OPTIONS","content-type":"application/json"};
  const send=(body,status=200)=>route.fulfill({status,headers,body:JSON.stringify(body)});
  if(u.origin===origin){
   if(u.pathname==="/home-fixture")return route.fulfill({contentType:"text/html; charset=utf-8",body:'<!doctype html><meta charset="utf-8"><a id="beaguLevelState" data-level="0"></a>'+homeMarkup+'<script src="/js/beagu-home-locker-v11125.js"></script>'});
   if(u.pathname==="/admin-fixture")return route.fulfill({contentType:"text/html; charset=utf-8",body:'<!doctype html><meta charset="utf-8">'+adminMarkup+'<script>const SUPABASE_URL="https://fixture.invalid",SUPABASE_PUBLISHABLE_KEY="fixture";const supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:"synthetic"}}})}};</script><script src="/js/beagu-admin-locker-v11125.js"></script>'});
   return route.continue();
  }
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers});
  if(u.searchParams.get("action")==="home_latest"){
   previewRequests++;
   if(!allowPreview||req.headers()["x-beagu-level-session"]!==verified)return send({error:"LEVEL_REQUIRED"},403);
   return send({posts:Array.from({length:4},(_,i)=>({id:operatorPost,excerpt:"홈 합성 글 "+i,nickname:"리베로",is_operator:false}))});
  }
  if(u.hostname==="fixture.invalid"){
   adminRequests++;
   if(!allowOwner)return send({error:"owner_required"},403);
   const b=req.postDataJSON();
   if(b.action==="locker_reports")return send({ok:true,data:{rows:decision?[]:[{target_type:"post",target_id:operatorPost,body:"신고 합성 글",reports:1,status:"published"}]}});
   if(b.action==="locker_report_decide"){decision=b;return send({ok:true,data:{updated:true}});}
  }
  return route.abort();
 });
 await page.goto(origin+"/home-fixture");
 assert.equal(previewRequests,0);
 assert.equal(await page.locator("#homeLockerList li").count(),0);
 await page.evaluate(t=>{sessionStorage.setItem("beagu-level-session-v1",t);document.getElementById("beaguLevelState").dataset.level="2";window.dispatchEvent(new Event("beagu:level-state-updated"));},codeOnly);
 await page.waitForTimeout(250);
 assert.equal(await page.locator("#homeLockerList li").count(),0);
 allowPreview=true;
 await page.evaluate(t=>{sessionStorage.setItem("beagu-level-session-v1",t);window.dispatchEvent(new Event("beagu:level-state-updated"));},verified);
 await page.getByText("홈 합성 글 0",{exact:true}).waitFor();
 assert.equal(await page.locator("#homeLockerList li").count(),3);
 await page.evaluate(()=>{sessionStorage.removeItem("beagu-level-session-v1");document.getElementById("beaguLevelState").dataset.level="0";window.dispatchEvent(new Event("beagu:level-state-updated"));});
 assert.equal(await page.locator("#homeLockerList li").count(),0);
 await page.goto(origin+"/admin-fixture");
 await page.evaluate(()=>window.BeaguLockerAdmin.mount("viewer"));
 assert.equal(await page.locator("#adminLockerReports").isVisible(),false);
 assert.equal(adminRequests,0);
 await page.evaluate(()=>window.BeaguLockerAdmin.mount("owner"));
 await page.getByText("신고 목록을 확인할 수 없습니다.",{exact:true}).waitFor();
 assert.equal(await page.locator("#adminLockerRows article").count(),0);
 allowOwner=true;
 await page.locator("#adminLockerReload").click();
 await page.getByText("신고 합성 글",{exact:true}).waitFor();
 await page.locator("#adminLockerRows textarea").fill("합성 신고 검토 사유입니다");
 page.once("dialog",d=>d.accept());
 await page.getByRole("button",{name:"24시간 작성 제한",exact:true}).click();
 await page.getByText("처리 완료 · 기록 저장",{exact:true}).waitFor();
 assert.equal(decision.decision,"restrict_24h");
 assert.equal(decision.target_id,operatorPost);
 assert.equal("author_uid" in decision,false);
 await page.evaluate(()=>window.BeaguLockerAdmin.reset());
 assert.equal(await page.locator("#adminLockerRows article").count(),0);
 assert.equal(await page.locator("#adminLockerReports").isVisible(),false);
 assert.deepEqual(errors,[]);
 await fixture.close();
 console.log("PASS home three-item preview and owner report UI, unauthorized/cleared states");

 console.log("PASS desktop/mobile locker room: verified account gate, 300 characters, optional tag, shared deep link, no contact fields, one-level replies, notification click and revoke/purge");
}finally{if(browser)await browser.close();server.kill();}
