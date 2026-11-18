/* Shared arcade Top 10. Scores are public nicknames only; never requests a real name. */
(function(){
"use strict";
const API="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard";
const fmt=n=>String(Math.max(0,Math.floor(Number(n)||0))).padStart(7,"0");
const idFor=game=>"arcade-local-top10-v1-"+game;
const cleanName=s=>String(s||"").toUpperCase().replace(/[^A-Z]/g,"").slice(0,8);
const games=new Set(["volleyball","teacher_run"]);
function el(tag,cls,text){
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(text!==undefined)e.textContent=String(text);
 return e;
}
function order(rows){
 return rows.filter(x=>x&&/^[A-Z]{2,8}$/.test(x.nickname)&&Number.isSafeInteger(x.score)&&x.score>0)
 .sort((a,b)=>b.score-a.score || String(a.created_at||"").localeCompare(String(b.created_at||"")))
 .slice(0,10);
}
class ArcadeLeaderboard{
 constructor(game,mount){
  if(!games.has(game))throw new Error("invalid leaderboard game");
  this.game=game;this.mount=typeof mount==="string"?document.querySelector(mount):mount;
  this.board=[];this.remote=false;this.session=null;this.pendingStart=null;this.pendingLoad=null;this.score=0;this.stats=null;this.school=null;this.playGeneration=0;
  this.dialog=null;this.isSubmitting=false;
  if(this.mount){this.draw();this.load();}
 }
 getLocal(){
  try{const parsed=JSON.parse(localStorage.getItem(idFor(this.game))||"[]");return order(Array.isArray(parsed)?parsed:[]);}catch{return [];}
 }
 setLocal(rows){
  try{localStorage.setItem(idFor(this.game),JSON.stringify(order(rows)));}catch(e){}
 }
 async request(method,body=null){
  const options={method,cache:"no-store",headers:{"Content-Type":"application/json"}};
  if(body)options.body=JSON.stringify(body);
  const url=API+(method==="GET"?"?game="+encodeURIComponent(this.game):"");
  const r=await fetch(url,options);
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const error=new Error(data.error||"api_error");error.status=r.status;throw error;}
  return data;
 }
 async load(){
  if(!this.mount)return [];
  if(this.pendingLoad)return this.pendingLoad;
  this.pendingLoad=(async()=>{
   try{
    const data=await this.request("GET");
    if(!Array.isArray(data.top10))throw new Error("invalid_response");
    this.remote=true;this.board=order(data.top10);
   }catch(err){
    this.remote=false;this.board=this.getLocal();
   }
   this.draw();return this.board;
  })();
  try{return await this.pendingLoad;}finally{this.pendingLoad=null;}
 }
 start(school){
  this.session=null;this.pendingStart=null;this.lastStartError=null;
  if(!school||!school.eligible||!school.school_id||!school.school_name){
   this.lastStartError="school_ineligible";return Promise.resolve(null);
  }
  this.school={school_id:String(school.school_id),school_name:String(school.school_name),difficulty:school.difficulty};
  const generation=++this.playGeneration;
  if(this.dialog && this.dialog.open)this.dialog.close();
  this.pendingStart=(async()=>{
   try{
    const data=await this.request("POST",{action:"start",game:this.game,school_id:this.school.school_id});
    if(generation!==this.playGeneration)return null;
    if(data.school?.eligible!==true || typeof data.session!=="string")throw new Error("school_ineligible");
    this.session=data.session;
    return this.session;
   }catch(error){
    if(generation===this.playGeneration){
     this.session=null;
     this.lastStartError=String(error?.message||"network_unavailable");
    }
    return null;
   }
  })();
  return this.pendingStart;
 }
 cancel(){
  // Abandoned matches cannot submit or open a stale record prompt.
  this.playGeneration++;this.session=null;this.pendingStart=null;
  this.school=null;this.score=0;this.stats=null;this.closeDialog();
 }
 async finish(score,stats){
  const generation=this.playGeneration;
  if(!this.session)return;
  this.score=Math.floor(Number(score)||0);this.stats=stats;
  if(this.score<=0)return;
  try{if(this.pendingStart)await this.pendingStart;}catch(e){}
  if(generation!==this.playGeneration||!this.session)return;
  await this.load();
  if(generation!==this.playGeneration||!this.session)return;
  if(this.board.length===10&&this.score<=this.board[9].score)return;
  this.openRecord();
 }
 dialogElement(){
  if(this.dialog)return this.dialog;
  const d=el("dialog","arcade-dialog");
  d.setAttribute("aria-label","TOP 10 기록 입력");
  const wrap=el("div","arcade-dialog-inner");
  const heading=el("h2","","NEW RECORD!");
  const score=el("div","final-score");
  const form=el("form");form.method="dialog";form.noValidate=true;
  const label=el("label","","ENTER YOUR NAME");
  const input=el("input");
  input.type="text";input.maxLength=8;input.minLength=2;input.pattern="[A-Za-z]{2,8}";
  input.autocomplete="off";input.spellcheck=false;input.setAttribute("autocapitalize","characters");
  input.setAttribute("inputmode","latin");input.setAttribute("aria-label","영문 닉네임 2~8글자");
  const msg=el("div","error");msg.setAttribute("aria-live","polite");
  const actions=el("div","record-actions");
  const save=el("button","","SAVE");save.type="submit";
  const skip=el("button","alt","SKIP");skip.type="button";
  actions.append(save,skip);form.append(label,input,msg,actions);wrap.append(heading,score,form);d.append(wrap);
  document.body.append(d);
  input.addEventListener("input",()=>{const at=input.selectionStart;input.value=cleanName(input.value);try{input.setSelectionRange(Math.min(at,input.value.length),Math.min(at,input.value.length));}catch(e){}msg.textContent="";});
  form.addEventListener("submit",e=>{e.preventDefault();this.submitName(cleanName(input.value),save,msg);});
  skip.addEventListener("click",()=>this.closeDialog());
  d.addEventListener("cancel",()=>this.closeDialog());
  this.dialog=d;this.nameInput=input;this.dialogScore=score;this.dialogMessage=msg;this.dialogSave=save;
  return d;
 }
 openRecord(){
  const dialog=this.dialogElement();
  this.dialogScore.textContent=fmt(this.score)+" · "+(this.school?.school_name||"학교 미등록");
  this.dialogMessage.textContent="";
  try{this.nameInput.value=cleanName(localStorage.getItem("arcade-last-name-v1")||"");}catch(e){this.nameInput.value="";}
  if(!dialog.open){if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");}
  this.nameInput.focus();
 }
 closeDialog(){
  if(!this.dialog)return;
  if(typeof this.dialog.close==="function" && this.dialog.open)this.dialog.close();
  else this.dialog.removeAttribute("open");
 }
 async submitName(name,button,msg){
  if(this.isSubmitting)return;
  if(!/^[A-Z]{2,8}$/.test(name)){msg.textContent="영문 2~8글자를 입력하세요";this.nameInput.focus();return;}
  this.isSubmitting=true;button.disabled=true;msg.textContent="SAVING...";
  try{
   let saved=false;
   if(this.session){
    try{
     const data=await this.request("POST",{action:"submit",game:this.game,session:this.session,nickname:name,stats:this.stats});
     this.remote=true;this.board=order(data.top10||[]);
     this.session=null;saved=true;
     if(!data.ranked)msg.textContent="TOP 10 밖으로 밀렸습니다";
    }catch(err){
     if(err.status){msg.textContent=err.status===429?"잠시 후 다시 시도해 주세요":"서버 확인 실패 · 다시 시도";return;}
     // Network unavailable: explicitly label personal-device records instead.
    }
   }
   if(!saved){
    this.remote=false;this.board=order([...this.getLocal(),{nickname:name,score:this.score,school_name:this.school?.school_name||null,difficulty:this.school?.difficulty||null,created_at:new Date().toISOString()}]);this.setLocal(this.board);
   }
   try{localStorage.setItem("arcade-last-name-v1",name);}catch(e){}
   this.draw();this.closeDialog();
  }finally{this.isSubmitting=false;button.disabled=false;}
 }
 draw(){
  if(!this.mount)return;
  const container=this.mount;container.replaceChildren();container.classList.add("arcade-ranking");
  const head=el("div","arcade-ranking-head"),heading=el("strong","","🏆 TOP 10");
  const status=el("small","",this.remote?"WORLD RECORDS":"OFFLINE · 이 기기");
  head.append(heading,status);container.append(head);
  const labels=el("div","arcade-rank-grid arcade-rank-label");
  ["RANK","NAME · 학교","SCORE"].forEach(x=>labels.append(el("span","",x)));container.append(labels);
  if(!this.board.length){container.append(el("div","arcade-rank-empty","NO RECORDS"));return;}
  this.board.slice(0,10).forEach((entry,i)=>{
   const row=el("div","arcade-rank-grid arcade-rank-row");
   const person=el("div","arcade-rank-person");
   person.append(el("span","arcade-rank-nick",entry.nickname),el("span","arcade-rank-school",entry.school_name||"학교 미등록"));
   row.append(el("span","",String(i+1).padStart(2,"0")),person,el("span","",fmt(entry.score)));
   container.append(row);
  });
 }
}
window.ArcadeLeaderboard=ArcadeLeaderboard;
})();