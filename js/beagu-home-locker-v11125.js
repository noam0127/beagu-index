// Home preview: no static protected data, no local persistence, fail closed.
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const key="beagu-level-session-v1";
const endpoint="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-postit-api-v1";
const validId=s=>/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s||"");
const token=()=>{try{return sessionStorage.getItem(key)||""}catch{return ""}};
let generation=0,controller;
function clear(){
 generation++;controller?.abort();controller=null;
 $("homeLockerList").replaceChildren();$("homeLockerList").hidden=true;
 $("homeLockerStatus").textContent="Lv.2 익명 계정 인증 후 최신 이야기를 볼 수 있습니다.";
}
async function refresh(){
 clear();
 const current=token(),serial=generation;
 if(document.hidden||$("beaguLevelState")?.dataset.level!=="2"||!/^[a-f0-9]{64}$/.test(current))return;
 controller=new AbortController();
 try{
  const response=await fetch(endpoint+"?action=home_latest",{cache:"no-store",headers:{"X-Beagu-Level-Session":current},signal:controller.signal});
  if(!response.ok)return;
  const data=await response.json();
  if(serial!==generation||current!==token()||document.hidden||$("beaguLevelState")?.dataset.level!=="2")return;
  const list=$("homeLockerList");
  for(const p of (Array.isArray(data.posts)?data.posts:[]).slice(0,3)){
   if(!validId(p.id)||typeof p.excerpt!=="string")continue;
   const item=document.createElement("li"),a=document.createElement("a"),meta=document.createElement("small"),body=document.createElement("span");
   a.href="postit.html?post_id="+encodeURIComponent(p.id);
   meta.textContent=p.is_operator===true&&p.nickname==="카리브해매너티"?"카리브해매너티 · 운영자":/^(아웃사이드 히터|아포짓 스파이커|미들 블로커|세터|리베로)( [2-9]| [1-9][0-9]+)?$/.test(p.nickname||"")?p.nickname:"익명";
   body.textContent=[...p.excerpt].slice(0,100).join("");
   a.append(meta,body);item.append(a);list.append(item);
  }
  list.hidden=false;$("homeLockerStatus").textContent=list.childElementCount?"최신 이야기":"아직 게시글이 없습니다.";
 }catch{/* fail closed; no protected data retained */}
}
window.addEventListener("beagu:level-state-updated",()=>void refresh());
window.addEventListener("pagehide",clear);
window.addEventListener("pageshow",()=>void refresh());
document.addEventListener("visibilitychange",()=>{if(document.hidden)clear();else void refresh();});
window.addEventListener("storage",e=>{if(e.key===key||e.key===null)void refresh();});
void refresh();
})();
