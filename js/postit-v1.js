(()=>{
"use strict";
const $=id=>document.getElementById(id);
const api="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-postit-api-v1";
const key="beagu-level-session-v1";
const gameNames={"teacher-volleyball":"선생님배구","teacher-run":"험난한 교직생활","teacher-class-diary-play":"나의 OO한 학급일지"};
const params=new URLSearchParams(location.search);
const validSchool=x=>/^[A-Z0-9]{7}$/.test(x||"");
const validCompare=x=>{
 if(!x||x.length>120)return false;
 const a=x.split(",");
 return a.length>=1&&a.length<=5&&a.every(v=>/^[A-Z0-9]{7}:202[3-6]$/.test(v))&&new Set(a).size===a.length;
};
const state={subject:"",schoolId:"",game:"",compare:"",posts:[],level:0,expanded:new Set(),busy:false,queryTicket:0,listTicket:0,accountLinked:false,accountReadable:false,accountToken:"",postAttempt:null,pendingActions:new Set()};
function token(){try{return sessionStorage.getItem(key)||""}catch{return ""}}
async function headers(){
 return {"Content-Type":"application/json","X-Beagu-Level-Session":token()};
}
async function request(action,data,method="GET"){
 const url=new URL(api);
 if(method==="GET"){url.searchParams.set("action",action);for(const [k,v] of Object.entries(data||{}))if(v!==""&&v!==null)url.searchParams.set(k,String(v))}
 const authHeaders=await headers();
 const res=await fetch(url.toString(),{method,cache:"no-store",headers:authHeaders,
  ...(method==="POST"?{body:JSON.stringify({action,...data})}:{})});
 const json=await res.json().catch(()=>({}));
 if(!res.ok)throw Object.assign(new Error(json.error||"FETCH_FAILED"),{status:res.status});
 return json;
}
function node(tag,cls,text){
 const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=String(text);
 return el;
}
function link(url,label,cls){
 const a=node("a",cls||"",label);a.href=url;return a;
}
function showMessage(error){$("postitMessage").textContent=error||""}
function readableError(e){
 const m={LEVEL_REQUIRED:"Lv.2 인증이 필요합니다. 오른쪽 위 레벨 표시를 확인하세요.",
 COMMENT_READ_LEVEL_REQUIRED:"🔒 포스트잇과 댓글은 Lv.2부터 열람할 수 있습니다.",
 WRITER_IDENTITY_REQUIRED:"🔒 익명 계정 인증 후 작성할 수 있습니다.",
 ORIGINAL_DEVICE_REQUIRED:"챌린지를 처음 진행한 기기에서 인증해 주세요.",
 DEVICE_OWNERSHIP_NOT_VERIFIED:"챌린지 기기 소유 확인에 실패했습니다.",
 POST_RATE_LIMIT:"오늘의 작성 횟수(3개) 또는 작성 간격 제한에 도달했습니다.",
 COMMENT_RATE_LIMIT:"오늘의 댓글 횟수(12개) 또는 작성 간격 제한에 도달했습니다.",
 INVALID_POST:"글을 확인해주세요. 이메일, 전화번호, 링크는 넣지 말아주세요.",
 INVALID_COMMENT:"댓글은 150자 이내이며 이메일·전화번호·링크를 넣을 수 없습니다.",
 POST_UNAVAILABLE:"이 포스트잇은 더 이상 공개되지 않습니다.",
 TARGET_UNAVAILABLE:"이 글은 현재 공개되지 않습니다.",TEMPORARY_ERROR:"서버 연결 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."};
 return m[e.message]||"요청을 완료하지 못했습니다. 다시 시도해주세요.";
}
async function schoolDetails(ids){
 try{
  const j=await request("school_info",{school_ids:[...new Set(ids)].join(",")});
  return j.schools||{};
 }catch{return {}}
}
function setSubject(subject,{schoolId="",game="",compare=""}={}){
 state.subject=subject;state.schoolId=schoolId;state.game=game;state.compare=compare;
 void renderContext();
}
async function renderContext(){
 const box=$("postitContext"),picker=$("postitSubjectPicker");
 if(state.subject==="school"&&validSchool(state.schoolId)){
  const schools=await schoolDetails([state.schoolId]);
  const s=schools[state.schoolId];if(state.subject!=="school"||state.schoolId!==String(s?.school_id||state.schoolId))return;
  box.replaceChildren(node("strong","",s?.name||"선택한 학교"),node("span","", " · "+(s?.region||"학교")+" · 학생 "+(s?.students==null?"자료 없음":Number(s.students).toLocaleString("ko-KR")+"명")+
    " · 백분위 "+(s?.percentile==null?"자료 없음":s.percentile+" ("+s.percentile_year+"년)")));
  picker.hidden=true;
 }else if(state.subject==="game"){
  box.replaceChildren(node("strong","",gameNames[state.game]||"게임"));
  if(validSchool(state.schoolId)){
   const schools=await schoolDetails([state.schoolId]);
   const s=schools[state.schoolId];if(s)box.append(node("span",""," · "+s.name));
  }
  picker.hidden=true;
 }else if(state.subject==="comparison"){
  const items=state.compare.split(",");const schools=await schoolDetails(items.map(x=>x.split(":")[0]));
  box.replaceChildren(node("strong","","학교비교 · "+items.length+"개 항목"));
  const s=items.map(x=>{const [id,year]=x.split(":");return (schools[id]?.name||id)+" ("+year+")";}).join(" · ");
  box.append(node("div","",s));
  const a=link("statistics.html?compare="+encodeURIComponent(state.compare),"비교 결과 보기");a.style.fontSize="12px";box.append(a);
  picker.hidden=true;
 }else{
  box.textContent="학교 태그 없이 자유롭게 이야기를 나눠보세요.";
  picker.hidden=!canWrite();
 }
 updateComposeAccess();
}
function canRead(){return state.level>=2 && state.accountReadable===true && state.accountToken===token()}
function canWrite(){return canRead() && state.accountLinked===true}
function updateComposeAccess(){
 const level=Number($("beaguLevelState")?.dataset.level);
 state.level=Number.isInteger(level)&&level>=0?level:0;
 const allowed=canWrite();
 $("postitAccess").textContent=allowed?"Lv2 · 작성 가능":canRead()?"Lv2 · 읽기 전용":"🔒 Lv2 인증 필요";
 const lockedText=$("postitLocked")?.querySelector("b");
 if(lockedText)lockedText.textContent=canRead()
  ?"글쓰기 준비 중"
  :"Lv2부터 포스트잇을 열람할 수 있습니다";
 $("postitAccount").hidden=state.level<2||canRead();
 $("postitLocked").hidden=allowed;
 $("postitWriteForm").hidden=!allowed||!state.subject;
 $("postitSubjectPicker").hidden=state.subject!=="general"||!allowed;
 $("lockerClearTag").hidden=!allowed||state.subject==="general";
 $("postitBoardContent").hidden=!canRead();
 $("postitBoardLocked").hidden=canRead();
}
function timeSince(value){
 const ms=Date.now()-new Date(value).getTime();
 if(!Number.isFinite(ms)||ms<0)return "방금 전";
 if(ms<60000)return "방금 전";if(ms<3600000)return Math.floor(ms/60000)+"분 전";
 if(ms<86400000)return Math.floor(ms/3600000)+"시간 전";
 return new Date(value).toLocaleDateString("ko-KR");
}
function actionButton(label,cb,opts={}){
 const b=node("button",opts.className||"",label);b.type="button";
 if(opts.disabled)b.disabled=true;if(opts.title)b.title=opts.title;
 b.addEventListener("click",async()=>{
  if(b.disabled||b.dataset.submitting==="1")return;
  b.disabled=true;b.dataset.submitting="1";
  try{await cb()}catch(_){showMessage("작업을 완료하지 못했습니다. 다시 시도해주세요.")}
  finally{delete b.dataset.submitting;if(b.isConnected)b.disabled=Boolean(opts.disabled)}
 });
 return b;
}
function schoolChips(p,host){
 if(!p.school)return;
 const s=p.school;
 if(s.region)host.append(node("span","paper-chip",s.region));
 if(s.students!==null&&s.students!==undefined)host.append(node("span","paper-chip","학생 "+Number(s.students).toLocaleString("ko-KR")+"명"));
 else host.append(node("span","paper-chip","학생수 미확인"));
 host.append(node("span","paper-chip",s.percentile==null?"백분위 자료 없음":"백분위 "+s.percentile+" · "+s.percentile_year+"년"));
}
function buildPost(post){
 const entry=node("article","postit-entry");
 entry.dataset.postId=post.id;
 const paper=node("div","postit-paper");
 const top=node("div","paper-overline");
 top.append(node("span","","라커룸 · 익명"),node("span","",timeSince(post.created_at)));
 paper.append(top);
 const topic=node("div","paper-topic");
 if(post.subject_type==="school"&&post.school){
  topic.append(link("school-report.html?school_id="+encodeURIComponent(post.school.school_id),post.school.name));
  // School tag only; existing detailed school data remains in its own page.
 }else if(post.subject_type==="game"&&post.game){
  const suffix=post.game.slug==="teacher-class-diary-play"&&post.school?"?schoolId="+encodeURIComponent(post.school.school_id):"";
  topic.append(link(post.game.slug+".html"+suffix,post.game.name));
  if(post.school)topic.append(link("school-report.html?school_id="+encodeURIComponent(post.school.school_id),post.school.name,"paper-chip"));
 }else if(post.subject_type==="comparison"&&post.comparison){
  const comp=post.comparison;
  topic.append(link("statistics.html?compare="+encodeURIComponent(comp.selection),"학교비교 결과"));
  topic.append(node("span","paper-chip",comp.schools.length+"개 항목"));
  for(const s of comp.schools.slice(0,3))topic.append(node("span","paper-chip",s));
 }else if(post.subject_type!=="general")topic.append(node("b","","연결된 주제"));
 if(post.comment_match)topic.append(node("span","paper-chip","댓글에서 검색됨"));
 paper.append(topic,node("p","paper-content",post.body));
 const actions=node("div","paper-actions");
 const blocked=!canWrite();
 const like=actionButton((post.liked?"♥":"♡")+" "+post.likes,async()=>{
  await mutation("set_like",{target_type:"post",target_id:post.id,liked:!post.liked});
 },{className:post.liked?"active":"",disabled:blocked,title:blocked?"Lv.2부터 공감할 수 있습니다":"나이스! (공감)"});
 const canReadComments=canRead();
 const comment=actionButton(canReadComments?"▤ 댓글 "+post.comments:"🔒 Lv.2 댓글",async()=>{
  if(!canRead())return;
  if(state.expanded.has(post.id))state.expanded.delete(post.id);else state.expanded.add(post.id);
  await toggleComments(post.id,entry);
 },{disabled:!canReadComments,title:canReadComments?"댓글 열람":"🔒 Lv.2부터 댓글을 열람할 수 있습니다"});
 const report=actionButton("⚑ 신고",async()=>{
  if(!confirm("이 포스트잇을 신고하시겠습니까?"))return;
  await mutation("report",{target_type:"post",target_id:post.id});
 },{disabled:blocked||post.reported,title:post.reported?"이미 신고했습니다":blocked?"Lv.2부터 신고할 수 있습니다":"신고"});
 actions.append(like,comment,report);
 if(post.mine)actions.append(actionButton("내 글 삭제",async()=>{
  if(!confirm("작성한 포스트잇을 삭제하시겠습니까?"))return;
  await mutation("remove",{target_type:"post",target_id:post.id});
 },{className:"paper-remove"}));
 paper.append(actions);
 const tape=node("span","paper-tape");tape.setAttribute("aria-hidden","true");
 entry.append(tape,paper);
 const comments=node("div","postit-comments");comments.id="comments-"+post.id;
 if(!state.expanded.has(post.id))comments.hidden=true;
 entry.append(comments);
 if(state.expanded.has(post.id))void fillComments(post.id,comments);
 return entry;
}
async function mutation(action,data){
 if(!canWrite()){showMessage("🔒 Lv.2 익명 계정 연결 후 이용할 수 있습니다.");return;}
 const actionKey=action+":"+String(data.target_type||"")+":"+String(data.target_id||"");
 if(state.pendingActions.has(actionKey))return;
 state.pendingActions.add(actionKey);
 try{
  await request(action,data,"POST");
  showMessage("");
  await loadPosts();
 }catch(e){showMessage(readableError(e))}
 finally{state.pendingActions.delete(actionKey)}
}
async function fillComments(id,host){
 if(!canRead()){host.replaceChildren();host.hidden=true;return;}
 host.replaceChildren(node("div","bookmark-comment","댓글을 불러오는 중…"));
 try{
  const {comments}=await request("comments",{post_id:id});
  if(!host.isConnected||!canRead()){host.replaceChildren();host.hidden=true;return;}
  host.replaceChildren();
  if(!comments.length)host.append(node("div","bookmark-comment","첫 댓글을 남겨보세요."));
  for(const c of comments){
   const mark=node("div","bookmark-comment"),meta=node("div","comment-meta","익명 · "+timeSince(c.created_at));
   mark.append(meta,node("p","",c.body));
   const row=node("div","");
   row.append(actionButton((c.liked?"♥":"♡")+" "+c.likes,()=>mutation("set_like",{target_type:"comment",target_id:c.id,liked:!c.liked}),{disabled:!canWrite()}));
   row.append(actionButton("⚑ 신고",async()=>{if(confirm("댓글을 신고하시겠습니까?"))await mutation("report",{target_type:"comment",target_id:c.id})},{disabled:!canWrite()||c.reported}));
   if(c.mine)row.append(actionButton("삭제",async()=>{if(confirm("이 댓글을 삭제할까요?"))await mutation("remove",{target_type:"comment",target_id:c.id})}));
   mark.append(row);host.append(mark);
  }
  const composer=node("form","bookmark-composer");
  if(!canWrite())composer.append(node("span","locked-comment","🔒 Lv.2 익명 계정 생성 후 댓글을 작성할 수 있습니다."));
  else{
   const ta=node("textarea","");ta.maxLength=150;ta.rows=2;ta.placeholder="책갈피처럼 댓글 남기기 (150자)";
   const btn=node("button","","댓글 붙이기");btn.type="submit";
   composer.append(ta,btn);
   let attempt=null;
   composer.addEventListener("submit",async e=>{
    e.preventDefault();
    if(btn.disabled||!canWrite())return;
    const text=ta.value.trim();if(!text)return;
    if(!attempt||attempt.text!==text)attempt={text,requestId:crypto.randomUUID()};
    btn.disabled=true;
    try{
     await request("create_comment",{post_id:id,text,request_id:attempt.requestId},"POST");
     attempt=null;ta.value="";showMessage("");
     // Recreate only from the server-approved result, keeping this thread open.
     state.expanded.add(id);
     await loadPosts();
    }catch(e){showMessage(readableError(e));btn.disabled=false}
   });
  }host.append(composer);
 }catch(e){host.replaceChildren(node("div","bookmark-comment",readableError(e)))}
}
async function toggleComments(id,entry){
 const host=entry.querySelector("#comments-"+id);if(!host)return;
 host.hidden=!state.expanded.has(id);if(!host.hidden)await fillComments(id,host);
}
async function loadPosts(newId=""){
 const host=$("postitThread"),ticket=++state.listTicket;
 if(!canRead()){
  state.posts=[];host.replaceChildren();
  $("postitListStatus").textContent="Lv.2 전용";
  return;
 }
 const term=$("postitSearch").value.trim();
 if(term && [...term].length<2){
  host.replaceChildren();
  $("postitListStatus").textContent="검색어를 두 글자 이상 입력하세요.";
  return;
 }
 const previous=new Map();
 for(const el of host.querySelectorAll(".postit-entry")){
  previous.set(el.dataset.postId,el.getBoundingClientRect().top);
 }
 const query={sort:$("postitSort").value};
 if(term)query.q=term;
 if(state.subject==="school"&&state.schoolId)query.school_id=state.schoolId;
 if(state.subject==="game"&&state.game)query.game_slug=state.game;
 $("postitListStatus").textContent="불러오는 중…";
 try{
  const {posts}=await request("posts",query);
  if(ticket!==state.listTicket||!canRead())return;
  state.posts=posts;
  const fragment=document.createDocumentFragment();
  if(!posts.length)fragment.append(node("div","postit-empty",term?"검색 결과가 없습니다. 다른 검색어를 입력해 보세요.":"아직 붙은 포스트잇이 없습니다. 첫 이야기를 남겨주세요."));
  for(const p of posts){
   const el=buildPost(p);if(p.id===newId)el.classList.add("is-new");
   fragment.append(el);
  }host.replaceChildren(fragment);
  if(newId){
   host.classList.remove("is-stretching");
   void host.offsetHeight;host.classList.add("is-stretching");
   setTimeout(()=>host.classList.remove("is-stretching"),800);
  }
  if(!matchMedia("(prefers-reduced-motion: reduce)").matches){
   for(const el of host.querySelectorAll(".postit-entry")){
    const old=previous.get(el.dataset.postId);
    if(old===undefined||el.dataset.postId===newId)continue;
    const delta=old-el.getBoundingClientRect().top;
    if(Math.abs(delta)>3)el.animate([{transform:"translateY("+delta+"px)"},{transform:"translateY(0)"}],{duration:710,easing:"cubic-bezier(.22,.85,.24,1)"});
   }
  }
  $("postitListStatus").textContent=(term?"검색 결과 ":"")+posts.length+"장";
 }catch(e){
  if(ticket!==state.listTicket||!canRead())return;
  $("postitListStatus").textContent="불러오기 실패";
  host.replaceChildren(node("div","postit-empty","목록을 불러올 수 없습니다. 다시 시도해주세요."));
 }
}
function handleLevel(e){
 const level=e?.detail?.level;
 if(level!==2||state.accountToken!==token()){state.accountLinked=false;state.accountReadable=false;state.accountToken="";state.pendingActions.clear();}
 if(Number.isInteger(level))$("beaguLevelState").dataset.level=String(level);
 updateComposeAccess();
 if(!canRead()){
  state.expanded.clear();
  // Previously retrieved comments and posts must not remain visible on downgrade.
  for(const host of $("postitThread").querySelectorAll(".postit-comments")){
   host.replaceChildren();host.hidden=true;
  }
 }
 void loadPosts();
}
async function findSchools(){
 const q=$("postitSchoolSearch").value.trim();const list=$("postitSchoolResults");
 if(!canRead()){state.queryTicket++;list.replaceChildren();return;}
 if(q.length<2){list.replaceChildren();return}
 const ticket=++state.queryTicket;
 try{
  const {schools}=await request("schools",{q});if(ticket!==state.queryTicket||!canRead())return;
  list.replaceChildren();
  for(const s of schools){
   const b=node("button","",""+s.name+" · "+s.region);b.type="button";b.setAttribute("role","option");
   b.addEventListener("click",()=>{setSubject("school",{schoolId:s.school_id});list.replaceChildren();void loadPosts()});
   list.append(b);
  }
 }catch{list.replaceChildren();}
}
const schoolId=params.get("school_id")||"";
const game=params.get("game")||"";
const compare=params.get("compare")||"";
if(validCompare(compare))setSubject("comparison",{compare});
else if(gameNames[game])setSubject("game",{game,schoolId:validSchool(schoolId)?schoolId:""});
else if(validSchool(schoolId))setSubject("school",{schoolId});
else setSubject("general");
window.addEventListener("beagu:level-state-updated",handleLevel);
window.addEventListener("beagu:postit-account-status",event=>{
 state.accountLinked=event?.detail?.linked===true;
 state.accountReadable=event?.detail?.readable===true;
 state.accountToken=event?.detail?.token||"";
 if(!canRead()){state.expanded.clear();state.pendingActions.clear();state.queryTicket++;$("postitSchoolResults").replaceChildren();}
 updateComposeAccess();
 void loadPosts();
});
$("postitSort").addEventListener("change",()=>void loadPosts());
$("postitReload").addEventListener("click",()=>void loadPosts());
$("lockerClearTag").addEventListener("click",()=>{state.queryTicket++;$("postitSchoolSearch").value="";$("postitSchoolResults").replaceChildren();setSubject("general");void loadPosts();});
$("postitSchoolSearch").addEventListener("input",()=>{void findSchools()});
let searchDebounce;
$("postitSearchForm").addEventListener("submit",e=>{
 e.preventDefault();clearTimeout(searchDebounce);void loadPosts();
});
$("postitSearch").addEventListener("input",()=>{
 clearTimeout(searchDebounce);
 searchDebounce=setTimeout(()=>void loadPosts(),320);
});
$("postitBody").addEventListener("input",()=>{const chars=[...$("postitBody").value];if(chars.length>300)$("postitBody").value=chars.slice(0,300).join("");$("postitCounter").textContent=Math.min(chars.length,300)+" / 300"});
$("postitSubmit").addEventListener("click",async()=>{
 if(state.busy||!state.subject||!canWrite())return;
 const text=$("postitBody").value.trim();if(!text||[...text].length>300)return;
 const btn=$("postitSubmit");btn.disabled=true;state.busy=true;
 try{
  const payload={subject_type:state.subject,text,
    ...(state.schoolId?{school_id:state.schoolId}:{}),
    ...(state.game?{game_slug:state.game}:{}),
    ...(state.compare?{comparison_selection:state.compare}:{})};
  const signature=JSON.stringify(payload);
  if(!state.postAttempt||state.postAttempt.signature!==signature)
   state.postAttempt={signature,requestId:crypto.randomUUID()};
  const {id}=await request("create_post",{...payload,request_id:state.postAttempt.requestId},"POST");
  state.postAttempt=null;
  $("postitBody").value="";$("postitCounter").textContent="0 / 300";showMessage("게시했습니다.");
  await loadPosts(id);
 }catch(e){showMessage(readableError(e))}
 finally{btn.disabled=false;state.busy=false}
});

// Downward scroll gives the attached papers a brief, wind-like flutter.
// Animate paper layers only: the thread's layout and FLIP positions stay fixed.
const breezePreference=window.matchMedia("(prefers-reduced-motion: reduce)");
let previousScrollY=window.scrollY;
let breezeFrame=0;
function flutterOnScroll(){
 breezeFrame=0;
 if(breezePreference.matches)return;
 const thread=$("postitThread");
 const viewportHeight=window.innerHeight;
 let found=false;
 for(const entry of thread.querySelectorAll(".postit-entry")){
  if(entry.classList.contains("is-new")||entry.classList.contains("is-windward"))continue;
  const bounds=entry.getBoundingClientRect();
  if(bounds.bottom<=36||bounds.top>=viewportHeight-24)continue;
  entry.classList.add("is-windward");
  found=true;
 }
 if(found&&!thread.classList.contains("has-breeze"))thread.classList.add("has-breeze");
}
window.addEventListener("scroll",()=>{
 const now=window.scrollY;
 const movedDown=now-previousScrollY>3;
 previousScrollY=now;
 if(movedDown&&!breezePreference.matches&&!breezeFrame)
  breezeFrame=window.requestAnimationFrame(flutterOnScroll);
},{passive:true});
$("postitThread").addEventListener("animationend",event=>{
 if(event.animationName==="postit-string-breeze"){
  $("postitThread").classList.remove("has-breeze");
 }
 if(!event.target.classList?.contains("postit-paper"))return;
 const entry=event.target.closest(".postit-entry");
 if(event.animationName==="postit-breeze-flutter")entry?.classList.remove("is-windward");
 if(event.animationName==="paper-attach")entry?.classList.remove("is-new");
});

updateComposeAccess();void loadPosts();
})();