/* Public, anonymized, highest-score TOP100 archive; 30 rows per page. */
(function(){
 "use strict";
 const API="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard";
 const GAMES={volleyball_25:"🏐 선생님배구 역대 기록",teacher_run_retirement:"🎒 험난한 교직생활 역대 기록"};
 const DIFFICULTIES={easy:"EASY",normal:"NORMAL",hard:"HARD",very_hard:"VERY HARD",extreme:"EXTREME"};
 const params=new URLSearchParams(window.location.search);
 const game=Object.prototype.hasOwnProperty.call(GAMES,params.get("game"))?params.get("game"):"volleyball_25";
 let difficulty=Object.prototype.hasOwnProperty.call(DIFFICULTIES,params.get("difficulty"))?params.get("difficulty"):"";
 let page=1,hasMore=false,requestId=0,archive=false;
 const $=id=>document.getElementById(id);
 const list=$("recordList"),selector=$("difficulty"),prev=$("older"),next=$("newer");
 $("historyTitle").textContent=GAMES[game];
 document.title=GAMES[game]+" | 배구지수";
 (game==="volleyball_25"?$("tabVolley"):$("tabRun")).setAttribute("aria-current","page");
 selector.value=difficulty;
 const number=n=>Number.isFinite(Number(n))?Math.max(0,Math.floor(Number(n))).toLocaleString("ko-KR"):"—";
 const time=t=>{
  const v=Math.max(0,Math.floor(Number(t)||0));
  return Math.floor(v/600)+":"+String(Math.floor(v%600/10)).padStart(2,"0")+"."+(v%10);
 };
 const date=value=>{
  const stamp=new Date(value);
  return Number.isNaN(stamp.getTime())?"날짜 미확인":
   new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"2-digit",day:"2-digit",
     hour:"2-digit",minute:"2-digit",timeZone:"Asia/Seoul"}).format(stamp);
 };
 function el(tag,cls,content){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(content!==undefined)node.textContent=String(content);
  return node;
 }
 function statistic(root,label,value){
  if(value===null||value===undefined||value==="")return;
  const item=el("div","history-stat");
  item.append(el("span","",label),el("strong","",value));
  root.append(item);
 }
 function titleFor(row){
  const result=row.details||{};
  if(game==="volleyball_25"){
   if(result.outcome==="victory")return [result.matchRule==="deuce_v1"&&result.cpuPoints>=24?"듀스 승리":"경기 승리","win"];
   if(result.outcome==="defeat")return ["경기 패배","loss"];
   if(result.outcome==="stopped")return ["중도 종료","neutral"];
  }else{
   if(result.outcome==="retired")return ["62세 정년 달성","win"];
   if(result.outcome==="retired_early")return ["정년 도전 종료","loss"];
  }
  return ["결과 미확인","neutral"];
 }
 function schoolHeading(row){
  const title=el("h2","history-school");
  const id=row.schoolId;
  const name=row.schoolName||"학교 미등록";
  if(typeof id==="string"&&/^[A-Z0-9]{7}$/.test(id)){
   const link=el("a","history-school-link",name);
   link.href="school-link.html?school_id="+encodeURIComponent(id);
   link.setAttribute("aria-label",name+" 학교 상세조회");
   title.append(link);
  }else title.textContent=name;
  return title;
 }
 function renderRecord(row,rank){
  const result=row.details&&typeof row.details==="object"?row.details:{};
  const card=el("article","history-record");
  const head=el("div","history-record-head"),about=el("div"),score=el("div","history-score",number(row.score)+"점");
  about.append(el("span","history-status","공개 점수 기록 "+rank+"위"),schoolHeading(row),
    el("div","history-meta",date(row.createdAt)+" · "+(DIFFICULTIES[row.difficulty]||"난이도 미확인")+(game==="teacher_run_retirement"?" · v"+(row.version||"3.0"):"")));
  const [label,kind]=titleFor(row);
  const visibleScore=game==="volleyball_25"&&["victory","defeat","stopped"].includes(result.outcome)&&Number.isSafeInteger(result.playerPoints)&&result.playerPoints>=0&&Number.isSafeInteger(result.cpuPoints)&&result.cpuPoints>=0?" "+result.playerPoints+":"+result.cpuPoints:"";
  about.append(el("span","history-status "+kind,label+visibleScore));
  head.append(about,score);card.append(head);
  const details=el("details"),summary=el("summary","","경기 상세 보기"),stats=el("div","history-details");
  if(game==="volleyball_25"){
   statistic(stats,"나 : 컴퓨터",result.playerPoints===undefined?null:result.playerPoints+" : "+result.cpuPoints);
   statistic(stats,"기본 득점",result.baseScore===undefined?null:number(result.baseScore)+"점");
   statistic(stats,"플레이 보너스",result.playBonus===undefined?null:"+"+number(result.playBonus)+"점");
   statistic(stats,"승리 배수",result.winMultiplier===undefined?null:"×"+number(result.winMultiplier));
   if(result.bonusRule==="fire_court_v1"&&Number.isSafeInteger(result.matchBonus)&&result.matchBonus>0)statistic(stats,"명경기 보너스","+"+number(result.matchBonus)+"점");
   statistic(stats,"플레이 시간",result.playedTenths===undefined?null:time(result.playedTenths));
   statistic(stats,"경기 승리 시간",row.winTimeTenths===null||row.winTimeTenths===undefined?null:time(row.winTimeTenths));
  }else{
   statistic(stats,"종료 나이",result.endAge===undefined?null:number(result.endAge)+"세");
   statistic(stats,"버틴 시간",result.playedSeconds===undefined?null:number(result.playedSeconds)+"초");
   statistic(stats,"기본 점수",result.baseScore===undefined?null:number(result.baseScore)+"점");
   statistic(stats,"정년 달성 보너스",result.retirementBonus===undefined?null:"+"+number(result.retirementBonus)+"점");
   statistic(stats,"아슬아슬 회피",result.nearMisses===undefined?null:number(result.nearMisses)+"회");
   statistic(stats,"장애물 피격",result.hits===undefined?null:number(result.hits)+"회");
   statistic(stats,"남은 목숨",result.livesLeft===undefined?null:number(result.livesLeft)+"개");
   statistic(stats,"잔여 체력",result.healthPercent===undefined?null:number(result.healthPercent)+"%");
  }
  details.append(summary);
  if(stats.childElementCount)details.append(stats);
  else details.append(el("p","history-note","이전 게임 버전에서 저장된 기록으로, 세부 항목이 없습니다."));
  card.append(details);
  return card;
 }
 function syncUrl(){
  const nextUrl=new URL(window.location.href);
  nextUrl.searchParams.set("game",game);
  if(difficulty)nextUrl.searchParams.set("difficulty",difficulty);
  else nextUrl.searchParams.delete("difficulty");
  if(page>1)nextUrl.searchParams.set("page",String(page));
  else nextUrl.searchParams.delete("page");
  window.history.replaceState(null,"",nextUrl);
 }
 async function load(){
  const token=++requestId;
  syncUrl();
  $("pageInfo").textContent=page+" 페이지";
  prev.disabled=true;next.disabled=true;
  list.replaceChildren(el("div","history-empty","상위 100개 기록을 불러오는 중…"));
  try{
   const query=new URLSearchParams({game,history:"1",page:String(page)});
   if(difficulty)query.set("difficulty",difficulty);
   const response=await fetch(API+"?"+query.toString(),{cache:"no-store",headers:{"Accept":"application/json"}});
   if(!response.ok)throw new Error("HTTP "+response.status);
   const data=await response.json();
   if(token!==requestId)return;
   if(!Array.isArray(data.records)||typeof data.hasMore!=="boolean")throw new Error("invalid_history");
   hasMore=data.hasMore;archive=data.archive===true;
   $("historyScope").textContent=archive?"보존 경기 · 점수순 · 30개씩":"기존 상위 100위 · 30개씩";
   list.replaceChildren();
   if(!data.records.length)list.append(el("div","history-empty",
    page===1?(archive?"아직 보존된 경기 기록이 없습니다.":"아직 상위 100위 기록이 없습니다."):"이 페이지에는 기록이 없습니다."));
   else for(const [i,row] of data.records.entries())list.append(renderRecord(row,(page-1)*30+i+1));
   prev.disabled=page<=1;next.disabled=!hasMore||page>=(archive?10000:4);
  }catch(err){
   if(token!==requestId)return;
   list.replaceChildren(el("div","history-empty","기록을 불러오지 못했습니다. 네트워크를 확인하고 새로고침해 주세요."));
   prev.disabled=page<=1;next.disabled=true;
  }
 }
 selector.addEventListener("change",()=>{difficulty=selector.value;page=1;load();});
 prev.addEventListener("click",()=>{if(page<=1)return;page--;load();window.scrollTo({top:0,behavior:"smooth"});});
 next.addEventListener("click",()=>{if(!hasMore||page>=(archive?10000:4))return;page++;load();window.scrollTo({top:0,behavior:"smooth"});});
 const requestedPage=Number(params.get("page"));
 if(Number.isSafeInteger(requestedPage)&&requestedPage>=1&&requestedPage<=10000)page=requestedPage;
 async function schoolRank(){
  const host=$("schoolRankList");try{
   const res=await fetch(API+"?game="+encodeURIComponent(game)+"&school_rank=1",{cache:"no-store"});
   if(!res.ok)throw Error("unavailable");const data=await res.json();
   if(!Array.isArray(data.schoolTop10))throw Error("invalid");host.replaceChildren();
   for(const [i,r] of data.schoolTop10.entries()){
    const line=el("div","history-school-rank");line.append(el("strong","",String(i+1)+". "+(r.school_name||"학교 미등록")),el("span","",number(r.points)+" P"));
    if(game==="volleyball_25"){const w=Number(r.wins)||0,l=Number(r.losses)||0;line.append(el("small","",w+"승 "+l+"패 · "+(w+l?(w/(w+l)*100).toFixed(1)+"%":"승률 —")+" · 중도 "+number(r.stopped)+" · 미확인 "+number(r.unknown)));}
    host.append(line);
   }if(!data.schoolTop10.length)host.textContent="보존된 학교 기록이 없습니다.";
  }catch(_){host.textContent="학교별 누적 랭킹은 기록 보존 기능 활성화 후 제공됩니다.";}
 }
 $("schoolRankPanel").addEventListener("toggle",()=>{if($("schoolRankPanel").open)void schoolRank();});
 load();
})();
