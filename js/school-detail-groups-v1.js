/* Collapsible approved data groups for authenticated school detail. Source fields are allowlisted by the server. */
(function(){
  'use strict';
  const TOPICS=Object.freeze([
    {key:'scale',title:'학교 규모'},
    {key:'teachers',title:'교원'},
    {key:'classes',title:'학급'},
    {key:'facilities',title:'시설·환경'},
    {key:'meals',title:'급식'},
    {key:'admin',title:'행정·업무'},
    {key:'domains',title:'분야별 점수'},
    {key:'other',title:'기타 승인정보'}
  ]);
  const KEYS=Object.freeze({
    students:'scale',district_housing_price_mean:'scale',
    teachers:'teachers',junior_teacher_ratio:'teachers',male_teacher_ratio:'teachers',
    september_participation_rate:'teachers',vice_principals:'teachers',lead_teachers:'teachers',
    classes:'classes',students_per_class:'classes',
    meal_place:'meals',milk_lunch:'meals',cafeterias:'meals',
    classrooms:'facilities',gym_spaces:'facilities',teacher_support_spaces:'facilities',
    land_area:'facilities',playground_area:'facilities',
    admin_employees:'admin',school_employees:'admin'
  });
  const ORDER=Object.freeze({
    scale:['students','district_housing_price_mean'],
    teachers:['teachers','junior_teacher_ratio','male_teacher_ratio','september_participation_rate','vice_principals','lead_teachers'],
    classes:['classes','students_per_class']
  });
  function classify(item){
    if(item?.group==='2025년 조사 영역별 점수 · 응답 표본 참고')return 'domains';
    const key=String(item?.factKey||'');
    if(KEYS[key])return KEYS[key];
    const label=String(item?.label||item?.title||'').replace(/\s+/g,'');
    const section=String(item?.section||item?.group||'').replace(/\s+/g,'');
    if(/급식|식당|우유|배식|영양/.test(label))return 'meals';
    if(/교원수|교사수|2급정교사|남교사|9·4참여|94참여|수석교사|교감/.test(label))return 'teachers';
    if(/학생수|재학생|공시가격|공시지가/.test(label))return 'scale';
    if(/학급수|학급당|특수학생수|학급현황/.test(label))return 'classes';
    if(/시설|운동장|주차|공간|체육관|휴게실|정수기|연구실|학교대지|건물|교실수|실내체육/.test(label))return 'facilities';
    if(/업무|행정|복무|결재|보고|분장|공문|출장|근무|담임행정|행사|예산|조퇴/.test(label))return 'admin';
    if(/급식|우유|식당/.test(section))return 'meals';
    if(/교원현황/.test(section))return 'teachers';
    if(/학생현황|학교규모/.test(section))return 'scale';
    if(/학급현황/.test(section))return 'classes';
    if(/시설|학교환경|근무환경|공간/.test(section))return 'facilities';
    if(/업무부하|행정|복무관행|업무분장|조직운영/.test(section))return 'admin';
    return 'other';
  }
  function panel(topic,count){
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
      const order=ORDER[topic.key];
      if(order){
        rows.sort((a,b)=>{
          const ia=order.indexOf(String(a.factKey||'')),ib=order.indexOf(String(b.factKey||''));
          const va=ia===-1?order.length:ia,vb=ib===-1?order.length:ib;
          return va-vb;
        });
      }
      const {details,body}=panel(topic.key,rows.length);
      rows.forEach(item=>render(body,item));
      host.append(details);
      count+=rows.length;
    }
    return count;
  }
  window.BeaguDetailGroups=Object.freeze({TOPICS,classify,panel,appendGrouped});
})();
