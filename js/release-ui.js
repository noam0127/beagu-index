(() => {
  const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text||'';if(cls)n.className=cls;return n;};
  function locked(level) {
    const box=node('section','','release-lock');
    box.append(node('div','▧ ▧ ▧ ▧ ▧','mosaic'),node('strong','🔒 '+(level===0?'2026년 배구지수는 Lv.1에서 공개됩니다.':'나머지 2026년 상세정보는 Lv.2에서 공개됩니다.')));
    const a=node('a',level===0?'Lv.1 열람하기':'Lv.2 열람하기');a.href=level===0?'search-lv1.html':'search-lv2.html';box.append(a);return box;
  }
  function latest(host,rows,level){
    const box=node('section','','latest-release');box.append(node('h3','2026 최신 정보'));
    if(level===0){box.append(node('p','조사자료 준비 중'),locked(0));host.append(box);return;}
    const current=(rows||[]).filter(r=>r.year===2026);
    const metrics=current.flatMap(r=>r.summary?.metrics||[]);
    const p=metrics.find(m=>m.key==='percentile');
    box.append(node('h4','2026 배구지수 백분위'),node('p',p?`${p.value}${p.unit||''}`:'조사자료 준비 중'));
    const vi=metrics.filter(m=>/^Q(0[1-9]|1[0-3])$/.test(m.key||''));
    box.append(node('h4','수직성 13문항'));
    if(vi.length===13){for(const m of vi){const d=node('details');d.append(node('summary',`${m.label}: ${m.value}${m.unit||''}`),node('p',m.meaning),node('p',m.interpretation),node('p',`${m.direction} · ${m.year}년`));box.append(d);}}
    else box.append(node('p','조사자료 준비 중 · 문항 확인 및 학교별 공개 승인 후 제공합니다.'));
    if(level===1)box.append(locked(1));
    else {box.append(node('h4','그 밖의 승인 상세정보'));const extra=metrics.filter(m=>m.key!=='percentile'&&!/^Q(0[1-9]|1[0-3])$/.test(m.key||''));for(const m of extra)box.append(node('p',`${m.label}: ${m.value}${m.unit||''} · ${m.year}년 · ${m.scope||''}`));if(!extra.length)box.append(node('p','공개 승인 자료 준비 중'));}
    host.append(box);
  }
  function facilities(host,rows){
    const record=(rows||[]).find(r=>r.year===2025);if(!record)return;
    const box=node('section','','facility-grid');box.append(node('h3','학교 시설'));
    for(const [key,icon,label] of [['I','🏫','교실'],['J','🏟️','체육관'],['K','🍽️','급식시설'],['L','🛋️','교원 지원공간']]){
      const v=record.values?.[key];if(v===null||v===undefined||v==='')continue;
      const d=node('details'),s=node('summary',`${icon} ${label}`);
      const description=`${label}: ${v} · 2025 편집본(학교정보 기준 2024) · 기존 승인 학교정보`;
      s.title=description;d.append(s,node('p',description));box.append(d);
    }if(box.children.length>1)host.append(box);
  }
  window.BeaguReleaseUI={latest,locked,facilities};
})();
