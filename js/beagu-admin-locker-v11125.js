// Owner-only anonymous report queue. No private actor/account IDs in UI.
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const endpoint=SUPABASE_URL+"/functions/v1/beagu-admin-members-v1";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
let generation=0,ready=false,active=false,pending=false;
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
function reset(){generation++;active=false;pending=false;$("adminLockerReports").hidden=true;$("adminLockerRows").replaceChildren();$("adminLockerStatus").textContent="소유자 인증 후 표시됩니다.";}
async function request(action,payload={}){
 const {data,error}=await supabaseClient.auth.getSession();
 if(error||!data?.session?.access_token)throw Error("session_required");
 const res=await fetch(endpoint,{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:"Bearer "+data.session.access_token},body:JSON.stringify({action,...payload})});
 const result=await res.json().catch(()=>({}));
 if(!res.ok||result.ok!==true)throw Error(result.error||"request_failed");
 return result.data;
}
async function refresh(){
 if(!active)return;
 const serial=++generation;$("adminLockerRows").replaceChildren();$("adminLockerStatus").textContent="신고 목록 확인 중…";
 try{
  const data=await request("locker_reports");
  if(!active||serial!==generation)return;
  const rows=Array.isArray(data.rows)?data.rows:[];
  for(const row of rows.slice(0,50)){
   if(!["post","comment"].includes(row.target_type)||!uuid.test(row.target_id))continue;
   const card=el("article");card.className="ranking-card";
   card.append(el("strong",(row.target_type==="post"?"게시글":"댓글")+" · 신고 "+Number(row.reports||0)+"건 · "+({published:"공개",hidden:"숨김",removed:"삭제"}[row.status]||"상태 확인 필요")),el("p",row.body||""));
   const locked=!!row.case_id;
   if(locked)card.append(el("p","작성 제한 중 · "+(row.expires_at?new Date(row.expires_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}):"")));
   const label=el("label","처리 사유 (8~200자)"),reason=el("textarea");reason.maxLength=200;reason.rows=2;label.append(reason);card.append(label);
   for(const [decision,title] of (locked?[["restore","작성 제한 해제"]]:[["dismiss","신고 기각"],["restrict_24h","24시간 작성 제한"],["restrict_7d","7일 작성 제한"]])){
    const b=el("button",title);b.type="button";b.className="secondary";
    b.addEventListener("click",async()=>{
     if(!active||pending)return;
     const value=reason.value.trim();if(value.length<8||value.length>200){$("adminLockerStatus").textContent="사유를 8~200자로 입력해 주세요.";return;}
     if(!confirm(title+" 처리할까요?"))return;
     const ticket=generation;pending=true;b.disabled=true;
     try{
      await request("locker_report_decide",{target_type:row.target_type,target_id:row.target_id,decision,reason:value});
      if(active&&ticket===generation){await refresh();if(active)$("adminLockerStatus").textContent="처리 완료 · 기록 저장";}
     }catch{if(active&&ticket===generation)$("adminLockerStatus").textContent="처리되지 않았거나 이미 처리된 신고입니다. 새로고침해 주세요.";}
     finally{pending=false;b.disabled=false;}
    });card.append(b);
   }
   $("adminLockerRows").append(card);
  }
  $("adminLockerStatus").textContent=$("adminLockerRows").childElementCount?"검토할 신고 및 활성 제한":"검토할 신고가 없습니다.";
 }catch{if(active&&serial===generation){$("adminLockerRows").replaceChildren();$("adminLockerStatus").textContent="신고 목록을 확인할 수 없습니다.";}}
}
function mount(role){
 reset();if(role!=="owner")return;
 active=true;$("adminLockerReports").hidden=false;
 if(!ready){$("adminLockerReload").addEventListener("click",()=>void refresh());ready=true;}
 void refresh();
}
window.BeaguLockerAdmin={mount,reset};
})();
