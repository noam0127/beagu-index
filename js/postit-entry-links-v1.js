(()=>{"use strict";const RE=/^[A-Z0-9]{7}$/;
 function build(game,schoolId){const u=new URL("postit.html",location.href);u.searchParams.set("game",game);if(RE.test(schoolId||""))u.searchParams.set("school_id",schoolId);return u.href;}
 document.addEventListener("click",e=>{
  const a=e.target.closest("a[data-postit-game]");
  if(!a)return;
  e.preventDefault();
  return; // Deferred community: preserve existing link implementation for later reopening.
  const game=a.dataset.postitGame;
  const fromPicker=document.querySelector("#arcade-school-picker")?.dataset.schoolId||"";
  const fromDiary=new URLSearchParams(location.search).get("schoolId")||"";
  const id=fromPicker||fromDiary||"";
  a.href=build(game,id);
 });
})();