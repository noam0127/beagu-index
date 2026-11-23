(()=>{"use strict";
const host=document.getElementById("adminReview2026");if(!host)return;
const panel=document.createElement("section");panel.className="ranking-card";panel.hidden=true;
panel.innerHTML='<div class="section-title"><h4>2026 학교별 의심 데이터 신고 · Lv.2 정정 요청 재검증</h4><select id="civicAdminFilter" aria-label="접수 상태"><option value="PENDING">검토 대기</option><option value="REVIEWING">검토 중</option><option value="ALL">전체</option><option value="RESOLVED">처리 완료</option><option value="NO_CHANGE">이상 없음</option><option value="REJECTED">반려</option></select><button type="button" id="civicAdminRefresh">새로고침</button></div><p id="civicAdminMessage" role="status" aria-live="polite"></p><div id="civicAdminList" class="audit-list"></div>';
host.append(panel);
const $=x=>panel.querySelector("#"+x);
const endpoint="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-2026-civic";
let owner=false;
async function call(body){
 const {data}=await supabaseClient.auth.getSession();
 const token=data?.session?.access_token;if(!token)throw Error("MFA");
 const res=await fetch(endpoint,{method:"POST",cache:"no-store",
 headers:{"content-type":"application/json","Authorization":"Bearer "+token},
 body:JSON.stringify(body)});
 const result=await res.json().catch(()=>({}));if(!res.ok)throw Error("DENIED");return result;
}
const el=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
async function refresh(){if(!owner)return;const root=$("civicAdminList");root.replaceChildren();$("civicAdminMessage").textContent="검토 목록을 조회하고 있습니다.";
 try{const result=await call({action:"admin_list",status:$("civicAdminFilter").value});
 const items=Array.isArray(result.items)?result.items:[];
 for(const item of items){
 const card=el("article","");card.className="ranking-card";
 card.append(el("strong",(item.school_name||item.school_id)+" · "+(item.kind==="REPORT"?"자료 신고":"Lv.2 정정 요청")));
 card.append(el("p",(item.question_id||"학교 전체")+" · "+item.category+" · "+item.status));
 card.append(el("p",String(item.detail||"")));
 if(["PENDING","REVIEWING"].includes(item.status))for(const [action,label] of
 [["REVIEWING","검토 중"],["RESOLVED","처리 완료"],["NO_CHANGE","이상 없음"],["REJECTED","반려"]]){
 const btn=el("button",label);btn.type="button";btn.className="secondary";
 btn.onclick=async()=>{
 const reason=window.prompt("검토 근거를 12~500자로 작성해 주세요. 개인정보·실명은 입력하지 마세요.");
 if(reason===null||reason.trim().length<12||reason.length>500)return;
 if(!window.confirm("요청 상태만 기록하며 원본 설문이나 공개 수치는 자동 수정되지 않습니다. 진행하시겠습니까?"))return;
 btn.disabled=true;try{
 await call({action:"admin_decide",id:item.id,decision:action,reason:reason.trim()});
 await refresh();
 }catch{$("civicAdminMessage").textContent="처리 실패 · 권한·요청 상태 확인 필요";}
 finally{btn.disabled=false;}
 };
 card.append(btn);}
 root.append(card);
 }
 if(!items.length)root.append(el("p","현재 선택한 상태의 접수 내역이 없습니다."));
 $("civicAdminMessage").textContent="최근 "+items.length+"건 · 신고만으로 허위 응답을 확정하지 않습니다.";
 }catch{$("civicAdminMessage").textContent="접수 목록 조회 실패 · 관리자 MFA 인증과 서버 상태를 확인해 주세요.";}
}
$("civicAdminRefresh").onclick=()=>void refresh();$("civicAdminFilter").onchange=()=>void refresh();
window.BeaguCivicAdmin={
 mount(role){owner=role==="owner";panel.hidden=!owner;if(owner)void refresh();},
 reset(){owner=false;panel.hidden=true;$("civicAdminList").replaceChildren();}
};
})();
