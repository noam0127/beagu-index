/* Aggregate member administration and content-based report review; no member directory. */
(()=>{"use strict";
 const $=id=>document.getElementById(id),api=SUPABASE_URL+"/functions/v1/beagu-admin-members-v1";
 let role="",serial=0,bound=false,pending=false;
 const ids=["adminMembersTotal","adminMembersLv2","adminMembersSuspended"];
 const node=(tag,value)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=String(value);return el;};
 function clear(){for(const id of ids)$(id).textContent="—";$("adminReportRows").replaceChildren();}
 async function request(action,fields={}){
  const {data,error}=await supabaseClient.auth.getSession();
  if(error||!data?.session?.access_token)throw Error("session_required");
  const res=await fetch(api,{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY,"Authorization":"Bearer "+data.session.access_token},body:JSON.stringify({action,...fields})});
  const result=await res.json();if(!res.ok||!result.ok)throw Error("request_failed");return result.data;
 }
 function renderReports(rows){
  const root=$("adminReportRows");root.replaceChildren();
  for(const item of rows){
   const box=node("section");box.className="ranking-card";
   box.append(node("strong",(item.target_type==="comment"?"댓글":"포스트잇")+" · 신고 "+item.reports+"건 · "+(item.status==="hidden"?"숨김":item.status==="removed"?"삭제됨":"공개")));
   box.append(node("p",item.body||"(내용 없음)"));
   if(item.expires_at){box.append(node("p","작성 제한 종료: "+new Date(item.expires_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})));}
   if(role==="owner"){
    const reason=node("textarea");reason.placeholder="검토 사유 8~200자 (개인정보 입력 금지)";reason.maxLength=200;reason.rows=2;reason.setAttribute("aria-label","검토 사유");box.append(reason);
    const actions=item.case_id?[["restore","제한 해제"]]:[["dismiss","기각"],["restrict_24h","24시간 작성 제한"],["restrict_7d","7일 작성 제한"]];
    for(const [decision,label] of actions){
     const b=node("button",label);b.type="button";b.className="secondary";
     b.addEventListener("click",async()=>{
      if(pending||role!=="owner")return;const value=reason.value.trim();
      if(value.length<8||value.length>200){$("adminReportStatus").textContent="검토 사유를 8~200자로 입력하세요.";return;}
      if(!window.confirm(label+"을 적용할까요?"))return;
      pending=true;b.disabled=true;
      try{await request("report_decide",{target_type:item.target_type,target_id:item.target_id,decision,reason:value});await refresh();}
      catch{$("adminReportStatus").textContent="처리하지 못했습니다. 새로고침 후 확인하세요.";}
      finally{pending=false;b.disabled=false;}
     });box.append(b);
    }
   }
   root.append(box);
  }
  $("adminReportStatus").textContent=rows.length?rows.length+"건 · 최근 처리 대상 최대 50건":"검토 또는 해제할 신고가 없습니다.";
 }
 async function refresh(){
  if(!role)return;const seq=++serial;clear();$("adminMembersStatus").textContent="익명 회원 집계를 확인하는 중입니다.";$("adminReportStatus").textContent="신고 확인 중입니다.";
  try{
   const result=await request("summary");if(seq!==serial||!role)return;
   const values=[result.members,result.lv2,result.suspended];
   if(values.some(v=>!Number.isSafeInteger(v)||v<0))throw Error("invalid_summary");
   ids.forEach((id,i)=>$(id).textContent=values[i].toLocaleString("ko-KR"));$("adminMembersStatus").textContent="개인정보 없이 집계만 표시합니다.";
  }catch{if(seq===serial&&role)$("adminMembersStatus").textContent="집계를 확인하지 못했습니다.";}
  try{const data=await request("report_queue");if(seq!==serial||!role)return;renderReports(Array.isArray(data.rows)?data.rows:[]);}
  catch{if(seq===serial&&role)$("adminReportStatus").textContent="신고를 확인하지 못했습니다.";}
 }
 function mount(adminRole){role=String(adminRole||"");if(!bound){bound=true;$("adminMembersReload").addEventListener("click",()=>void refresh());}void refresh();}
 function reset(){role="";serial++;clear();$("adminMembersStatus").textContent="관리자 인증 후 표시됩니다.";$("adminReportStatus").textContent="관리자 인증 후 표시됩니다.";}
 window.BeaguMembersAdmin={mount,reset};
})();
