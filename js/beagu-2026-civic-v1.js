(()=>{"use strict";
// Self-contained school feedback. No protected response appears in this UI.
const id=()=>{const p=new URLSearchParams(location.search),v=p.get("school_id")||p.get("school")||"";return /^[A-Z0-9]{7}$/.test(v)?v:null;};
const anchor=document.querySelector(".latest-year-status");if(!anchor)return;
const panel=document.createElement("section");panel.className="beagu-civic-panel";
panel.innerHTML='<h3>2026 조사자료 함께 검증하기</h3><p id="civicStatus" role="status">2026년 조사 참여 여부 확인 중</p><div class="beagu-civic-actions"><button type="button" id="civicReport">의심 데이터 신고</button><button type="button" id="civicCorrect">Lv.2 답변 정정 요청</button></div><form id="civicForm" hidden><label id="civicTypeLabel">신고 유형 <select id="civicType"><option value="SCHOOL">학교 정보 오류</option><option value="AGGREGATE">집계 오류</option><option value="SUSPECT">중복·허위 응답 의심</option><option value="PRIVACY">개인 식별 우려</option><option value="OTHER">기타</option></select></label><label>문항 (정정 요청은 필수) <select id="civicQuestion"><option value="">학교 전체</option></select></label><label>설명 (12~500자, 실명·연락처 금지) <textarea id="civicDetail" minlength="12" maxlength="500" rows="3" required></textarea></label><button type="submit">관리자에게 접수</button></form><p id="civicMessage" role="status" aria-live="polite"></p>';
anchor.after(panel);
const $=x=>panel.querySelector("#"+x),url="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-2026-civic";
for(let i=1;i<=51;i++){const opt=document.createElement("option");opt.value="Q"+String(i).padStart(2,"0");opt.textContent=opt.value;$("civicQuestion").append(opt);}
let kind="report";
$("civicReport").onclick=async()=>{const school=id();if(!school)return;const detail=window.prompt("자료 신고 사유 (12~500자, 개인정보 금지)");if(detail===null)return;try{await post({action:"simple_report",school_id:school,detail:detail.trim()});$("civicMessage").textContent="신고가 접수됐습니다.";}catch{$("civicMessage").textContent="신고 접수 실패 · 사유 또는 요청 횟수를 확인하세요.";}};
$("civicCorrect").onclick=()=>{kind="correct";$("civicForm").hidden=false;$("civicTypeLabel").hidden=true;$("civicQuestion").value="Q01";$("civicMessage").textContent="Lv.2 개인 참여코드 인증이 필요합니다. 본인 원본 응답 연결 전에는 기존 구글 설문 답변이 자동 수정되지 않습니다.";};
const nonce=()=>{let v;try{v=sessionStorage.getItem("beagu-civic-device-v1");if(!v){v=crypto.randomUUID();sessionStorage.setItem("beagu-civic-device-v1",v);}}catch{v=crypto.randomUUID();}return v;};
async function post(body,withCode=false){
 const headers={"content-type":"application/json","x-beagu-client":nonce()};
 if(withCode){const token=sessionStorage.getItem("beagu-level-session-v1");if(!token)throw Error("LV2_INDIVIDUAL_CODE_REQUIRED");headers["x-beagu-session"]=token;}
 const res=await fetch(url,{method:"POST",cache:"no-store",headers,body:JSON.stringify(body)});
 const json=await res.json().catch(()=>({}));if(!res.ok)throw Error(json.error||"FAILED");return json;
}
async function status(){if(!id())return;try{const a=await post({action:"status",school_id:id()});$("civicStatus").textContent=a.participation_confirmed?"2026년 조사 참여가 확인된 학교입니다.":"2026년 학교별 참여 현황 확인 중입니다. 문항별 결과는 최종 승인 뒤 공개됩니다.";}catch{$("civicStatus").textContent="2026년 참여 현황을 확인하지 못했습니다.";}}
$("civicForm").onsubmit=async ev=>{ev.preventDefault();const school=id(),btn=$("civicForm").querySelector('button[type="submit"]');
 if(!school){$("civicMessage").textContent="먼저 학교를 선택해 주세요.";return;}
 if(kind==="correct"&&!$("civicQuestion").value){$("civicMessage").textContent="정정할 문항을 지정해 주세요.";return;}
 btn.disabled=true;$("civicMessage").textContent="접수 중입니다.";
 try{await post({action:kind,school_id:school,category:$("civicType").value,
 question_id:$("civicQuestion").value||null,detail:$("civicDetail").value.trim()},kind==="correct");
 $("civicMessage").textContent=kind==="correct"?"정정 요청이 접수됐습니다. 원본 답변은 변경되지 않았으며, 관리자 확인이 필요합니다.":"신고가 접수됐습니다. 운영자 재검토 대상으로 기록됐습니다.";
 $("civicForm").reset();}catch(e){$("civicMessage").textContent=e.message==="LV2_INDIVIDUAL_CODE_REQUIRED"?"개인 Lv.2 참여코드로 먼저 인증해 주세요. 공유용 코드는 정정 요청에 사용할 수 없습니다.":"접수할 수 없습니다. 학교·입력·인증 상태 또는 요청 횟수를 확인해 주세요.";}finally{btn.disabled=false;}
};
void status();window.addEventListener("popstate",()=>void status());
const name=document.getElementById("schoolName");if(name)new MutationObserver(()=>void status()).observe(name,{childList:true,subtree:true,characterData:true});
})();
