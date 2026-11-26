(()=>{"use strict";
const $=id=>document.getElementById(id),base="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-postit-api-v1";
const levelKey="beagu-level-session-v1";let generation=0,linked=false;
const token=()=>{try{return sessionStorage.getItem(levelKey)||""}catch{return ""}};
function setLinked(next,readable=false){linked=next===true;window.dispatchEvent(new CustomEvent("beagu:postit-account-status",{detail:{linked,readable:readable===true,token:token()}}));}
async function refresh(){const serial=++generation,t=token();let ok=false,readable=false;
 setLinked(false,false);
 if(/^[a-f0-9]{64}$/.test(t)&&$("beaguLevelState")?.dataset.level==="2"){
  try{const r=await fetch(base+"?action=writer_status",{cache:"no-store",headers:{"X-Beagu-Level-Session":t}});if(r.ok){const data=await r.json();ok=data.linked===true;readable=data.readable===true;}}catch{}
 }
 if(serial!==generation||t!==token())return;
 setLinked(ok,readable);$("postitAccountStatus").textContent=ok?"Lv.2 활성 · 익명으로 작성할 수 있습니다.":readable?"계정 인증 완료 · 열람 가능":"기존 Lv.2 혜택은 유지됩니다. 포스트잇을 이용하려면 익명 계정으로 가입 또는 로그인하세요.";
}
window.BeaguPostitAccount={refresh,canWrite:()=>linked};
window.addEventListener("beagu:level-state-updated",()=>void refresh());
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void refresh();});void refresh();
})();