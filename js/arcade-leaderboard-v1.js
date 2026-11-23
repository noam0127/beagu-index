/* Anonymous public arcade TOP 10. No player-entered names, profiles or name storage. */
(function(){
"use strict";
const API="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard";
const games=new Set(["volleyball_25","teacher_run_retirement"]);
const fmt=n=>Math.max(0,Math.floor(Number(n)||0)).toLocaleString("ko-KR");
const displayScore=score=>fmt(score)+"점";
const fmtTime=n=>{const t=Math.max(0,Math.floor(Number(n)||0));return Math.floor(t/600)+":"+String(Math.floor((t%600)/10)).padStart(2,"0")+"."+(t%10);};
function orderFast(rows){
 return rows.filter(x=>x&&Number.isSafeInteger(x.timeTenths)&&x.timeTenths>0)
  .map(x=>({timeTenths:x.timeTenths,created_at:String(x.created_at||""),school_id:typeof x.school_id==="string"?x.school_id:null,school_name:String(x.school_name||"학교 미등록"),difficulty:x.difficulty||null}))
  .sort((a,b)=>a.timeTenths-b.timeTenths||a.created_at.localeCompare(b.created_at)).slice(0,10);
}
const levelNames={easy:"EASY",normal:"NORMAL",hard:"HARD",very_hard:"VERY HARD",extreme:"EXTREME"};
function el(tag,cls,text){
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(text!==undefined)e.textContent=String(text);
 return e;
}
function schoolLink(entry){
 const name=entry.school_name||"학교 미등록";
 const id=entry.school_id;
 if(typeof id!=="string"||!/^[A-Z0-9]{7}$/.test(id))return el("span","arcade-rank-school",name);
 const link=el("a","arcade-rank-school arcade-rank-school-link",name);
 link.href="school-link.html?school_id="+encodeURIComponent(id);
 link.target="_top";
 link.setAttribute("aria-label",name+" 학교 상세조회");
 return link;
}
function order(rows,game){
 return rows.filter(x=>x&&Number.isSafeInteger(x.score)&&x.score>=0)
  .map(x=>({score:x.score,created_at:String(x.created_at||""),
    school_id:typeof x.school_id==="string"?x.school_id:null,school_name:String(x.school_name||"학교 미등록"),difficulty:x.difficulty||null}))
  .sort((a,b)=>b.score-a.score||a.created_at.localeCompare(b.created_at))
  .slice(0,10);
}
// Purge historical local leaderboard caches, including previously typed nicknames.
try{
 localStorage.removeItem("arcade-last-name-v1");
 for(const game of ["volleyball","volleyball_25","teacher_run","teacher_run_retirement"])
  localStorage.removeItem("arcade-local-top10-v1-"+game);
}catch(e){}
class ArcadeLeaderboard{
 constructor(game,mount){
  if(!games.has(game))throw new Error("invalid leaderboard game");
  this.game=game;this.mount=typeof mount==="string"?document.querySelector(mount):mount;
  this.board=[];this.fastestBoard=[];this.remote=false;this.session=null;this.pendingStart=null;
  this.tier=null;this.loadRequestId=0;this.pendingTier=null;
  this.pendingLoad=null;this.score=0;this.stats=null;this.school=null;
  this.playGeneration=0;this.isSubmitting=false;this.notice="";this.expanded=false;
  if(this.mount){this.draw();this.load();}
 }
 async request(method,body=null){
  const options={method,cache:"no-store",headers:{"Content-Type":"application/json"}};
  if(body)options.body=JSON.stringify(body);
  // Standard Supabase Auth automatically shares the admin session across same-origin pages.
  // An authenticated admin token MUST reach the Edge Function for server-side exclusion.
  // If Auth storage exists but the SDK is unavailable, fail closed on scoring writes.
  if(typeof supabaseClient!=="undefined" && supabaseClient?.auth?.getSession){
    const {data,error}=await supabaseClient.auth.getSession();
    if(error)throw new Error("auth_check_unavailable");
    const token=data?.session?.access_token;
    if(token)options.headers.Authorization="Bearer "+token;
  }else if(method==="POST"){
    try{
      if(localStorage.getItem("sb-snvzwrexuqavnfvzgxqj-auth-token"))
        throw new Error("auth_check_unavailable");
    }catch(error){throw error;}
  }
  const url=API+(method==="GET"?"?game="+encodeURIComponent(this.game)+(this.tier?"&difficulty="+encodeURIComponent(this.tier):""):"");
  const response=await fetch(url,options);
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const err=new Error(data.error||"api_error");err.status=response.status;throw err;}
  return data;
 }
 async load(){
  if(this.pendingLoad&&this.pendingTier===this.tier)return this.pendingLoad;
  const requestId=++this.loadRequestId;
  this.pendingTier=this.tier;
  const current=(async()=>{
   try{
    const data=await this.request("GET");
    if(!Array.isArray(data.top10))throw new Error("invalid_response");
    if(requestId!==this.loadRequestId)return this.board;
    this.remote=true;this.board=order(data.top10,this.game);
    if(this.game==="volleyball_25")this.fastestBoard=orderFast(data.fastestTop10||[]);
   }catch(e){
    if(requestId!==this.loadRequestId)return this.board;
    this.remote=false;this.board=[];this.fastestBoard=[];
   }
   this.draw();return this.board;
  })();
  this.pendingLoad=current;
  try{return await current;}finally{if(requestId===this.loadRequestId)this.pendingLoad=null;}
 }
 start(school){
  this.cancel();this.lastStartError=null;
  if(!school||!school.eligible||!school.school_id||!school.school_name){
   this.lastStartError="school_ineligible";return Promise.resolve(null);
  }
  this.school={school_id:String(school.school_id),school_name:String(school.school_name),difficulty:school.difficulty};
  const schoolId=this.school.school_id,generation=this.playGeneration;
  this.pendingStart=(async()=>{
   try{
    const data=await this.request("POST",{action:"start",game:this.game,school_id:schoolId});
    if(generation!==this.playGeneration)return null;
    if(data.school?.eligible!==true||typeof data.session!=="string")throw new Error("school_ineligible");
    this.session=data.session;
    this.school={school_id:data.school.school_id,school_name:data.school.school_name,difficulty:data.school.difficulty};
    return this.session;
   }catch(e){
    if(generation===this.playGeneration){
     this.session=null;this.lastStartError=String(e?.message||"network_unavailable");
    }
    return null;
   }
  })();
  return this.pendingStart;
 }
 cancel(){
  // Any delayed start/record result belongs to the previous match.
  this.playGeneration++;this.session=null;this.pendingStart=null;this.school=null;
  this.score=0;this.stats=null;this.notice="";this.isSubmitting=false;
  this.draw();
 }
 async finish(score,stats){
  const generation=this.playGeneration;
  const session=this.session,game=this.game,tier=this.tier;
  if(!session||this.isSubmitting)return false;
  const value=Number(score);
  if(!Number.isFinite(value)||value<0)return false;
  const finalScore=Math.floor(value);
  // Start the request immediately. Do not first await the TOP 10 fetch:
  // a player who taps "play again" must not silently lose the finished match.
  this.session=null;
  this.score=finalScore;this.stats=stats;
  this.isSubmitting=true;
  this.notice="익명 경기 결과 저장 중…";this.draw();
  try{
   const data=await this.request("POST",{action:"submit",game,session,stats,...(tier?{difficulty:tier}:{})});
   if(generation!==this.playGeneration)return; // Already sent; newer game owns the UI.
   if(!Array.isArray(data.top10)||typeof data.ranked!=="boolean")throw new Error("invalid_response");
   this.remote=true;this.board=order(data.top10,game);
   if(game==="volleyball_25")this.fastestBoard=orderFast(data.fastestTop10||[]);
   this.notice=data.excluded===true
    ?"관리자 플레이 · 일반 게임 기록과 통계에서 제외되었습니다."
    :data.ranked
    ?"🏆 점수 TOP "+data.rank+"위 · "+displayScore(finalScore)
    :data.timeRanked?"⏱ 25점 최단시간 TOP "+data.timeRank+"위 · "+displayScore(finalScore)
    :data.recorded===false?"이번 경기 "+displayScore(finalScore)+" · 상위 100위 밖 · 기록 미등록"
    :"이번 경기 "+displayScore(finalScore)+" · 역대 상위 100위 안에 기록됨";
    return true;
  }catch(err){
   if(generation!==this.playGeneration)return;
   this.notice=err.status===409?"경기가 만료되었거나 이미 기록되었습니다":
    err.status===400?"기록 검증 실패 · 다시 플레이해 주세요":
    "공식 기록 서버 연결 실패 · 기록을 저장하지 못했습니다";
  }finally{
   if(generation===this.playGeneration){this.isSubmitting=false;this.draw();}
  }
 }
 draw(){
  if(!this.mount)return;
  const root=this.mount;root.replaceChildren();root.classList.add("arcade-ranking");
  const toggle=el("button","arcade-ranking-toggle",
    this.game==="volleyball_25"?"🏆 TOP 10 기록 · 점수 / 최단시간":"🏆 TOP 10 기록 · 정년 생존");
  toggle.type="button";
  const content=el("div","arcade-ranking-content");
  content.id=this.game==="volleyball_25"?"volleyball-top10-content":"teacher-run-top10-content";
  content.hidden=!this.expanded;
  toggle.setAttribute("aria-controls",content.id);
  toggle.setAttribute("aria-expanded",String(this.expanded));
  const indicator=el("span","arcade-ranking-chevron",this.expanded?"▴":"▾");
  indicator.setAttribute("aria-hidden","true");
  toggle.append(indicator);
  toggle.addEventListener("click",()=>{
    this.expanded=!this.expanded;
    content.hidden=!this.expanded;
    toggle.setAttribute("aria-expanded",String(this.expanded));
    indicator.textContent=this.expanded?"▴":"▾";
  });
  root.append(toggle);
  if(this.notice){const node=el("p","arcade-rank-feedback",this.notice);node.setAttribute("role","status");root.append(node);}
  root.append(content);
  const header=el("div","arcade-ranking-head");
  header.append(el("strong","",this.game==="volleyball_25"?"🏆 배구 최고 점수 TOP 10":"🏆 정년 생존 점수 TOP 10"),
    el("small","",this.remote?"공식 기록 · 익명":"공식 서버 확인 중"));
  content.append(header);
  const filter=el("select","arcade-tier-filter");
  filter.setAttribute("aria-label","랭킹 난이도 선택");
  for(const [value,label] of [["","전체 난이도"],...Object.entries(levelNames)]){
   const opt=document.createElement("option");opt.value=value;opt.textContent=label;filter.append(opt);
  }
  filter.value=this.tier||"";
  filter.addEventListener("change",()=>{
   this.tier=filter.value||null;
   this.load();
  });
  content.append(filter);

  const labels=el("div","arcade-rank-grid arcade-rank-label");
  ["순위","학교 · 난이도","점수"].forEach(x=>labels.append(el("span","",x)));content.append(labels);
  if(!this.board.length)content.append(el("div","arcade-rank-empty",
    this.remote?"아직 등록된 점수 기록이 없습니다":"기록을 불러올 수 없습니다"));
  else for(const [i,entry] of this.board.entries()){
   const row=el("div","arcade-rank-grid arcade-rank-row"),school=el("div","arcade-rank-person");
   school.append(schoolLink(entry),el("span","arcade-rank-level",levelNames[entry.difficulty]||""));
   row.append(el("span","",String(i+1).padStart(2,"0")),school,el("span","",fmt(entry.score)));content.append(row);
  }
  if(this.game==="volleyball_25"){
   const headerTime=el("div","arcade-ranking-head");headerTime.style.marginTop="16px";
   headerTime.append(el("strong","","⏱ 25점 승리 최단시간 TOP 10"),el("small","","25점 승리 경기만 · 빠른 시간순"));
   content.append(headerTime);
   const timeLabels=el("div","arcade-rank-grid arcade-rank-label");
   ["순위","학교 · 난이도","완주 시간"].forEach(x=>timeLabels.append(el("span","",x)));
   content.append(timeLabels);
   if(!this.fastestBoard.length)content.append(el("div","arcade-rank-empty",
     this.remote?"아직 25점 승리 시간 기록이 없습니다":"기록을 불러올 수 없습니다"));
   else for(const [i,entry] of this.fastestBoard.entries()){
    const row=el("div","arcade-rank-grid arcade-rank-row"),school=el("div","arcade-rank-person");
    school.append(schoolLink(entry),
      el("span","arcade-rank-level",levelNames[entry.difficulty]||""));
    row.append(el("span","",String(i+1).padStart(2,"0")),school,el("span","",fmtTime(entry.timeTenths)));content.append(row);
   }
  }
  const history=el("a","arcade-history-link","📚 역대 게임 기록 · 상위 100위 보기");
  history.href="arcade-history.html?game="+encodeURIComponent(this.game);
  history.target="_top";
  history.setAttribute("aria-label",this.game==="volleyball_25"?
   "선생님배구 역대 게임 기록 모두 보기":"험난한 교직생활 역대 게임 기록 모두 보기");
  content.append(history);
 }

}
window.ArcadeLeaderboard=ArcadeLeaderboard;
})();