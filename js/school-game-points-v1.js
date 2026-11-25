/* Public school totals only. No individual scores, sessions or school-name matching. */
(function(){
'use strict';
const ID=/^[A-Z0-9]{7}$/;
let seq=0;
async function refreshCards(host){
 if(!host||!host.querySelectorAll)return;
 const nodes=[...host.querySelectorAll('[data-school-game-points]')];
 const ids=[...new Set(nodes.map(n=>n.dataset.schoolGamePoints).filter(v=>ID.test(v||'')))];
 const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
 if(!ids.length||!client)return;
 const request=++seq;
 for(let i=0;i<ids.length;i+=40){
  try{
   const {data,error}=await client.rpc('beagu_school_game_points',{p_school_ids:ids.slice(i,i+40)});
   if(error||request!==seq)return;
   const totals=new Map((Array.isArray(data)?data:[]).filter(r=>r&&ID.test(r.school_id||'')&&r.points!==null&&Number.isSafeInteger(Number(r.points))&&Number(r.points)>=0).map(r=>[r.school_id,Number(r.points)]));
   for(const n of nodes){
    if(!n.isConnected||!totals.has(n.dataset.schoolGamePoints))continue;
    n.textContent=totals.get(n.dataset.schoolGamePoints).toLocaleString('ko-KR')+' P';
    n.title='보존된 과거 점수와 집계 시작 이후 검증된 점수의 합계 · 삭제된 과거 기록 제외';
    n.setAttribute('aria-label',n.textContent+' · '+n.title);
   }
  }catch(_){/* Never invent a total. */}
 }
}
window.BeaguSchoolGamePoints=Object.freeze({refreshCards});
})();
