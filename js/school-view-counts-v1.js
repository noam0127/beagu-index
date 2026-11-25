/* Verified, anonymous per-school selection totals.
 * Counts combine confirmed search and actual detail events; each kind is daily-deduplicated.
 */
(() => {
  'use strict';
  const ID=/^[A-Z0-9]{7}$/;
  const cache=new Map();
  const valid=n=>Number.isSafeInteger(n)&&n>=0;
  const client=()=>typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
  function paint(id,n){
    if(!ID.test(String(id))||!valid(n))return;
    const old=cache.get(id);
    const total=valid(old)?Math.max(old,n):n;
    cache.set(id,total);
    document.querySelectorAll('[data-school-view-count]').forEach(node=>{
      if(node.dataset.schoolId!==id)return;
      const number=node.querySelector('.school-view-number');
      if(number)number.textContent=total.toLocaleString('ko-KR');
      node.setAttribute('aria-label','검색 및 상세조회 합계 '+total.toLocaleString('ko-KR')+'회 · 유형별 하루 중복 제외');
    });
  }
  async function fetchCounts(ids){
    const unique=[...new Set(ids.map(String).filter(id=>ID.test(id)))].slice(0,40);
    if(!unique.length||!client())return;
    try{
      const {data,error}=await client().rpc('beagu_school_view_counts',{p_school_ids:unique});
      if(error)throw error;
      const found=new Map((Array.isArray(data)?data:[])
        .filter(v=>v&&ID.test(String(v.school_id))&&valid(Number(v.views)))
        .map(v=>[String(v.school_id),Number(v.views)]));
      unique.forEach(id=>paint(id,found.get(id)||0));
    }catch(_){/* Leave unconfirmed totals blank, not fabricated. */}
  }
  function refreshCards(host){
    if(!host||!host.querySelectorAll)return Promise.resolve();
    return fetchCounts(Array.from(host.querySelectorAll('[data-school-view-count]'),
      el=>el.dataset.schoolId||''));
  }
  function refreshOne(el,id){
    if(!el||!ID.test(String(id)))return Promise.resolve();
    el.dataset.schoolId=String(id);
    return fetchCounts([String(id)]);
  }
  async function record(id,actionId,visitor){
    if(!ID.test(String(id))||!actionId||!visitor||!client())return;
    try{
      const {data,error}=await client().rpc('beagu_record_school_view',{
        p_school_id:String(id),p_action_id:actionId,p_visitor:visitor
      });
      if(error)throw error;
      if(data&&data.school_id===String(id)&&valid(Number(data.views)))
        paint(String(id),Number(data.views));
    }catch(_){/* No locally invented counts on server failures. */}
  }
  // Only server-confirmed totals can update the public counter display.
  window.BeaguSchoolViewCounts=Object.freeze({refreshCards,refreshOne,record,applyConfirmedCount:paint});
})();
