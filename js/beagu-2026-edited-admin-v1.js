(()=>{"use strict";
const root=document.getElementById("adminAuto2026");if(!root)return;
let owner=false,generation=0;
const el=(t,s)=>{const n=document.createElement(t);if(s!==undefined)n.textContent=s;return n;};
const clientKey="beagu.edited.google.webClientId";
function mount(role){
 owner=role==="owner";const g=++generation;root.hidden=!owner;root.replaceChildren();if(!owner)return;
 const link=el("input");link.type="url";link.placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0";link.setAttribute("aria-label","2026 최종 스프레드시트 링크");
 const config=el("details"),cid=el("input");cid.type="text";cid.autocomplete="off";cid.setAttribute("aria-label","Google 웹 OAuth 클라이언트 ID");cid.placeholder="…apps.googleusercontent.com";
 let saved="";try{saved=localStorage.getItem(clientKey)||"";}catch{}
 cid.value=window.BEAGU_GOOGLE_SHEETS_CLIENT_ID||saved;config.open=!window.BeaguEditedSheet.validClientId(cid.value);
 config.append(el("summary","Google 읽기 연결 설정 (최초 1회)"),el("p","Sheets API가 활성화된 웹 OAuth 클라이언트 ID만 입력하세요. 비밀번호나 클라이언트 비밀키는 입력하지 않습니다."),cid);
 const status=el("p","Google 인증 준비 중…");status.setAttribute("role","status");
 const button=el("button","최종 편집본 반영");button.type="button";button.className="secondary";button.disabled=true;
 root.append(el("h4","2026 최종 편집본"),el("p","Google 스프레드시트의 최종 편집본 탭 링크를 붙여 넣으세요. 학교ID, 백분위, Q01 등 확정 공개값만 읽습니다. 기존 연도와 공개중단은 유지됩니다."),link,button,status,config);
 window.BeaguEditedSheet.prepare().then(()=>{if(owner&&g===generation){button.disabled=false;status.textContent="최종 편집본 링크를 입력하세요.";}}).catch(e=>{if(owner&&g===generation)status.textContent=e.message;});
 button.onclick=async()=>{
  if(!owner||g!==generation||button.disabled)return;
  button.disabled=true;
  try{
   const ref=window.BeaguEditedSheet.source(link.value);
   const client=cid.value.trim();if(!window.BeaguEditedSheet.validClientId(client)){config.open=true;throw Error("Google 웹 OAuth 클라이언트 ID를 설정하세요.");}
   try{localStorage.setItem(clientKey,client);}catch{}
   status.textContent="Google 읽기 권한을 확인합니다.";
   // Starts directly from this user action, not from a timer or a background sync.
   const googleToken=await window.BeaguEditedSheet.authorize(client);
   if(!owner||g!==generation)return;
   status.textContent="최종 편집본을 불러옵니다.";
   const table=await window.BeaguEditedSheet.read(ref,googleToken);
   if(!owner||g!==generation)return;
   if(table.length<2)throw Error("자료 행이 없습니다.");
   const {data}=await supabaseClient.auth.getSession();const token=data?.session?.access_token;if(!token||!owner||g!==generation)throw Error("관리자 인증 필요");
   const body=JSON.stringify({action:"edited_2026_publish",confirmation:"FINAL_EDITED_FILE",table});
   if(new TextEncoder().encode(body).length>7900000)throw Error("공개 집계 파일이 너무 큽니다.");
   const r=await fetch(SUPABASE_URL+"/functions/v1/beagu-2026-review-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json","authorization":"Bearer "+token,"apikey":typeof SUPABASE_PUBLISHABLE_KEY==="string"?SUPABASE_PUBLISHABLE_KEY:""},body});
   const result=await r.json().catch(()=>({}));if(!r.ok||result.ok!==true)throw Error("편집본 검사 또는 저장 실패: "+String(result.error||r.status));
   if(owner&&g===generation)status.textContent=result.schools+"개교 편집본 반영 완료 · 기존 공개중단은 유지됩니다.";
  }catch(e){if(owner&&g===generation)status.textContent=String(e.message||"반영 실패");}finally{if(owner&&g===generation)button.disabled=false;}
 };
}
window.Beagu2026ReviewAdmin={mount,reset(){owner=false;generation++;root.hidden=true;root.replaceChildren();}};
})();
