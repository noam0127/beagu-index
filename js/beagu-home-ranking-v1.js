/* Manual 2026 TOP10 snapshot; provisional, no ranking API calls. Existing detail routes unchanged. */
(function(){
 'use strict';
 const SEOUL=9*3600000, DAY=86400000;
 function koreaDay(now){return new Date(now+SEOUL).toISOString().slice(0,10);}
 function nextMidnight(now){return (Math.floor((now+SEOUL)/DAY)+1)*DAY-SEOUL;}
 function detailHref(id,level){return (level===1||level===2?'search-lv1.html':'school-report.html')+'?school_id='+encodeURIComponent(id);}
 function validPayload(data){
  if(!data||!Array.isArray(data.rows)||data.rows.length>10)return false;
  if(data.day===null)return data.rows.length===0;
  if(typeof data.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.day)||data.day>koreaDay(Date.now()))return false;
  const ids=new Set();let prev=null;
  return data.rows.every((r,i)=>{
   if(!r||typeof r.school_id!=='string'||!/^[A-Z0-9]{7}$/.test(r.school_id)||ids.has(r.school_id)||
     typeof r.school_name!=='string'||!r.school_name.trim()||r.school_name.length>120||
     typeof r.region!=='string'||r.region.length>100||typeof r.percentile!=='number'||!Number.isFinite(r.percentile)||r.percentile<0||r.percentile>100||
     !Number.isInteger(r.rank)||r.rank<1||r.rank>10)return false;
   const expected=prev&&prev.percentile===r.percentile?prev.rank:i+1;
   if(r.rank!==expected||(prev&&prev.percentile<r.percentile))return false;
   ids.add(r.school_id);prev=r;return true;
  });
 }
 if(typeof module==='object'&&module.exports){module.exports={koreaDay,nextMidnight,validPayload,detailHref};return;}
 const root=document.getElementById('beagu2026Ranking');if(!root||root.hidden)return;
 const list=root.querySelector('[data-ranking-list]'),status=root.querySelector('[data-ranking-status]');
 const tier=()=>Number(document.getElementById('beaguLevelState')?.dataset.level);
 const manualSnapshot={
  "day": "2026-11-26",
  "rows": [
    {
      "rank": 1,
      "school_id": "7551071",
      "school_name": "서현초등학교",
      "region": "경기 성남",
      "percentile": 100
    },
    {
      "rank": 2,
      "school_id": "7569043",
      "school_name": "안양호암초등학교",
      "region": "경기 안양과천",
      "percentile": 99.8
    },
    {
      "rank": 3,
      "school_id": "7361332",
      "school_name": "인천아라초등학교",
      "region": "인천 서부",
      "percentile": 99.6
    },
    {
      "rank": 4,
      "school_id": "7631121",
      "school_name": "평택도곡초등학교",
      "region": "경기 평택",
      "percentile": 99.3
    },
    {
      "rank": 4,
      "school_id": "8801086",
      "school_name": "고아초등학교",
      "region": "경북 구미",
      "percentile": 99.3
    },
    {
      "rank": 6,
      "school_id": "7051126",
      "school_name": "서울상경초등학교",
      "region": "서울 북부",
      "percentile": 99.1
    },
    {
      "rank": 7,
      "school_id": "7132081",
      "school_name": "서울관악초등학교",
      "region": "서울 동작관악",
      "percentile": 98.9
    },
    {
      "rank": 8,
      "school_id": "7361296",
      "school_name": "인천가원초등학교",
      "region": "인천 서부",
      "percentile": 98.6
    },
    {
      "rank": 8,
      "school_id": "7679337",
      "school_name": "아인초등학교",
      "region": "경기 화성오산",
      "percentile": 98.6
    },
    {
      "rank": 10,
      "school_id": "8151043",
      "school_name": "도장초등학교",
      "region": "충남 천안",
      "percentile": 98.4
    }
  ]
};
 const rows=manualSnapshot.rows;
 function el(tag,value){const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);return n;}
 function paint(){
  list.replaceChildren();
  for(const r of rows){
   const li=el('li'),rank=el('strong',r.rank),identity=el('span'),a=el('a',r.school_name);
   li.dataset.rank=String(r.rank);
   a.href=detailHref(r.school_id,tier());
   identity.append(a,el('small',r.region));li.append(rank,identity);list.append(li);
  }
 }
 document.getElementById('beagu2026RankingTitle').textContent='2026 배구지수 전국 TOP10';
 const note=root.querySelector('.beagu-home-school-note');
 if(note)note.textContent='수동 집계 · 수직성 인식조사 백분위 기준 · 산출 대상 학교 간 잠정 순위';
 status.textContent=manualSnapshot.day+' 기준 · 수동 집계';
 window.addEventListener('beagu:level-state-updated',paint);
 window.addEventListener('pageshow',paint);
 paint();
})();
