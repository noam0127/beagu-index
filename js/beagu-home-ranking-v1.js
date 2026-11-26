/* Daily 2026 ranking: protected API only; never persist values or trust UI tier alone. */
(function(){
 'use strict';
 const SEOUL=9*3600000, DAY=86400000;
 function koreaDay(now){return new Date(now+SEOUL).toISOString().slice(0,10);}
 function nextMidnight(now){return (Math.floor((now+SEOUL)/DAY)+1)*DAY-SEOUL;}
 function validPayload(data,level){
  if(!data||data.level!==level||![1,2].includes(level)||!Array.isArray(data.rows)||data.rows.length>20)return false;
  if(data.day===null)return data.rows.length===0;
  if(typeof data.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.day)||data.day>koreaDay(Date.now()))return false;
  const ids=new Set();
  let prev=null;
  return data.rows.every((r,i)=>{
   if(!r||typeof r.school_id!=='string'||!/^[A-Z0-9]{7}$/.test(r.school_id)||ids.has(r.school_id)||
     typeof r.school_name!=='string'||!r.school_name.trim()||r.school_name.length>120||
     typeof r.region!=='string'||r.region.length>100||typeof r.percentile!=='number'||!Number.isFinite(r.percentile)||r.percentile<0||r.percentile>100||
     !Number.isInteger(r.rank)||r.rank<1||r.rank>20)return false;
   const expected=prev&&prev.percentile===r.percentile?prev.rank:i+1;
   if(r.rank!==expected||(prev&&prev.percentile<r.percentile))return false;
   ids.add(r.school_id);prev=r;return true;
  });
 }
 if(typeof module==='object'&&module.exports){module.exports={koreaDay,nextMidnight,validPayload};return;}
 const root=document.getElementById('beagu2026Ranking');if(!root)return;
 const list=root.querySelector('[data-ranking-list]'),status=root.querySelector('[data-ranking-status]'),more=root.querySelector('[data-ranking-more]'),login=root.querySelector('[data-ranking-login]');
 const token=()=>{try{return sessionStorage.getItem('beagu-level-session-v1')||''}catch{return ''}};
 const tier=()=>Number(document.getElementById('beaguLevelState')?.dataset.level);
 let rows=[],expanded=false,sequence=0,controller=null,timer=null;
 function el(tag,value){const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);return n;}
 function paint(){
  list.replaceChildren();
  for(const r of rows.slice(0,expanded?20:5)){
   const li=el('li'),rank=el('strong',r.rank),identity=el('span'),a=el('a',r.school_name);
   a.href='search-lv1.html?school_id='+encodeURIComponent(r.school_id);
   identity.append(a,el('small',r.region));li.append(rank,identity,el('strong',r.percentile.toFixed(1)));list.append(li);
  }
  more.hidden=rows.length<=5;more.textContent=expanded?'접기':'TOP 20 전체보기';more.setAttribute('aria-expanded',String(expanded));
 }
 function clear(message,locked=false){rows=[];paint();status.textContent=message;login.hidden=!locked;}
 function schedule(){
  clearTimeout(timer);const now=Date.now();
  timer=setTimeout(refresh,Math.max(1000,Math.min(300000,nextMidnight(now)-now+1000)));
 }
 async function refresh(){
  const seq=++sequence,start=token(),level=tier();
  controller?.abort();controller=new AbortController();const signal=controller.signal;
  clear('공개 승인 자료 확인 중');
  if(!/^[a-f0-9]{64}$/.test(start)||![1,2].includes(level)){
   clear('Lv.1 이상 승인 자료를 확인할 수 있습니다.',true);schedule();return;
  }
  const timeout=setTimeout(()=>controller?.abort(),15000);
  try{
   const res=await fetch(SUPABASE_URL+'/functions/v1/beagu-level-api',{method:'POST',headers:{'Content-Type':'application/json','X-Beagu-Session':start},body:JSON.stringify({action:'home_ranking_2026'}),cache:'no-store',signal});
   if(seq!==sequence||token()!==start||tier()!==level)return;
   if(res.status===401||res.status===403){clear('열람 권한을 다시 확인해 주세요.',true);return;}
   if(!res.ok)throw Error('RANKING_UNAVAILABLE');
   const data=await res.json();
   if(seq!==sequence||token()!==start||tier()!==level||signal.aborted)return;
   if(!validPayload(data,level))throw Error('INVALID_RANKING');
   rows=data.rows;paint();
   status.textContent=data.day===null?'2026 공개 승인 순위 준비 중':data.day+' 기준'+(data.day!==koreaDay(Date.now())?' · 직전 정상 집계':'')+(rows.length?'':' · 공개 승인 학교 없음');
  }catch(_){if(seq===sequence&&token()===start&&tier()===level)clear('최신 공개 승인 순위를 확인하지 못했습니다.');}
  finally{clearTimeout(timeout);if(seq===sequence)schedule();}
 }
 more.addEventListener('click',()=>{expanded=!expanded;paint();});
 window.addEventListener('beagu:level-state-updated',()=>{expanded=false;void refresh();});
 window.addEventListener('pageshow',()=>void refresh());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 void refresh();
})();
