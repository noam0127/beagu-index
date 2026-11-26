(()=>{"use strict";
const API="https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-postit-api-v1";
const ID=/^[A-Z0-9]{7}$/;
const token=()=>{try{return sessionStorage.getItem("beagu-level-session-v1")||""}catch{return ""}};
function href(id,compose=false){if(!ID.test(String(id)))return "postit.html";return "postit.html?school_id="+encodeURIComponent(id)+(compose?"&compose=1":"");}
function makeLink(id,compose=false){const a=document.createElement("a");a.className="locker-school-link";a.href=href(id,compose);a.textContent=compose?"라커룸에서 이 학교 이야기하기":"라커룸에서 학교 이야기 모아보기";return a;}
function create(id,detail=false){
 const host=document.createElement("div");
 if(!ID.test(String(id)))return host;
 host.className="locker-school-links";host.dataset.lockerSchoolId=id;
 if(detail)host.dataset.lockerDetail="1";
 const read=makeLink(id);read.dataset.lockerRead="";read.hidden=true;
 host.append(read);
 if(detail){const write=makeLink(id,true);write.dataset.lockerCompose="";host.append(write);}
 else host.hidden=true;
 return host;
}
function reset(host){
 const read=host.querySelector("[data-locker-read]");if(read){read.hidden=true;read.textContent="라커룸에서 학교 이야기 모아보기";}
 if(!host.dataset.lockerDetail)host.hidden=true;
}
let sequence=0;
async function refresh(root=document){
 const ticket=++sequence,t=token(),hosts=[...root.querySelectorAll("[data-locker-school-id]")];
 hosts.forEach(reset);
 if(!/^[a-f0-9]{64}$/.test(t)||document.getElementById("beaguLevelState")?.dataset.level!=="2")return;
 const ids=[...new Set(hosts.map(h=>h.dataset.lockerSchoolId).filter(id=>ID.test(id)))];
 for(let i=0;i<ids.length;i+=50){
  const batch=ids.slice(i,i+50);
  try{
   const u=new URL(API);u.searchParams.set("action","school_counts");u.searchParams.set("school_ids",batch.join(","));
   const res=await fetch(u.href,{cache:"no-store",headers:{"X-Beagu-Level-Session":t}});
   if(ticket!==sequence||token()!==t)return;
   if(!res.ok)continue;
   const json=await res.json();
   if(ticket!==sequence||token()!==t||document.getElementById("beaguLevelState")?.dataset.level!=="2")return;
   for(const host of hosts){
    const id=host.dataset.lockerSchoolId;
    if(!host.isConnected||!batch.includes(id))continue;
    const n=json.counts?.[id];
    if(!Number.isSafeInteger(n)||n<=0)continue;
    const read=host.querySelector("[data-locker-read]");if(!read)continue;
    read.textContent=(host.dataset.lockerDetail?"라커룸에서 학교 이야기 모아보기":"학교 이야기")+" "+n.toLocaleString("ko-KR")+"개";
    read.hidden=false;host.hidden=false;
   }
  }catch{/* Failure must not reveal cached counts. */}
 }
}
function refreshAll(){void refresh(document);}
window.BeaguLockerSchoolLinks=Object.freeze({create,href,refresh:refreshAll});
window.addEventListener("beagu:level-state-updated",refreshAll);
window.addEventListener("pageshow",refreshAll);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshAll();});
})();
