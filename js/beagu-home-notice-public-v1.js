/* Never infer the audience from a page or UI badge. The endpoint derives it from the session. */
(()=>{"use strict";
const by=id=>document.getElementById(id),common=by("beaguHomeNoticeBody"),tier=by("beaguTierNotice"),label=by("beaguTierNoticeLabel"),body=by("beaguTierNoticeBody"),error=by("beaguNoticeError"),section=common?.closest("[data-notice-state]");if(!section||!tier||!label||!body||!error)return;
const heading=section.querySelector("h2");
if(heading){
 const control=document.createElement("button");control.type="button";control.className="minimal-notice-toggle";control.textContent="공지사항";control.setAttribute("aria-expanded","false");control.setAttribute("aria-controls","beaguHomeNoticeBody beaguTierNotice beaguNoticeError");
 heading.replaceChildren(control);section.classList.add("minimal-notice");
 section.addEventListener("click",()=>{const open=section.classList.toggle("court-notice-open");control.setAttribute("aria-expanded",String(open));});
}
const endpoint=SUPABASE_URL+"/functions/v1/beagu-notice-audience-v1",key="beagu-level-session-v1";let generation=0,controller;
const token=()=>{try{return sessionStorage.getItem(key)||""}catch{return ""}};
function clear(){common.textContent="";body.textContent="";label.textContent="";common.hidden=tier.hidden=error.hidden=true;section.hidden=true;section.dataset.noticeState="loading";}
async function refresh(){
 const seq=++generation,start=token();controller?.abort();controller=new AbortController();const requestController=controller,signal=requestController.signal;const timer=setTimeout(()=>requestController.abort(),10000);clear();
 const current=()=>seq===generation&&token()===start&&!signal.aborted;
 try{
 const headers={apikey:SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"};if(start)headers["X-Beagu-Session"]=start;
 const res=await fetch(endpoint,{method:"POST",headers,body:JSON.stringify({action:"public_read"}),cache:"no-store",signal});if(!current())return;
 if(!res.ok)throw Error("notice");const data=await res.json();if(!current())return;
 if(![0,1,2].includes(data.level)||!Array.isArray(data.notices)||(!start&&data.level!==0))throw Error("response");
 const render=(audience,node)=>{const n=data.notices.find(x=>x.audience===audience&&typeof x.body==="string"&&x.body.trim());node.textContent=n?.body||"";return !!n;};
 const hasCommon=render("all",common),hasTier=render(String(data.level),body);common.hidden=!hasCommon;tier.hidden=!hasTier;
 if(hasTier){label.textContent="Lv."+data.level+" 공지사항";tier.dataset.level=String(data.level);}
 section.hidden=!hasCommon&&!hasTier;section.dataset.noticeState=section.hidden?"hidden":"published";
 }catch{if(seq!==generation||token()!==start)return;clear();error.textContent="공지사항을 확인하지 못했습니다.";error.hidden=false;section.hidden=false;section.dataset.noticeState="unavailable";}finally{clearTimeout(timer)}
}
for(const e of ["beagu:level-state-change","beagu:level-state-updated","beagu:challenge-access-granted","beagu:challenge-access-revoked","focus","pageshow"])window.addEventListener(e,refresh);
document.addEventListener("visibilitychange",()=>{if(document.hidden){++generation;controller?.abort();clear();}else void refresh();});
void refresh();
})();
