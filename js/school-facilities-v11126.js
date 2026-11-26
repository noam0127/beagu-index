/* School facilities: only signed, already-released school answers.
 * No raw responses, regional estimates, counts, or new network requests. */
(function(){
'use strict';
const list=v=>Array.isArray(v)?v:[];
const norm=v=>typeof v==='string'?v.trim().replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*|^\d+점:\s*|^\d+\s+(?=\S)/,'').replace(/\s+/g,''):'';
const yearOf=v=>Number(v);
const defs=[
 ['rest','☕','교사 휴게실'],['extraRest','🛋️','별도 휴식공간'],['grade','🏢','학년 연구실'],['subject','🗂️','전담 연구실'],
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
  const y=yearOf(m?.year),q=m?.questionId;
  const fixed=y===2025?window.BeaguHistoricalClosedChoice?.(y,q,m?.modeOption):m?.modeOption;
  const v=norm(fixed);if(!v)continue;
  if(y===2025&&['Q36','Q37','Q43'].includes(q)){
   const id={Q36:'gradeWater',Q37:'toilet',Q43:'supplies'}[q];
   if(v==='있다')add(id,true,y);else if(v==='없다')add(id,false,y);
  }
  // 2023 Q11 labels verified against the contemporaneous announcement in
  // historical restoration candidate 8725ccc6; exact textual matches only.
  // A bare numeric code or an unpublished row must never activate an icon.
  if(y===2023&&q==='Q11'){
   if(compare(v,['학년연구실과 휴식장소가 있음','학년연구실 하나 있음']))add('grade',true,y);
   if(compare(v,['학년 연구실도 없음']))add('grade',false,y);
   if(compare(v,['여러 휴식장소들이 있음','학년연구실과 휴식장소가 있음']))add('extraRest',true,y);
   if(compare(v,['교실에서만 쉴 수 있음']))add('extraRest',false,y);
  }
  if((y===2024&&q==='Q11')||(y===2025&&q==='Q20')){
   const opts=y===2024?window.BeaguHistoricalQuestionnaire?.['2024']?.Q11:window.BeaguHistoricalQuestionnaire?.['2025']?.Q20;
   if(!Array.isArray(opts))continue;
   if(compare(v,opts.slice(0,4)))add('grade',true,y);
   if(compare(v,opts.slice(0,1)))add('extraRest',true,y);
   if(y===2024&&compare(v,opts.slice(4,5)))add('extraRest',false,y);
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

const groupNames=['업무·복무','학교 조직·지원','교육활동·학생·학부모 행사','교직원 행사·스포츠','급식·복지','2027학년도 예정 변경'];
const groupIcons=['📋','🤝','🎒','🏐','🍽️','📅'];
const binary25=[
 ['Q31',2,'🚌','수학여행·숙박체험'],['Q32',0,'📝','주간학습안내 관리자 결재'],['Q33',0,'🚸','교사 교통·주차지도'],['Q34',2,'📷','졸업앨범 교사 사진'],['Q35',1,'🏫','공모·지정 사업'],['Q38',4,'🥛','우유급식'],['Q39',4,'🍱','교실급식'],['Q40',2,'💬','상담주간'],['Q41',2,'🚸','녹색학부모회'],['Q42',0,'📝','조퇴 결재 학년부장'],['Q44',3,'🤝','친목회'],['Q45',1,'🏫','늘봄실장'],['Q46',0,'📅','토요일 근무'],['Q47',0,'📚','저경력 교사 학년교육과정 담당'],['Q48',1,'🛡️','민원대응팀'],['Q49',1,'👥','업무전담팀'],['Q50',2,'⚽','학생 체육부']
];
// Indices refer to the exact published 2025 choice catalog, not scores.
const choice25=[
 ['Q01',0,'🗣️','조퇴 구두보고 강제',[3,4],[0,1,2]],
 ['Q02',2,'🚌','교외체험학습',[1,2,3,4],[0]],
 ['Q05',0,'📅','방학 중 담임교사 근무',[1,2,3,4],[0]],
 ['Q08',2,'📄','가정 통지표 발송',[1,2,3,4],[0]],
 ['Q11',0,'📋','업무분장 원칙 존재',[0,1],[2,3]],
 ['Q13',3,'🤝','친목회 운영',[1,2,3,4],[0]],
 ['Q14',1,'🚪','학생 실제 분리',[0,1],[2,3,4]],
 ['Q18',4,'🍪','교직원 다과 예산',[0,1,2],[3]],
 ['Q19',0,'💬','학기말 협의회 실시',[0,1,2,3],[4]],
 ['Q24',0,'📋','특정 집단 비공식업무',[1,2,3,4],[0]],
 ['Q25',3,'🏐','교직원 스포츠활동',[1,2,3,4],[0]]
];
const multi25={
 Q03:[0,'📋',['강사 채용 및 강사 급여 관리','교과서 구입','기초생활수급자 통신비 지원','물품 구입(컴퓨터 부속품, 프린터 토너 등)','민방위훈련','방과후 자유수강권 관리','업무 메신저 및 학교 홈페이지 관리','예산 품의','유무선네트워크 및 전산실 관리','정보공시','정보기기(태블릿, PC, TV) 관리(불용처리 포함)','평생교육','하드디스크 파기 작업','학운위 운영','CCTV 관리'],'안함'],
 Q04:[2,'🎒',['교장선생님 훈화말씀이 있는 전교생 아침조회(교실방송)','교장선생님 훈화말씀이 있는 전교생 아침조회(운동장 또는 강당/체육관)','그 밖의 학부모 초청 행사','바자회','수련회','수학여행','운동회','축제','학부모 공개수업','학생회선거','학예회'],'안함']
};
const grids26={
 Q27:[0,'📋',['주간학습안내를 정기적으로 작성한다','주간학습안내에 관리자 결재를 받는다','조퇴 결재선에 학년부장이 포함된다','학교가 정한 토요일 근무가 있다','교사가 교문 교통지도·주차지도를 맡는다'],['있다'],['없다']],
 Q32:[1,'🤝',['학부모 민원 1차 대응팀','수업이 적거나 없는 교사로 구성된 업무전담팀','학교 대표번호에 응대하는 담당자·체계','늘봄실장','외부인 출입 통제','학부모 등 방문예약제','IB 등 공모·지정 사업을 현재 운영한다'],['있다'],['없다']],
 Q33:[1,'🧑‍🏫',['위기학생 지원','특수교육 대상 학생 지원','다문화학생 지원'],['있다'],['없다']],
 Q40:[4,'🍽️',['우유급식','교실급식','학교 예산으로 교직원 다과·간식을 지원한다','교직원이 다과비·간식비를 의무적으로 부담한다','졸업앨범에 교사 사진을 싣는다'],['있다'],['없다']],
 Q46:[5,'📅',['교장 변경','교감 변경','학교 이전','건물 공사','시설 개선','업무분장 체계 개편','조직·팀 구성 개편'],['변경 예정'],['변경 없음으로 확인']],
 Q47:[5,'📊',['학급 수','학생 수','교원 수'],['증가 예정','감소 예정'],['유지 예정']],
 Q48:[5,'🏫',['연구학교','혁신학교','IB 운영','기타 사업 진행 학교'],['새로 시작','계속 운영(단계 변경 포함)'],['운영 종료','현재도 없고 도입 계획도 없음']]
};
const multi26={
 Q26:[0,'📋',['교과서 구입','물품 구입','예산 품의','강사 채용','강사 급여 관리','방과후 자유수강권 관리','학생 통신비 지원','학교운영위원회 운영','정보공시','평생교육','민방위훈련','유무선 네트워크 관리','전산실 관리','하드디스크 파기','업무 메신저 관리','학교 홈페이지 관리','CCTV 관리','정보기기 관리·불용처리(프린터 제외)','프린터 관리'],'위 업무 중 교사가 담당하는 업무가 없다'],
 Q35:[2,'🎒',['교장 훈화가 있는 전교생 방송조회','교장 훈화가 있는 전교생 집합조회','학교 운동회·체육대회','학예 발표회·학교축제','공개 수업','교내 대회','당일 현장체험학습','수학여행·기타 숙박체험','당일 수련활동','숙박 수련활동','교외 생존수영','교내 생존수영','바자회','학생 자치회','학생회 선거','학생 동아리','청소년단체(스카우트, 아람단)','상담 주간','학부모 총회','그 밖의 학부모 초청 행사','학부모회 운영','녹색학부모회 운영','학생 운동부 운영'],'위 항목에 해당하는 행사·활동이 없다'],
 Q36:[3,'🤝',['교직원 친목회 운영','친목회 행사','그 밖의 교직원 동아리','교직원 친목 목적 숙박여행','교육과정 워크숍','숙박을 포함한 업무 워크숍·연수','상조회'],'위 항목에 해당하는 행사·활동이 없다'],
 Q37:[3,'🏐',['배구','피클볼','탁구','배드민턴','등산·트레킹','걷기·러닝','축구·풋살','족구','농구','테니스','볼링','요가·필라테스','그 밖의 스포츠 종목'],'교직원 스포츠활동을 운영하지 않는다']
};
const choice26={
 Q12:[0,'📅','방학 중 근무조 운영',['희망자만 참여한다','희망과 관계없이 배정하지만 조정할 수 있다','희망과 관계없이 배정하고 조정하기 어렵다'],['운영하지 않는다']],
 Q13:[0,'📋','성별·나이 비공식업무',['요청은 있지만 자유롭게 거절할 수 있다','거절하면 눈치나 부담을 준다','사실상 거절하기 어렵다'],['그런 일이 없다']],
 Q21:[0,'📞','퇴근 후·휴일 업무연락',['1일','2~3일','4~7일','8일 이상'],['0일']],
 Q28:[1,'🛡️','관리자·별도팀 민원 최초 대응',['관리자나 별도 담당팀'],['담임교사','담임교사와 부장교사 등']],
 Q29:[1,'💬','하이톡 사용',['일부 교사가 자발적으로 사용하고, 다른 교사는 다른 방식으로 소통한다','대부분의 교사가 자발적으로 사용하며, 사용하지 않아도 불이익이 없다','많은 교사가 사용하며, 사용하지 않으면 동료 사이에 눈치나 부담이 있다','학교·관리자의 권고로 사용하며, 원하지 않을 때 거절하기 어렵다','학교에서 공식 소통수단으로 지정하여 사용하고 있다(개인별 자율성은 판단하기 어렵다)'],['하이톡을 사용하지 않거나 학교에 도입되어 있지 않다']],
 Q30:[1,'🚪','수업교사 외 인력의 분리 대응',['다른 담당자가 맡아 교사는 수업을 계속한다','다른 담당자가 맡지만 일관되지는 않다'],['분리할 여건이 없어 수업 교사가 교실에서 대응한다']],
 Q34:[2,'🚌','교외 체험학습',['1회','2회','3회 이상'],['0회']]
};
const sportIcons=['🏐','🏓','🏓','🏸','🥾','🚶','⚽','⚽','🏀','🎾','🎳','🧘','🏃'];
const groupIcon=(q,i,fallback)=>q==='Q37'?sportIcons[i]||fallback:fallback;
const classify=(values,yes,no)=>values.length&&values.every(v=>yes.includes(v))?true:values.length&&values.every(v=>no.includes(v))?false:null;
function collectFacts(modes,results,tier,selections=[]){
 if(![1,2].includes(tier))return [];
 const out=new Map();
 const add=(year,q,index,group,icon,label,active)=>{
  if(active===null)return;
  const id=year+':'+q+':'+index;
  if(out.has(id)){const prior=out.get(id);if(prior.active!==active)prior.active=null;return;}
  out.set(id,{id,year,questionId:q,group,icon,label,active});
 };
 const historical=window.BeaguHistoricalQuestionnaire?.['2025']||{};
 for(const m of list(modes)){
  if(Number(m?.year)!==2025||typeof m.modeOption!=='string')continue;
  const q=m.questionId,fixed=window.BeaguHistoricalClosedChoice?.(2025,q,m.modeOption);
  if(!fixed)continue;
  const v=norm(fixed);
  const binary=binary25.find(x=>x[0]===q);
  if(binary&&Array.isArray(historical[q])&&historical[q].join('|')==='있다|없다|모름'){
   const [,g,icon,label]=binary;add(2025,q,0,g,icon,label,v==='있다'?true:v==='없다'?false:null);
  }
  const choice=choice25.find(x=>x[0]===q);
  if(choice&&Array.isArray(historical[q])){
   const [,g,icon,label,yes,no]=choice;
   const i=historical[q].indexOf(fixed);
   add(2025,q,0,g,icon,label,yes.includes(i)?true:no.includes(i)?false:null);
  }
 }
 const addMulti=(year,q,values,spec,catalog)=>{
  if(!spec||!Array.isArray(values)||!values.length||!Array.isArray(catalog)||values.some(v=>typeof v!=='string'||!catalog.includes(v)))return;
  const [g,icon,labels,none]=spec;
  if(!catalog.includes(none)||(year!==2025&&!labels.every(v=>catalog.includes(v))))return;
  // An omitted choice is unknown; only an explicit standalone "none" supplies X.
  const absent=values.every(v=>v===none);
  labels.forEach((label,i)=>{if(catalog.includes(label)&&(values.includes(label)||absent))add(year,q,i,g,groupIcon(q,i,icon),label,values.includes(label));});
 };
 for(const s of list(selections))if(Number(s?.year)===2025)addMulti(2025,s.questionId,s.selectedOptions,multi25[s.questionId],historical[s.questionId]);
 if(tier===2){
  const catalog=window.Beagu2026Questionnaire||{};
  for(const r of list(results)){
   const q=r?.questionId,m=catalog[q];if(!m||!Number.isInteger(r.row)||!Array.isArray(r.values)||!r.values.length)continue;
   const allowed=m.kind==='grid'?m.columns:m.options;
   if(!Array.isArray(allowed)||r.values.some(v=>typeof v!=='string'||!allowed.includes(v)))continue;
   if(grids26[q]&&m.kind==='grid'){
    const [g,icon,labels,yes,no]=grids26[q],label=labels[r.row];
    if(typeof label!=='string'||m.rows?.[r.row]!==label)continue;
    add(2026,q,r.row,g,icon,q==='Q47'?label+' 변경 예정':q==='Q48'?label+' 운영 예정':label,classify(r.values,yes,no));
   }else if(multi26[q]&&m.kind==='multi'&&r.row===-1)addMulti(2026,q,r.values,multi26[q],allowed);
   else if(choice26[q]&&m.kind==='choice'&&r.row===-1){
    const [g,icon,label,yes,no]=choice26[q];add(2026,q,0,g,icon,label,classify(r.values,yes,no));
   }else if(q==='Q22'&&r.row===0&&m.kind==='grid'&&m.rows?.[0]==='자격을 갖춘 동료교사가 장기재직휴가를 실제로 사용한 사례가 있다'){
    add(2026,q,0,4,'🌴','장기재직휴가 실제 사용 사례',classify(r.values,['그렇다','매우 그렇다'],['전혀 그렇지 않다','그렇지 않다']));
   }
  }
 }
 return [...out.values()].filter(x=>x.active!==null).sort((a,b)=>b.year-a.year||a.group-b.group||a.id.localeCompare(b.id,'ko'));
}

function render(host,modes,results,tier,selections=[]){
 const items=collect(modes,results,tier),facts=collectFacts(modes,results,tier,selections);
 host.replaceChildren();host.hidden=!items.length&&!facts.length;
 if(host.hidden)return;
 const node=(tag,cls,value)=>{const n=document.createElement(tag);n.className=cls;if(value!==undefined)n.textContent=value;return n;};
 host.className='beagu-facilities';
 host.append(node('h3','beagu-facilities-heading','한 눈에 보는 학교'));
 const grid=node('ul','beagu-facilities-grid');
 for(const f of items){
  const li=node('li','beagu-facility '+(f.active?'is-present':'is-absent'));
  li.setAttribute('aria-label',f.label+' · '+(f.active?'있음 확인':'없음 확인')+' · '+f.years.join(', ')+'년');
  li.title=f.years.join(', ')+'년 '+(f.active?'있음 확인':'없음 확인');
  const icon=node('span','beagu-facility-icon',f.icon);icon.setAttribute('aria-hidden','true');
  li.append(icon,node('span','beagu-facility-label',f.label),node('span','beagu-facility-state',f.active?'O':'X'));grid.append(li);
 }
 if(items.length){
  // Preserve the original facility union and first-grid contract.
  grid.setAttribute('aria-label','시설·비품 · 역대 공개 조사');
  host.append(grid,node('p','beagu-facilities-caption','시설·비품: 역대 공개 조사에서 확인 · O 있음 / X 없음만 확인. 현재 시설과 다를 수 있습니다.'));
 }
 for(const year of [2026,2025]){
  const annual=facts.filter(f=>f.year===year);if(!annual.length)continue;
  const section=node('section','beagu-facts-year');section.append(node('h4','beagu-facts-year-title',year+'년 조사 · 분야별 정보'));
  for(const [g,label] of groupNames.entries()){
   const matches=annual.filter(f=>f.group===g);if(!matches.length)continue;
   const group=node('section','beagu-facts-group');
   group.append(node('h5','beagu-facts-group-title',groupIcons[g]+' '+label));
   const factsGrid=node('ul','beagu-facilities-grid');factsGrid.setAttribute('aria-label',year+'년 '+label);
   for(const f of matches){
    const li=node('li','beagu-facility '+(f.active?'is-present':'is-absent'));
    const state=f.active?'O':'X';
    li.setAttribute('aria-label',f.label+' · '+state+' · '+year+'년 공개 조사');
    li.title=year+'년 '+f.questionId+' · '+state+' 응답';
    const icon=node('span','beagu-facility-icon',f.icon);icon.setAttribute('aria-hidden','true');
    li.append(icon,node('span','beagu-facility-label',f.label),node('span','beagu-facility-state',state));factsGrid.append(li);
   }
   group.append(factsGrid);section.append(group);
  }
  host.append(section);
 }
 if(facts.length)host.append(node('p','beagu-facilities-caption','O: 해당함 · X: 해당하지 않음. 공개된 조사 응답 기준이며 학교의 공식 확인이나 평가가 아닙니다. 모름·미선택·서로 충돌하는 응답은 표시하지 않습니다. 2027년 예정 변경은 2026년 응답 시점의 계획입니다.'));
}
// Keep the exact annual questions and comparison values reachable, but avoid
// repeating facility-only cards in the main view. Explicit searches open them.
function fold(host,year,{search=false}={}){
 if(search||![2025,2026].includes(Number(year)))return;
 const ids=Number(year)===2025?['Q36','Q37','Q43']:['Q41','Q42','Q43','Q44','Q45'];
 const groups=new Map();
 for(const row of host.querySelectorAll('.historical-question-row,.beagu-question-block,.question-row')){
  const label=row.querySelector('.beagu-question-number,.question-code,h4')?.textContent||'';
  const id=label.trim().match(/^Q\d{2}\b/)?.[0];
  if(!ids.includes(id)||!row.parentElement)continue;
  const parent=row.parentElement;
  if(!groups.has(parent))groups.set(parent,[]);
  groups.get(parent).push(row);
 }
 for(const [parent,rows] of groups){
  const details=document.createElement('details');details.className='beagu-facilities-source';
  const summary=document.createElement('summary');summary.textContent='연도별 시설 문항 원문·세부 결과 ('+rows.length+'개)';
  details.append(summary);
  parent.insertBefore(details,rows[0]);details.append(...rows);
  const input=host.querySelector('.beagu-question-input');
  if(input)input.addEventListener('input',()=>{
   details.hidden=rows.every(row=>row.hidden);
   if(input.value.trim()&&!details.hidden)details.open=true;
  });
 }
}
window.BeaguSchoolFacilities={collect,collectFacts,render,fold};
})();
