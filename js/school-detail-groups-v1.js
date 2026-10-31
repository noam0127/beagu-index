/* Collapsible approved-data groups for Lv.1/Lv.2 school detail.
 * Presentation only: NEVER fetches, stores, infers, or authorizes protected data.
 * Its caller must pass only fields released by the existing server checks.
 */
(function(){
  'use strict';
  const TOPICS=Object.freeze([
    {key:'scale',title:'학교 규모'},
    {key:'facilities',title:'시설·환경'},
    {key:'meals',title:'급식'},
    {key:'admin',title:'행정·업무'},
    {key:'other',title:'기타 승인정보'}
  ]);
  function classify(item){
    const label=String(item?.label||item?.title||'').replace(/\s+/g,'');
    const section=String(item?.section||item?.group||'').replace(/\s+/g,'');
    // Use specific field names before broad section names so mixed historical
    // sections (e.g. "학교·교원·시설 기본정보") do not misclassify student counts.
    if(/급식|식당|우유|배식|영양/.test(label))return 'meals';
    if(/학생수|교원수|교사수|학급수|학급당|재학생|학교규모|특수학생수|기간제교원수/.test(label))
      return 'scale';
    if(/시설|운동장|주차|공간|체육관|휴게실|정수기|연구실|학교대지|건물|교실수|실내체육/.test(label))
      return 'facilities';
    if(/업무|행정|복무|결재|보고|분장|공문|출장|근무|담임행정|행사|예산|조퇴/.test(label))
      return 'admin';
    if(/급식|우유|식당/.test(section))return 'meals';
    if(/학교규모|학급현황|교원현황|학생현황/.test(section))return 'scale';
    if(/시설|학교환경|근무환경|공간/.test(section))return 'facilities';
    if(/업무부하|행정|복무관행|업무분장|조직운영/.test(section))return 'admin';
    return 'other';
  }
  function panel(topic, count){
    const data=TOPICS.find(t=>t.key===topic)||TOPICS[TOPICS.length-1];
    const details=document.createElement('details');
    details.className='beagu-detail-group';
    details.dataset.topic=data.key;
    const summary=document.createElement('summary');
    summary.className='beagu-detail-summary';
    const name=document.createElement('span');
    name.className='beagu-detail-summary-title';
    name.textContent=data.title;
    const meta=document.createElement('small');
    meta.className='beagu-detail-count';
    if(Number.isInteger(count)&&count>=0)meta.textContent=count+'개 승인항목';
    const chevron=document.createElement('span');
    chevron.className='beagu-detail-chevron';
    chevron.setAttribute('aria-hidden','true');
    chevron.textContent='⌄';
    summary.append(name,meta,chevron);
    const body=document.createElement('div');
    body.className='beagu-detail-body';
    details.append(summary,body);
    // The native <details> control is accessible with keyboard and screen reader.
    // All groups start closed on desktop and mobile to reduce long scrolling.
    details.open=false;
    return {details,body};
  }
  function appendGrouped(host,items,render){
    const input=Array.isArray(items)?items:[];
    if(typeof render!=='function')throw new TypeError('RENDERER_REQUIRED');
    const map=new Map(TOPICS.map(topic=>[topic.key,[]]));
    for(const item of input){
      if(!item||typeof item!=='object')continue;
      map.get(classify(item)).push(item);
    }
    let count=0;
    for(const topic of TOPICS){
      const rows=map.get(topic.key);
      if(!rows.length)continue;
      const {details,body}=panel(topic.key,rows.length);
      rows.forEach(item=>render(body,item));
      host.append(details);
      count+=rows.length;
    }
    return count;
  }
  window.BeaguDetailGroups=Object.freeze({TOPICS,classify,panel,appendGrouped});
})();
