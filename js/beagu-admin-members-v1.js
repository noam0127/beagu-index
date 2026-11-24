/* Aggregate-only member summary. Admin authentication remains separate. */
(()=>{"use strict";
 const $=id=>document.getElementById(id),api=SUPABASE_URL+"/functions/v1/beagu-admin-members-v1";
 let role="",serial=0,bound=false;
 const ids=["adminMembersTotal","adminMembersLv2","adminMembersSuspended"];
 function clear(){for(const id of ids)$(id).textContent="—";}
 async function refresh(){
  if(!role)return;const seq=++serial;clear();$("adminMembersStatus").textContent="익명 회원 집계를 확인하는 중입니다.";
  try{
   const {data,error}=await supabaseClient.auth.getSession();
   if(error||!data?.session?.access_token)throw Error("session_required");
   const res=await fetch(api,{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json","apikey":SUPABASE_PUBLISHABLE_KEY,"Authorization":"Bearer "+data.session.access_token},body:JSON.stringify({action:"summary"})});
   const result=await res.json();if(!res.ok||!result.ok)throw Error("summary_unavailable");
   if(seq!==serial||!role)return;
   const values=[result.data.members,result.data.lv2,result.data.suspended];
   if(values.some(v=>!Number.isSafeInteger(v)||v<0))throw Error("invalid_summary");
   ids.forEach((id,i)=>$(id).textContent=values[i].toLocaleString("ko-KR"));
   $("adminMembersStatus").textContent="개인정보 없이 집계만 표시합니다.";
  }catch{if(seq===serial&&role){clear();$("adminMembersStatus").textContent="집계를 확인하지 못했습니다.";}}
 }
 function mount(adminRole){role=String(adminRole||"");if(!bound){bound=true;$("adminMembersReload").addEventListener("click",()=>void refresh());}void refresh();}
 function reset(){role="";serial++;clear();$("adminMembersStatus").textContent="관리자 인증 후 표시됩니다.";}
 window.BeaguMembersAdmin={mount,reset};
})();
