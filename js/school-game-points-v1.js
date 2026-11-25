/* Existing public school-total RPC; no new endpoint or fabricated points. */
(function(){
'use strict';
const ID=/^[A-Z0-9]{7}$/;
let seq=0;
async function readTotals(schoolIds){
 const ids=[...new Set(schoolIds.map(String).filter(id=>ID.test(id)))];
 const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
 if(!client)throw Error('POINTS_UNAVAILABLE');
 const totals=new Map();
 const batches=[];for(let i=0;i<ids.length;i+=40)batches.push(ids.slice(i,i+40));
 for(let i=0;i<batches.length;i+=4){
  await Promise.all(batches.slice(i,i+4).map(async batch=>{
   const {data,error}=await client.rpc('beagu_school_game_points',{p_school_ids:batch});
   if(error||!Array.isArray(data))throw Error('POINTS_UNAVAILABLE');
   for(const r of data){if(r&&batch.includes(r.school_id)&&r.points!==null&&r.points!==undefined&&r.points!==''&&Number.isSafeInteger(Number(r.points))&&Number(r.points)>=0)totals.set(r.school_id,Number(r.points));}
  }));
 }
 return totals;
}
function rank(rows,totals,direction){
 if(!['asc','desc'].includes(direction))throw Error('INVALID_SORT');
 return rows.map(s=>({...s,game_points:totals.get(String(s.school_id))??null,staticFactsOnly:true})).sort((a,b)=>{
  const x=a.game_points,y=b.game_points;
  if(x===null&&y!==null)return 1;if(y===null&&x!==null)return -1;
  if(x!==null&&y!==null&&x!==y)return direction==='asc'?x-y:y-x;
  return String(a.school_name).localeCompare(String(b.school_name),'ko')||String(a.school_id).localeCompare(String(b.school_id));
 });
}
async function refreshCards(host){
 if(!host||!host.querySelectorAll)return;
 const nodes=[...host.querySelectorAll('[data-school-game-points]')];
 if(!nodes.length)return;
 const request=++seq;
 try{
  const totals=await readTotals(nodes.map(n=>n.dataset.schoolGamePoints));
  if(request!==seq)return;
  for(const n of nodes){
   if(!n.isConnected)continue;
   const v=totals.get(n.dataset.schoolGamePoints);
   n.textContent=v===undefined?'자료 없음':v.toLocaleString('ko-KR')+' P';
   n.title='보존된 과거 점수와 집계 시작 이후 검증된 점수의 합계 · 삭제된 과거 기록 제외';
   n.setAttribute('aria-label',n.textContent+' · '+n.title);
  }
 }catch(_){if(request===seq)for(const n of nodes)if(n.isConnected&&n.textContent==='—')n.textContent='불러오기 실패';}
}
window.BeaguSchoolGamePoints=Object.freeze({readTotals,rank,refreshCards});
})();
