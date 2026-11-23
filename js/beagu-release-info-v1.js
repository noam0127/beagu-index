/* Safe, same-origin release metadata, no auth or external calls. */
(() => {
 'use strict';
 if (window.self !== window.top || document.body.classList.contains('beagu-page-game') || document.body.classList.contains('arcade-body')) return;
 const source = new URL('../release-info.json', document.currentScript.src);
 const footer=document.createElement('footer');footer.className='beagu-release-footer';
 const details=document.createElement('details'),summary=document.createElement('summary'),panel=document.createElement('div');
 panel.className='beagu-release-panel';summary.textContent='버전 확인 중';
 details.append(summary,panel);footer.append(details);document.body.append(footer);
 const line=(label,value)=>{const p=document.createElement('p');p.textContent=label+': '+value;panel.append(p)};
 const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 fetch(source,{cache:'no-store',credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error('metadata');return r.json()}).then(m=>{
  if(m.schema!==1||!/^v\d+\.\d+\.\d+$/.test(m.version)||typeof m.name!=='string'||m.name.length>40)throw Error('invalid');
  const verified=typeof m.commit==='string'&&/^[a-f0-9]{40}$/.test(m.commit);
  const live=(location.hostname==='baeguindex.com'||location.hostname==='www.baeguindex.com')&&!location.pathname.startsWith('/_preview/')&&m.environment==='production'&&verified;
  summary.textContent=(live?'':'미배포 · ')+m.version+' · '+m.name;
  line('빌드 커밋',verified?m.commit.slice(0,12):'확인 전');
  line('배포 날짜',live&&validDate(m.deployedAt)?new Date(m.deployedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'확인 전');
  if(validDate(m.builtAt))line('빌드 시각',new Date(m.builtAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}));
  if(Array.isArray(m.changes)){const ul=document.createElement('ul');for(const s of m.changes.slice(0,8)){if(typeof s==='string'){const li=document.createElement('li');li.textContent=s.slice(0,160);ul.append(li)}}panel.append(ul)}
 }).catch(()=>{summary.textContent='버전 확인 불가';line('상태','배포 정보 확인 전')});
})();
