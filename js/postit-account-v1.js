(()=>{"use strict";
const $=id=>document.getElementById(id),base="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-postit-api-v1";
const levelKey="beagu-level-session-v1";let generation=0,linked=false;
const token=()=>{try{return sessionStorage.getItem(levelKey)||""}catch{return ""}};
function setLinked(next){linked=next===true;window.dispatchEvent(new CustomEvent("beagu:postit-account-status",{detail:{linked}}));}
async function refresh(){const serial=++generation,t=token();let ok=false;
 if(/^[a-f0-9]{64}$/.test(t)&&$("beaguLevelState")?.dataset.level==="2"){
  try{const r=await fetch(base+"?action=writer_status",{cache:"no-store",headers:{"X-Beagu-Level-Session":t}});ok=r.ok&&(await r.json()).linked===true;}catch{}
 }
 if(serial!==generation||t!==token())return;
 setLinked(ok);$("postitAccountStatus").textContent=ok?"Lv.2 활성 · 익명으로 작성할 수 있습니다.":"익명 회원 계정으로 로그인하세요.";
}
window.BeaguPostitAccount={refresh,canWrite:()=>linked};
window.addEventListener("beagu:level-state-updated",()=>void refresh());
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void refresh();});void refresh();
})();