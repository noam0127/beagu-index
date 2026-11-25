(()=>{"use strict";
const root=document.getElementById("adminAuto2026");if(!root)return;
let owner=false,generation=0;
const el=(t,s)=>{const n=document.createElement(t);if(s!==undefined)n.textContent=s;return n;};
function mount(role){
 owner=role==="owner";const g=++generation;root.hidden=!owner;root.replaceChildren();if(!owner)return;
 const file=el("input");file.type="file";file.accept=".xlsx";file.setAttribute("aria-label","2026 최종 엑셀 편집본");
 const status=el("p");status.setAttribute("role","status");
 const button=el("button","최종 편집본 업로드 · 즉시 반영");button.type="button";button.className="secondary";
 const heading=el("h4","2026 최종 편집본");root.append(heading,el("p","학교ID, 백분위, Q01 등 확정된 공개 집계값만 있는 엑셀(.xlsx)을 선택하세요. 그리드 문항은 Q22.1, Q22.2처럼 행 번호를 붙입니다. 복수 보기는 ' | '로 구분합니다. Q31·Q51은 표시하지 않습니다."),el("p","업로드 파일은 2026 편집본 전체를 교체합니다. 기존 연도와 공개중단 기록은 유지됩니다. 실제 응답 원문·개인정보·응답수는 넣지 마세요."),file,button,status);
 button.onclick=async()=>{
  if(!owner||g!==generation||button.disabled)return;
  const f=file.files?.[0];if(!f){status.textContent="엑셀 파일을 선택하세요.";return;}
  button.disabled=true;
  try{
   const table=await window.BeaguEditedWorkbook.read(f);if(!owner||g!==generation)return;
   if(table.length<2)throw Error("자료 행이 없습니다.");
   // Do not transmit Q31/Q51 even when present in the local final workbook.
   const keep=table[0].map((h,i)=>/^Q(?:31|51)(?:[._-]\d+)?$/.test(h)?-1:i).filter(i=>i>=0);
   const filtered=table.map(row=>keep.map(i=>row[i]??''));
   const {data}=await supabaseClient.auth.getSession();const token=data?.session?.access_token;if(!token||!owner||g!==generation)throw Error("관리자 인증 필요");
   const body=JSON.stringify({action:"edited_2026_publish",confirmation:"FINAL_EDITED_FILE",table:filtered});
   if(new TextEncoder().encode(body).length>1900000)throw Error("공개 집계 파일이 너무 큽니다.");
   const r=await fetch(SUPABASE_URL+"/functions/v1/beagu-2026-review-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json","authorization":"Bearer "+token,"apikey":typeof SUPABASE_PUBLISHABLE_KEY==="string"?SUPABASE_PUBLISHABLE_KEY:""},body});
   const result=await r.json().catch(()=>({}));if(!r.ok||result.ok!==true)throw Error("파일 검사 또는 저장 실패: "+String(result.error||r.status));
   if(owner&&g===generation)status.textContent=result.schools+"개교 편집본 반영 완료 · 기존 공개중단은 유지됩니다.";
  }catch(e){if(owner&&g===generation)status.textContent=String(e.message||"업로드 실패");}finally{button.disabled=false;}
 };
}
window.Beagu2026ReviewAdmin={mount,reset(){owner=false;generation++;root.hidden=true;root.replaceChildren();}};
})();
