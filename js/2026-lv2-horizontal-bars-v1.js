/* 2026 Lv2 horizontal results. All widths require a reviewed 0–100 point metric.
 * Choice results have NO disclosed percentages; their highlights are not bars.
 * School data is sourced only from the signed beagu-level-api school response.
 */
(function(){
  'use strict';
  const scoreKey=/^Q(?:0[1-9]|1[0-3])$/;
  const make=(tag,cls,text)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=String(text);
    return node;
  };
  const number=value=>{
    if(typeof value!=='number'&&typeof value!=='string')return null;
    const raw=String(value).trim();
    if(!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(raw))return null;
    const n=Number(raw);
    return Number.isFinite(n)&&n>=0&&n<=100?n:null;
  };
  const scoreValue=metric=>{
    if(!metric||typeof metric!=='object'||!scoreKey.test(String(metric.key||''))||
       metric.unit!=='점')return null;
    return number(metric.value);
  };
  const benchmark=(metric,key)=>{
    if(metric.comparisonKind!=='average'||Number(metric.referenceYear)!==2026)return null;
    const value=metric[key];
    if(typeof value!=='string'||!value.endsWith('점'))return null;
    return number(value.slice(0,-1));
  };
  const display=value=>Number(value).toLocaleString('ko-KR',{maximumFractionDigits:2})+'점';
  function bar(label,value,kind){
    const row=make('div','beagu-lv2-horizontal-row beagu-lv2-'+kind);
    const top=make('div','beagu-lv2-bar-head');
    top.append(make('span','beagu-lv2-bar-label',label),
      make('strong','beagu-lv2-bar-number',display(value)));
    const meter=make('div','beagu-lv2-bar-track');
    meter.setAttribute('role','meter');
    meter.setAttribute('aria-label',label+' '+display(value));
    meter.setAttribute('aria-valuemin','0');
    meter.setAttribute('aria-valuemax','100');
    meter.setAttribute('aria-valuenow',String(value));
    const fill=make('div','beagu-lv2-bar-fill');
    fill.style.width=String(value)+'%';
    meter.append(fill);
    row.append(top,meter);
    return row;
  }
  function appendMetric(host,metric){
    const score=scoreValue(metric);
    if(score===null)return false;
    const card=make('div','beagu-lv2-score-card');
    const title=make('h5','beagu-lv2-score-heading');
    title.append(make('span','beagu-lv2-score-code',metric.key),
      document.createTextNode(String(metric.label||'2026 승인 점수')));
    card.append(title,bar('우리 학교',score,'school'));
    const local=benchmark(metric,'regionalAverage');
    const national=benchmark(metric,'nationalAverage');
    if(local!==null)card.append(bar('지역 평균',local,'regional'));
    if(national!==null)card.append(bar('전국 평균',national,'national'));
    if(local===null&&national===null)
      card.append(make('p','beagu-lv2-bar-unavailable',
        '2026년 지역·전국 비교값은 검증된 자료가 없어 표시하지 않습니다.'));
    card.append(make('p','beagu-lv2-bar-scale','0–100점 척도 · 막대 길이는 승인된 점수만 나타냅니다.'));
    host.append(card);
    return true;
  }
  function appendChoices(host,result,meta){
    if(!meta||!result||!['choice','multi','grid'].includes(meta.kind))return false;
    const options=meta.kind==='grid'?meta.columns:meta.options;
    if(!Array.isArray(options)||options.length<1||options.length>40||
       !Array.isArray(result.values)||result.values.some(v=>!options.includes(v)))return false;
    const selected=new Set(result.values);
    const multi=meta.kind==='multi'||result.questionId==='Q45';
    const group=make('div','beagu-lv2-choice-group');
    group.setAttribute('role','group');
    group.setAttribute('aria-label',(result.row>=0?meta.rows[result.row]+' · ':'')+
      '원본 선택지와 승인된 선택 항목');
    if(result.row>=0)group.append(make('h5','beagu-lv2-choice-subject',meta.rows[result.row]));
    const caption=make('p','beagu-lv2-choice-caption',
      multi?'체크된 보기 · 비율 미공개':'최빈 보기(동률 포함) · 비율 미공개');
    group.append(caption);
    const list=make('ul','beagu-lv2-choice-list');
    for(const option of options){
      if(typeof option!=='string'||option.length>240)continue;
      const active=selected.has(option);
      const item=make('li','beagu-lv2-choice'+(active?' is-selected':''));
      item.append(make('span','beagu-lv2-choice-name',option),
        make('span','beagu-lv2-choice-status',active?(multi?'선택됨':'최빈 선택'):'비율 미공개'));
      list.append(item);
    }
    group.append(list);
    host.append(group);
    return true;
  }
  window.Beagu2026Lv2Bars={scoreValue,appendMetric,appendChoices};
})();