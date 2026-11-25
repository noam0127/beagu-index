(() => {
  'use strict';
  const root=document.getElementById('beagu2026Ranking');
  if(!root)return;
  const list=root.querySelector('[data-ranking-list]'),status=root.querySelector('[data-ranking-status]'),more=root.querySelector('[data-ranking-more]');
  const endpoint='https://snvzwrexuqavnfvzgxqj.supabase.co/functions/v1/beagu-level-api';
  const token=()=>{try{return sessionStorage.getItem('beagu-level-session-v1')||''}catch{return ''}};
  const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=String(text);return e};
  let generation=0;
  async function refresh(){
    const g=++generation,t=token();
    list.replaceChildren();more.hidden=true;
    status.textContent='2026 랭킹 확인 중';
    try{
      const headers={'Content-Type':'application/json'};
      if(t)headers['X-Beagu-Session']=t;
      const response=await fetch(endpoint,{method:'POST',headers,cache:'no-store',body:JSON.stringify({action:'home_ranking_2026'})});
      if(!response.ok)throw Error('UNAVAILABLE');
      const data=await response.json();
      if(g!==generation||t!==token())return;
      if(data.year!==2026||![10,30,100].includes(data.limit)||!Array.isArray(data.rows)||data.rows.length>data.limit)throw Error('INVALID');
      if(!data.rows.every((r,i)=>r.rank===i+1&&/^[A-Z0-9]{7}$/.test(r.school_id)&&typeof r.school_name==='string'&&typeof r.percentile==='number'&&Number.isFinite(r.percentile)&&r.percentile>=0&&r.percentile<=100))throw Error('INVALID');
      if(!data.rows.length){status.textContent='2026 자료 공개 준비 중';return}
      const frag=document.createDocumentFragment();
      for(const r of data.rows){
        const li=document.createElement('li'),a=node('a',r.school_name);
        a.href='school-report.html?school_id='+encodeURIComponent(r.school_id);
        const rank=node('strong',r.rank<=3?['🥇','🥈','🥉'][r.rank-1]:r.rank+'위');
        rank.setAttribute('aria-label',r.rank+'위');
        const meta=node('small',[r.sido,r.support_office].filter(Boolean).join(' · '));
        const group=document.createElement('span');group.append(a,meta);
        li.append(rank,group,node('strong',r.percentile.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%'));
        frag.append(li);
      }
      list.append(frag);
      status.textContent='공개 TOP '+data.limit+' · 2026 설문 기반 백분위';
      if(data.limit<100){
        more.textContent=data.limit===10?'Lv.1에서 30위까지 보기':'Lv.2에서 100위까지 보기';
        more.hidden=false;
      }
    }catch{if(g===generation&&t===token()){list.replaceChildren();status.textContent='2026 랭킹을 확인하지 못했습니다.'}}
  }
  for(const event of ['beagu:level-state-updated','beagu:level-state-change','beagu:challenge-access-revoked','pageshow'])window.addEventListener(event,refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh()});
  void refresh();
})();