/* School facilities: only signed, already-released school answers.
 * No raw responses, regional estimates, counts, or new network requests. */
(function(){
'use strict';
const list=v=>Array.isArray(v)?v:[];
const norm=v=>typeof v==='string'?v.trim().replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*|^\d+점:\s*|^\d+\s+(?=\S)/,'').replace(/\s+/g,''):'';
const yearOf=v=>Number(v);
const defs=[
 ['rest','☕','교사 휴게실'],['grade','🏢','학년 연구실'],['subject','🗂️','전담 연구실'],
 ['toilet','🚻','교직원 화장실'],['pantry','🍵','탕비 공간'],['supplies','📦','학습준비물실'],
 ['shower','🚿','샤워 공간'],['nursing','🍼','수유 공간'],['gym','🏋️','체력단련실'],
 ['dining','🍽️','교직원 식당'],['parent','💬','학부모 상담실'],['student','🪑','학생 상담실'],
 ['wee','🤝','Wee클래스'],['ev','🔌','전기차 충전시설'],['lift','🛗','엘리베이터'],
 ['separate','🚪','학생 분리 장소'],['parking','🅿️','교내 주차 이용'],
 ['pc','🖥️','교사용 데스크톱 PC'],['dual','🖥️','듀얼 모니터'],['laptop','💻','교사용 노트북'],['locker','🗄️','개인 사물함'],
 ['tv','📺','교실 TV'],['board','🖊️','전자칠판'],['air','🌬️','공기청정기'],['hvac','❄️','교실 냉난방기'],['fan','🌀','선풍기'],['wind','🍃','에어컨 바람막이'],
 ['cool','❄️','냉방'],['heat','♨️','난방'],['hotwater','🚰','화장실 온수'],
 ['gradeWater','🚰','연구실 정수기'],['water','💧','일반 정수기'],['ice','🧊','얼음정수기'],['fridge','🧊','냉장고'],['microwave','🍲','전자레인지'],['coffee','☕','커피머신'],['massage','💺','안마의자'],['exercise','🏋️','운동 기구'],['mono','🖨️','흑백 프린터'],['color','🖨️','컬러 프린터'],['copier','📄','복합기'],['wifi','📶','안정적 와이파이'],['wifiWeak','📶','불안정한 와이파이'],['phone','☎️','녹음 가능한 업무용 전화']
];
const gridIds={
 Q41:['pc','dual','laptop','locker'],
 Q42:['rest','grade','subject','toilet','pantry','supplies','shower','nursing','gym','dining','parent','student','wee','ev','lift'],
 Q45:['water','ice','fridge','microwave','coffee','massage','exercise','mono','color','copier','wifi','wifiWeak','phone']
};
const multiIds={Q43:['tv','board','air','hvac','fan','wind'],Q44:['cool','heat','hotwater']};
const expectedRows={
 Q41:['교사용 데스크톱 PC','듀얼 모니터 환경','교사용 노트북','개인 사물함'],
 Q42:['교사 휴게실','학년 연구실','전담 연구실','교직원 화장실','탕비 공간','학습준비물실','샤워 공간','수유 공간','체력단련실','교직원 식당','학부모 상담실','학생 상담실(Wee클래스 제외)','Wee클래스','교직원이 이용할 수 있는 전기차 충전시설','엘리베이터'],
 Q45:['일반 정수기(얼음 기능 없음)','얼음정수기','냉장고','전자레인지','커피머신','안마의자','운동 기구','흑백 전용 프린터(복합기 제외)','컬러프린터(복합기 제외)','복합기','와이파이(안정적으로 연결되는 공간)','와이파이(연결이 자주 끊기거나 불안정한 공간)','녹음 가능한 학교 제공 업무용 전화']
};
const expectedMulti={Q43:['TV','전자칠판','공기청정기','냉난방기','선풍기','에어컨바람막이'],Q44:['냉방','난방','온수']};
function collect(modes,results,tier){
 if(![1,2].includes(tier))return [];
 const out=new Map();
 const add=(id,yes,year)=>{let item=out.get(id);if(!item){item={yes:new Set(),no:new Set()};out.set(id,item);}item[yes?'yes':'no'].add(year);};
 const compare=(v,values)=>values.some(x=>norm(x)===v);
 for(const m of list(modes)){
  const y=yearOf(m?.year),q=m?.questionId,v=norm(m?.modeOption);if(!v)continue;
  if(y===2025&&['Q36','Q37','Q43'].includes(q)){
   const id={Q36:'gradeWater',Q37:'toilet',Q43:'supplies'}[q];
   if(v==='있다')add(id,true,y);else if(v==='없다')add(id,false,y);
  }
  if((y===2024&&q==='Q11')||(y===2025&&q==='Q20')){
   const opts=y===2024?window.BeaguHistoricalQuestionnaire?.['2024']?.Q11:window.Beagu2025ObservedChoices?.Q20;
   if(!Array.isArray(opts))continue;
   if(compare(v,opts.slice(0,4)))add('grade',true,y);
   if(y===2024&&compare(v,opts.slice(4,5)))add('grade',false,y);
   // A general resting place is not necessarily a dedicated teacher lounge.
  }
  if((y===2024&&q==='Q12')||(y===2025&&q==='Q14')){
   const yes=y===2024?['분리 장소가 여러 곳이며 실제 분리된다','단 한 곳뿐이며 실제 분리된다','장소는 있으나 실제 분리되지 않는다']:['수업중인 교사 외의 인력에 의해 여러 장소로 실제로 분리된다','장소는 있으나 실제 분리는 안 된다'];
   if(compare(v,yes))add('separate',true,y);
   if(v===norm('분리 장소가 없다'))add('separate',false,y);
  }
 }
 if(tier===2){
  const catalog=window.Beagu2026Questionnaire||{};
  for(const r of list(results)){
   const q=r?.questionId,m=catalog[q];
   if(!m||!Array.isArray(r.values)||!r.values.length||!Number.isInteger(r.row))continue;
   const options=m.kind==='grid'?m.columns:m.options;
   if(!Array.isArray(options)||r.values.some(v=>typeof v!=='string'||!options.includes(v)))continue;
   if(gridIds[q]&&m.kind==='grid'&&r.row>=0&&m.rows?.[r.row]===expectedRows[q][r.row]){
    const id=gridIds[q][r.row];if(!id)continue;
    const yes=q==='Q41'?['개인별로 제공','공동으로 제공']:q==='Q42'?['전용 공간으로 이용 가능','다른 용도와 함께 쓰지만 이용 가능','공간은 있으나 이용하기 어려움']:['교무실·행정실','학년 연구실','교실','그 밖의 교내 공간'];
    const no=q==='Q41'?'제공하지 않음':q==='Q42'?'공간 없음':'이용 가능한 비품·통신시설 없음';
    if(r.values.some(v=>yes.includes(v)))add(id,true,2026);
    else if(r.values.every(v=>v===no))add(id,false,2026);
    if(q==='Q45'&&r.row<=1&&r.values.includes('학년 연구실'))add('gradeWater',true,2026);
   }else if(multiIds[q]&&m.kind==='multi'&&r.row===-1){
    for(const [i,label] of expectedMulti[q].entries())if(m.options[i]===label&&r.values.includes(label))add(multiIds[q][i],true,2026);
    // Unselected checkboxes and empty submissions are not explicit negatives.
   }else if(q==='Q39'&&m.kind==='choice'&&r.row===-1){
    if(r.values.some(v=>['거의 부족하지 않다','가끔 부족하다','자주 부족하다'].includes(v)))add('parking',true,2026);
    else if(r.values.every(v=>v==='교내에 주차할 수 없다'))add('parking',false,2026);
   }
  }
 }
 return defs.filter(([id])=>out.has(id)).map(([id,icon,label])=>{
  const evidence=out.get(id),active=evidence.yes.size>0;
  return {id,icon,label,active,years:[...(active?evidence.yes:evidence.no)].sort()};
 });
}
function render(host,modes,results,tier){
 const items=collect(modes,results,tier);
 host.replaceChildren();host.hidden=!items.length;
 if(!items.length)return;
 const node=(tag,cls,value)=>{const n=document.createElement(tag);n.className=cls;if(value!==undefined)n.textContent=value;return n;};
 host.className='beagu-facilities';
 host.append(node('h3','beagu-facilities-heading','학교 시설'));
 const grid=node('ul','beagu-facilities-grid');
 for(const f of items){
  const li=node('li','beagu-facility '+(f.active?'is-present':'is-absent'));
  li.setAttribute('aria-label',f.label+' · '+(f.active?'있음 확인':'없음 확인')+' · '+f.years.join(', ')+'년');
  li.title=f.years.join(', ')+'년 '+(f.active?'있음 확인':'없음 확인');
  const icon=node('span','beagu-facility-icon',f.icon);icon.setAttribute('aria-hidden','true');
  li.append(icon,node('span','beagu-facility-label',f.label),node('span','beagu-facility-state',f.active?'O':'X'));grid.append(li);
 }
 host.append(grid,node('p','beagu-facilities-caption','역대 공개 조사에서 확인된 시설 · O 있음 / X 없음만 확인 · 미확인 항목 제외. 현재 시설과 다를 수 있습니다.'));
}
window.BeaguSchoolFacilities={collect,render};
})();
