/* v1.11.10: compact notices and school context; no auth changes. */
(()=>{"use strict";
 const toggle=document.getElementById("courtNoticeToggle");
 if(toggle){const section=toggle.closest(".beagu-home-notice");toggle.addEventListener("click",()=>{const open=section.classList.toggle("court-notice-open");toggle.setAttribute("aria-expanded",String(open));toggle.textContent=open?"접기":"더 보기";});}
 const status=document.getElementById("courtExperienceSchool");
 if(!status)return;
 const id=new URLSearchParams(location.search).get("school_id");
 if(!/^[A-Z0-9]{7}$/.test(id||""))return;
 const links=[...document.querySelectorAll('article[data-status="available"] a.playground-primary')];
 for(const link of links){const target=new URL(link.href);target.searchParams.set("school_id",id);link.href=target.href;}
 status.hidden=false;status.textContent="선택 학교 확인 중…";
 fetch("https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/arcade-leaderboard?school_id="+encodeURIComponent(id),{cache:"no-store",headers:{Accept:"application/json"}})
 .then(r=>{if(!r.ok)throw Error("unavailable");return r.json()})
 .then(({school})=>{if(!school||String(school.school_id)!==id||typeof school.school_name!=="string"||!school.school_name.trim())throw Error("invalid");status.textContent="선택 학교 · "+school.school_name;})
 .catch(()=>{status.textContent="게임 입장 시 학교를 다시 확인합니다.";});
})();
