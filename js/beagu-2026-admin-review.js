/* School-year 2026 private review queue. It never approves publication.
 * This module is mounted only after existing admin Auth + TOTP verification.
 */
(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 let role="",page=0,filter="all",seq=0,ready=false;
 const endpoint=SUPABASE_URL+"/functions/v1/beagu-2026-review-admin";
 const labels={
  TECHNICAL_CHECK_PASSED:"기술 검수 통과",
  NEEDS_QUESTION_CHECK:"문항 검수 필요",
  NEEDS_SCHOOL_CHECK:"학교 매칭 확인",
  PRELAUNCH_EXCLUDED:"사전조사 제외",NOT_CHECKED:"검수 미실행"
 };
 const build=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=String(text);
  return el;
 };
 const notice=txt=>{$("adminReview2026Status").textContent=txt;};
 async function call(data){
  const {data:auth,error}=await supabaseClient.auth.getSession();
  if(error||!auth?.session?.access_token)throw Error("admin_session_missing");
  const res=await fetch(endpoint,{
    method:"POST",cache:"no-store",
    headers:{
      "Authorization":"Bearer "+auth.session.access_token,
      "apikey":SUPABASE_PUBLISHABLE_KEY,
      "Content-Type":"application/json"
    },body:JSON.stringify(data)
  });
  const result=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(result?.error||"review_api_error");
  return result;
 }
 const formatDate=v=>{
  if(!v)return "없음";
  const date=new Date(v);
  if(!Number.isFinite(date.getTime()))return "시간 미확인";
  return date.toLocaleString("ko-KR",{timeZone:"Asia/Seoul",hour12:false});
 };
 function render(data){
  $("adminReview2026Total").textContent=String(data.summary?.total??"—");
  $("adminReview2026Technical").textContent=String(data.summary?.technical??"—");
  $("adminReview2026Approved").textContent=String(data.summary?.approved??"—");
  const root=$("adminReview2026List");root.replaceChildren();
  const rows=Array.isArray(data.items)?data.items:[];
  if(!rows.length)root.append(build("p","empty","이 조건에 해당하는 학교가 없습니다."));
  for(const item of rows){
    const row=build("article","ranking-card");
    const headline=build("div","rank-line");
    headline.append(
      build("strong","rank-school",item.school_name||item.school_id),
      build("span","pill",labels[item.technical_status]||item.technical_status||"검수 없음"),
      build("span","pill",item.approval_status==="APPROVED"?"승인됨":"공개 보류"));
    const detail=build("p","subtle",
      [item.region,item.office,item.school_id].filter(Boolean).join(" · ")+
      " · 관리자 전용 원본 응답행 "+String(item.private_response_rows??"미확인")+
      " · 자료갱신 "+formatDate(item.updated_at));
    row.append(headline,detail);
    const reasons=Array.isArray(item.review_reasons)?item.review_reasons:[];
    if(reasons.length)row.append(build("p","subtle","남은 검수 항목: "+reasons.join(", ")));
    if(item.last_decision)row.append(build("p","subtle","최근 심사 결정: "+item.last_decision));
    if(role==="owner" && item.approval_status!=="WITHHELD" || role==="owner" && item.last_decision!=="WITHHELD"){
      const button=build("button","secondary","보류 사유 기록");
      button.type="button";
      button.addEventListener("click",()=>hold(item,button));
      row.append(button);
    }
    root.append(row);
  }
  $("adminReview2026Prev").disabled=page===0;
  $("adminReview2026Next").disabled=rows.length<20;
  $("adminReview2026Page").textContent="페이지 "+(page+1);
  notice("비공개 검수 목록 · 공개 승인 기능은 동의 근거 검증 전까지 잠금 상태");
 }
 async function hold(item,button){
  if(role!=="owner")return;
  const reason=window.prompt("이 학교의 공개를 보류하는 사유를 12~500자로 기록하세요. 개인정보와 원본 설문 응답은 입력하지 마세요.","동의 증빙 또는 재식별 위험 검토 미완료");
  if(reason===null)return;
  if(reason.trim().length<12||reason.trim().length>500||/[<>]/.test(reason)){
    notice("보류 사유는 12~500자로 입력하며 꺾쇠 기호를 사용할 수 없습니다.");return;
  }
  if(!window.confirm("선택한 학교의 현재 자료를 비공개 보류하고 기존 공개 승인이 있다면 철회하겠습니까?"))return;
  button.disabled=true;
  try{
   const result=await call({action:"hold",school_id:item.school_id,
     payload_sha256:item.payload_sha256,reason:reason.trim()});
   if(!result.ok)throw Error("hold_failed");
   notice("보류 결정을 기록했습니다. 감사 기록이 보존됩니다.");
   await refresh();
  }catch{notice("보류를 기록하지 못했습니다. 자료가 변경되었거나 관리자 권한이 없습니다. 다시 조회하세요.");}
  finally{button.disabled=false;}
 }
 async function refresh(){
  if(!ready)return;
  const id=++seq;notice("비공개 검수 목록을 불러오는 중입니다.");
  try{
   const data=await call({action:"queue",filter,page});
   if(id!==seq)return;
   render(data);
  }catch(error){
   if(id!==seq)return;
   notice("검수 목록을 불러오지 못했습니다. 관리자 계정, MFA 인증, 서버 설정을 확인하세요.");
  }
 }
 function mount(adminRole){
  role=adminRole==="owner"?"owner":"viewer";
  ready=true;page=0;filter="all";
  $("adminReview2026Filter").value=filter;
  void refresh();
 }
 function reset(){
  ready=false;role="";seq++;page=0;
  $("adminReview2026List").replaceChildren();
  $("adminReview2026Total").textContent="—";
  $("adminReview2026Technical").textContent="—";
  $("adminReview2026Approved").textContent="—";
  notice("관리자 인증 후 검수 목록을 불러옵니다.");
 }
 $("adminReview2026Filter").addEventListener("change",event=>{
  filter=event.target.value;page=0;void refresh();
 });
 $("adminReview2026Reload").addEventListener("click",()=>{void refresh();});
 $("adminReview2026Prev").addEventListener("click",()=>{if(page>0){page--;void refresh();}});
 $("adminReview2026Next").addEventListener("click",()=>{page++;void refresh();});
 window.Beagu2026ReviewAdmin={mount,reset};
})();
