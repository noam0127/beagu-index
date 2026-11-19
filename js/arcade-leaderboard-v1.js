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
  .map(x=>({timeTenths:x.timeTenths,created_at:String(x.created_at||""),school_name:String(x.school_name||"학교 미등록"),difficulty:x.difficulty||null}))
  .sort((a,b)=>a.timeTenths-b.timeTenths||a.created_at.localeCompare(b.created_at)).slice(0,10);
}
const levelNames={easy:"EASY",normal:"NORMAL",hard:"HARD",very_hard:"VERY HARD",extreme:"EXTREME"};
function el(tag,cls,text){
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(text!==undefined)e.textContent=String(text);
 return e;
}
function order(rows,game){
 return rows.filter(x=>x&&Number.isSafeInteger(x.score)&&x.score>0)
  .map(x=>({score:x.score,created_at:String(x.created_at||""),
    school_name:String(x.school_name||"학교 미등록"),difficulty:x.difficulty||null}))
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
  this.playGeneration=0;this.isSubmitting=false;this.notice="";
  if(this.mount){this.draw();this.load();}
 }
 async request(method,body=null){
  const options={method,cache:"no-store",headers:{"Content-Type":"application/json"}};
  if(body)options.body=JSON.stringify(body);
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
  if(!this.session||this.isSubmitting)return;
  this.score=Math.floor(Number(score)||0);this.stats=stats;
  if(this.score<=0)return;
  try{if(this.pendingStart)await this.pendingStart;}catch(e){}
  if(generation!==this.playGeneration||!this.session)return;
  this.isSubmitting=true;
  this.notice="익명 기록 자동 확인 중…";this.draw();
  try{
   await this.load();
   if(generation!==this.playGeneration||!this.session)return;
   // Save all validated completed games, even if they do not reach TOP 10.
   const data=await this.request("POST",{action:"submit",game:this.game,session:this.session,stats:this.stats,...(this.tier?{difficulty:this.tier}:{})});
   if(generation!==this.playGeneration)return;
   if(!Array.isArray(data.top10)||typeof data.ranked!=="boolean")throw new Error("invalid_response");
   this.remote=true;this.board=order(data.top10,this.game);this.session=null;
   if(this.game==="volleyball_25")this.fastestBoard=orderFast(data.fastestTop10||[]);
   this.notice=data.ranked
    ?"🏆 점수 TOP "+data.rank+"위 · "+displayScore(this.score)
    :data.timeRanked?"⏱ 25점 최단시간 TOP "+data.timeRank+"위 · "+displayScore(this.score)
    :"이번 경기 "+displayScore(this.score)+" · 기록 저장, TOP 10 밖";
  }catch(err){
   if(generation!==this.playGeneration)return;
   this.notice=err.status===409?"경기가 만료되었거나 이미 기록되었습니다":
    err.status===400?"기록 검증 실패 · 다시 플레이해 주세요":
    "공식 기록 서버 연결 실패 · 기록이 저장되지 않았습니다";
  }finally{
   if(generation===this.playGeneration){this.isSubmitting=false;this.draw();}
  }
 }
 draw(){
  if(!this.mount)return;
  const root=this.mount;root.replaceChildren();root.classList.add("arcade-ranking");
  const header=el("div","arcade-ranking-head");
  header.append(el("strong","",this.game==="volleyball_25"?"🏆 배구 최고 점수 TOP 10":"🏆 정년 생존 점수 TOP 10"),
    el("small","",this.remote?"공식 기록 · 익명":"공식 서버 확인 중"));
  root.append(header);
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
  root.append(filter);
  if(this.notice){const node=el("p","arcade-rank-feedback",this.notice);node.setAttribute("role","status");root.append(node);}
  const labels=el("div","arcade-rank-grid arcade-rank-label");
  ["순위","학교 · 난이도","점수"].forEach(x=>labels.append(el("span","",x)));root.append(labels);
  if(!this.board.length)root.append(el("div","arcade-rank-empty",
    this.remote?"아직 등록된 점수 기록이 없습니다":"기록을 불러올 수 없습니다"));
  else for(const [i,entry] of this.board.entries()){
   const row=el("div","arcade-rank-grid arcade-rank-row"),school=el("div","arcade-rank-person");
   school.append(el("span","arcade-rank-school",entry.school_name),el("span","arcade-rank-level",levelNames[entry.difficulty]||""));
   row.append(el("span","",String(i+1).padStart(2,"0")),school,el("span","",fmt(entry.score)));root.append(row);
  }
  if(this.game==="volleyball_25"){
   const headerTime=el("div","arcade-ranking-head");headerTime.style.marginTop="16px";
   headerTime.append(el("strong","","⏱ 25점 승리 최단시간 TOP 10"),el("small","","25점 승리 경기만 · 빠른 시간순"));
   root.append(headerTime);
   const timeLabels=el("div","arcade-rank-grid arcade-rank-label");
   ["순위","학교 · 난이도","완주 시간"].forEach(x=>timeLabels.append(el("span","",x)));
   root.append(timeLabels);
   if(!this.fastestBoard.length)root.append(el("div","arcade-rank-empty",
     this.remote?"아직 25점 승리 시간 기록이 없습니다":"기록을 불러올 수 없습니다"));
   else for(const [i,entry] of this.fastestBoard.entries()){
    const row=el("div","arcade-rank-grid arcade-rank-row"),school=el("div","arcade-rank-person");
    school.append(el("span","arcade-rank-school",entry.school_name),
      el("span","arcade-rank-level",levelNames[entry.difficulty]||""));
    row.append(el("span","",String(i+1).padStart(2,"0")),school,el("span","",fmtTime(entry.timeTenths)));root.append(row);
   }
  }
 }

}
window.ArcadeLeaderboard=ArcadeLeaderboard;
})();