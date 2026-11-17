/* 2026 challenge progress uses only the server's issued participant ordinal. */
(function(){
 'use strict';
 const GOAL=1000;
 const valid=n=>Number.isSafeInteger(n)&&n>=0;
 function render(target,raw){
  const n=typeof raw==='number'?raw:Number(raw);
  const number=target.querySelector('[data-xp-number]');
  const remainder=target.querySelector('[data-xp-remainder]');
  const bar=target.querySelector('[data-xp-progress]');
  const state=target.querySelector('[data-xp-state]');
  if(!number||!remainder||!bar||!state||!valid(n))return false;
  const progress=Math.min(n/GOAL*100,100);
  number.textContent=n.toLocaleString('ko-KR')+' / '+GOAL.toLocaleString('ko-KR');
  remainder.textContent=n>=GOAL?'목표 달성':(GOAL-n).toLocaleString('ko-KR')+'명 남음';
  state.textContent=n>=GOAL?'1,000명 챌린지 목표에 도달했습니다.':'기존 챌린지 발급 순번 기준';
  bar.style.width=progress.toFixed(1)+'%';
  bar.setAttribute('aria-valuenow',String(Math.min(n,GOAL)));
  target.dataset.xpState='ready';
  return true;
 }
 function unavailable(target){
  target.dataset.xpState='unavailable';
  const number=target.querySelector('[data-xp-number]');
  const remainder=target.querySelector('[data-xp-remainder]');
  const state=target.querySelector('[data-xp-state]');
  const bar=target.querySelector('[data-xp-progress]');
  if(number)number.textContent='집계 확인 불가';
  if(remainder)remainder.textContent='순번 조회 필요';
  if(state)state.textContent='챌린지 순번을 불러오지 못했습니다.';
  if(bar){bar.style.width='0%';bar.removeAttribute('aria-valuenow');}
  // A connection failure must never be shown as 0 / 1000.
 }
 let underway=null;
 async function refresh(){
  const targets=[...document.querySelectorAll('[data-beagu-xp]')];
  if(!targets.length)return null;
  if(underway)return underway;
  underway=(async()=>{
   // Read existing data only; do not issue new participation numbers.
   for(let attempt=0;attempt<3;attempt++){
    try{
     if(typeof supabaseClient==='undefined'||typeof supabaseClient.rpc!=='function')throw Error('RPC_UNAVAILABLE');
     const {data,error}=await supabaseClient.rpc('beagu_get_challenge_progress');
     if(error||data===null||data===undefined||data==='')throw Error('PROGRESS_UNAVAILABLE');
     const n=typeof data==='number'?data:Number(data);
     if(!valid(n))throw Error('INVALID_CHALLENGE_SEQUENCE');
     targets.forEach(node=>render(node,n));
     return n;
    }catch(_){
     if(attempt<2)await new Promise(resolve=>setTimeout(resolve,800*(attempt+1)));
    }
   }
   targets.forEach(unavailable);
   return null;
  })();
  try{return await underway;}finally{underway=null;}
 }
 window.BeaguChallengeProgress=Object.freeze({GOAL,render,unavailable,refresh});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{void refresh();},{once:true});
 else void refresh();
 // Back-forward cache may restore a stale count.
 if(typeof window.addEventListener==='function')window.addEventListener('pageshow',event=>{if(event.persisted)void refresh();});
})();
