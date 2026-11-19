/* 『나의 OO한 학급일지』 2단계: 설문 문항 -> 문학적 사건 설계.
 * 출처: public-statistics-question-catalog-v1.json 및 2026 원문 메타데이터.
 * 학교별 실응답을 이 모듈에 넣지 않는다. 별도 승인 API만 사용한다.
 */
(function(root){
'use strict';
const VERSION='class-diary-narrative/v1';
const YEARS=[2023,2024,2025,2026];
const THEMES=Object.freeze({
  "community": {
    "day": 5,
    "place": "금요일 방과 후 · 학년연구실",
    "brief": "함께라는 말",
    "scene": "누군가 저녁을 같이 먹자고 했다. 의자를 밀고 일어나는 사람도 있었고, 가방끈을 만지작거리는 사람도 있었다. {colleague}이 내 눈치를 살피다 조용히 웃었다.",
    "dialogue": "“오늘은 다들 바쁘죠? 시간 되는 사람끼리만 가요.”"
  },
  "autonomy": {
    "day": 2,
    "place": "화요일 방과 후 · 회의실",
    "brief": "다 하지 못한 말",
    "scene": "회의록에 동의라는 글자가 올라갔다. 나는 펜을 내려놓았다. 옆자리에서는 {colleague}이 자료 한 장을 내 쪽으로 밀었다.",
    "dialogue": "“아까 하시려던 말 있잖아요. 지금 해도 괜찮아요.”"
  },
  "workload": {
    "day": 1,
    "place": "월요일 아침 · 학년연구실",
    "brief": "복합기 앞에서",
    "scene": "복합기가 종이를 한 장 더 뱉었다. 주안 옆에는 동의서 취합표가 놓였고, K-에듀파인 품의 창은 아직 켜져 있었다. {colleague}이 문을 열고 들어왔다.",
    "dialogue": "“이거 혼자 하세요? 제가 어느 쪽부터 볼까요?”"
  },
  "governance": {
    "day": 3,
    "place": "수요일 오후 · 교직원전체회의 뒤",
    "brief": "끝난 회의의 뒷말",
    "scene": "회의실 의자들이 한꺼번에 움직였다. 끝난 줄 알았던 안건이 복도에서 다시 나왔다. 나는 가방을 메다 멈춰 섰다.",
    "dialogue": "“그 얘기는 다음 학년회의 때 다시 해 보죠.”"
  },
  "student": {
    "day": 4,
    "place": "목요일 3교시 · 교실",
    "brief": "접힌 종이",
    "scene": "모둠 활동이 끝났는데도 한 아이가 종이를 접었다 폈다. 말할 차례를 놓친 모양이었다. 나는 그 아이 책상 옆에 쪼그려 앉았다.",
    "dialogue": "“아까 하려던 말, 지금 해도 돼.”"
  },
  "guardians": {
    "day": 4,
    "place": "목요일 오후 · 상담 공간",
    "brief": "전화가 끊긴 뒤",
    "scene": "보호자와 통화를 끝내고 책상 위의 교외체험학습신청서를 치웠다. 아이들 이야기는 아직 서로 달랐다. 나는 메모지 한 장을 더 꺼냈다.",
    "dialogue": "“확인한 것부터 말씀드릴게요. 조금만 시간을 주세요.”"
  },
  "safety": {
    "day": 4,
    "place": "목요일 쉬는 시간 · 복도",
    "brief": "복도 끝에서",
    "scene": "복도 끝에서 아이들이 한꺼번에 멈춰 섰다. 누군가 울먹였다. 나는 먼저 아이들 사이를 벌려 놓고 무릎을 굽혔다.",
    "dialogue": "“어디 다친 데는 없어? 천천히 말해 봐.”"
  },
  "event": {
    "day": 5,
    "place": "금요일 오후 · 교실과 운동장",
    "brief": "행사 준비",
    "scene": "운동장까지 들고 내려갈 물건이 생각보다 많았다. 학년연구실에 돌아오니 주안의 준비물 칸은 아직 비어 있었다. 창가에 놓인 물병에 손을 뻗었다.",
    "dialogue": "“이건 제가 들고 갈게요. 나머지는 같이 나눠요.”"
  },
  "wellbeing": {
    "day": 6,
    "place": "토요일 오후 · 동네 서점",
    "brief": "아무 일 없는 오후",
    "scene": "서점 유리문에 햇빛이 비쳤다. 책을 하나 꺼냈다가 다시 꽂았다. 오늘만큼은 누구에게도 급히 답할 일이 없었다.",
    "dialogue": "“쉬는 날엔 그냥 쉬어도 되잖아요.”"
  },
  "facilities": {
    "day": 2,
    "place": "화요일 오후 · 학년연구실 자료장",
    "brief": "찾을 수 없는 물건",
    "scene": "자료장 맨 위 칸에서 오래된 활동지가 쏟아졌다. 필요한 교구는 보이지 않았다. {colleague}이 밑에서 상자를 받아 주었다.",
    "dialogue": "“잠깐요, 같이 찾아봐요. 없으면 품의 올리고요.”"
  },
  "future": {
    "day": 7,
    "place": "일요일 밤 · 집의 책상",
    "brief": "다음 주의 자리",
    "scene": "책상 위 수첩을 펼쳤다. 빈칸을 하나 남겨 둔 채 펜 끝을 톡톡 두드렸다. 다음 주에는 무슨 일이 생길까.",
    "dialogue": "“월요일이 되면 알겠죠. 오늘은 여기까지만 해요.”"
  },
  "classroom": {
    "day": 3,
    "place": "수요일 4교시 · 모둠 교실",
    "brief": "아직 남은 질문",
    "scene": "주안에 적힌 활동은 끝났는데 아이 하나가 손을 내리지 않았다. 나는 시계를 보다가 그 아이에게 고개를 끄덕였다.",
    "dialogue": "“응, 더 얘기해 봐. 우리 아직 시간 있어.”"
  }
});
const TOPIC_IDS=Object.freeze({
  2023:{
    community:'Q01 Q04 Q06 Q12',
    autonomy:'Q03 Q09',
    workload:'Q02 Q05 Q08 Q13',
    classroom:'Q14',
    event:'Q07',
    wellbeing:'Q11',
    safety:'Q10'
  },
  2024:{
    community:'Q01 Q04 Q06',
    autonomy:'Q02 Q09',
    workload:'Q05 Q08 Q13',
    classroom:'Q14',
    event:'Q07',
    wellbeing:'Q11',
    guardians:'Q03',
    safety:'Q10 Q12'
  },
  2025:{
    autonomy:'Q01 Q11 Q13 Q19 Q21 Q24 Q25 Q42 Q47',
    workload:'Q03 Q05 Q12 Q15 Q16 Q22 Q23 Q46',
    classroom:'Q07 Q08',
    governance:'Q10 Q26 Q48 Q49',
    community:'Q17 Q28 Q44',
    event:'Q02 Q04 Q31 Q35 Q40 Q41 Q50',
    safety:'Q06 Q09 Q14 Q30',
    guardians:'Q29',
    student:'Q27',
    wellbeing:'Q18 Q20 Q36 Q37',
    facilities:'Q32 Q33 Q34 Q38 Q39 Q43 Q45'
  },
  2026:{
    autonomy:'Q01 Q02 Q03 Q04 Q05 Q06 Q07 Q08 Q09 Q12 Q13 Q22 Q27',
    governance:'Q15 Q16 Q17 Q32',
    community:'Q14 Q36 Q37 Q49 Q50',
    workload:'Q18 Q19 Q20 Q21 Q24',
    classroom:'Q23 Q25',
    guardians:'Q10 Q28 Q29',
    student:'Q11 Q33',
    safety:'Q30 Q31',
    event:'Q34 Q35',
    wellbeing:'Q38 Q39 Q40 Q41',
    facilities:'Q42 Q43 Q44 Q45',
    future:'Q46 Q47 Q48',
    /* Q26 administrative multi-choice: separately checked below */
  }
});
const SENSITIVE=new Set([
  '2023:Q06','2023:Q10','2024:Q06','2024:Q10','2025:Q06','2025:Q09','2025:Q29','2025:Q30',
  '2026:Q03','2026:Q13','2026:Q31'
]);
const ID=/^Q\d{2}$/;
const truncate=(s,n)=>typeof s==='string'?s.trim().slice(0,n):'';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function themeFor(year,id){
  const obj=TOPIC_IDS[year]||{};
  const found=Object.keys(obj).filter(theme=>obj[theme].split(' ').includes(id));
  if(year===2026&&id==='Q26')return 'workload';
  if(found.length!==1)throw Error('INVALID_OR_MISSING_THEME_'+year+':'+id+':'+found.join('/'));
  return found[0];
}
function createBlueprint(catalog,q2026){
  if(!catalog||!catalog.years||!q2026||typeof q2026!=='object')throw Error('CATALOG_REQUIRED');
  const entries=[],seen=new Set(), issues=[];
  for(const year of YEARS){
    const yearData=catalog.years[String(year)];
    if(!yearData||!Array.isArray(yearData.items))throw Error('YEAR_CATALOG_MISSING_'+year);
    for(const item of yearData.items){
      const id=truncate(item.id,8),key=year+':'+id;
      if(!ID.test(id)||seen.has(key))throw Error('DUPLICATE_OR_INVALID_QUESTION_'+key);
      seen.add(key);
      const raw=year===2026?q2026[id]:null;
      if(year===2026&&(!raw||!['choice','multi','grid','time'].includes(raw.kind)))throw Error('2026_METADATA_MISSING_'+id);
      const theme=themeFor(year,id),seed=THEMES[theme];
      const subitems=[],kind=raw?raw.kind:(year===2025&&/복수선택/.test(item.label)?'multi_unverified':'choice_unverified');
      if(raw&&kind==='grid'){
        if(!Array.isArray(raw.rows)||!raw.rows.length||!Array.isArray(raw.columns)||!raw.columns.length)throw Error('GRID_METADATA_MISSING_'+key);
        raw.rows.forEach((r,i)=>subitems.push({subId:'r'+String(i+1).padStart(2,'0'),label:typeof r==='string'?r:truncate(r.label||r.title||r.text,180),kind:'grid_row',choices:raw.columns.map(c=>typeof c==='string'?c:truncate(c.label||c.title||c.text,160))}));
      }else if(raw&&kind==='multi'){
        if(!Array.isArray(raw.options)||!raw.options.length)throw Error('MULTI_METADATA_MISSING_'+key);
        raw.options.forEach((option,i)=>subitems.push({subId:'o'+String(i+1).padStart(2,'0'),label:truncate(option,200),kind:'checkbox_option',choices:[]}));
      }
      if(raw&&kind==='choice'&&!Array.isArray(raw.options))throw Error('OPTIONS_MISSING_'+key);
      entries.push({
        key,year,id,title:truncate(item.label,200),group:truncate(item.group,100),
        sourcePrecision:raw?'full_2026_metadata':'public_label_only',
        questionText:raw?truncate(raw.question,600):null,
        description:raw?truncate(raw.description,500):null,
        responseKind:kind,
        choices:raw&&kind==='choice'?raw.options.map(x=>truncate(x,200)):[],
        subitems,
        theme,day:seed.day,scene:{place:seed.place,brief:seed.brief,passage:seed.scene,dialogue:seed.dialogue},
        schoolSpecificSensitive:SENSITIVE.has(key),
        storyRule:'하나의 학교에 대한 직접 사실이 아니라, 과거 공개 집계를 바탕으로 재구성할 수 있는 허구의 사건'
      });
    }
  }
  const missing=Object.entries(q2026).filter(([id])=>ID.test(id)&&!seen.has('2026:'+id)).map(([id])=>id);
  if(missing.length)issues.push({code:'2026_METADATA_WITHOUT_CATALOG',items:missing});
  return {schemaVersion:VERSION,catalogVersion:truncate(catalog.version,100),entries,coverage:{
    questionCount:entries.length,byYear:Object.fromEntries(YEARS.map(y=>[y,entries.filter(e=>e.year===y).length])),
    subitemCount:entries.reduce((n,e)=>n+e.subitems.length,0),
    unmappedQuestions:0,metadataIssues:issues
  }};
}
function eligibleSignal(record,world,byKey){
  if(!record||typeof record!=='object'||!world||!world.basic)return false;
  const year=Number(record.surveyYear),id=truncate(record.questionId,8),key=year+':'+id;
  if(!byKey.has(key)||!Array.isArray(world.publishedYears)||!world.publishedYears.includes(year))return false;
  if(record.schoolId!==world.basic.id||record.releaseStatus!=='APPROVED_AGGREGATE_ONLY')return false;
  if(record.reviewPolicy!=='N10_CELL3_PATTERNS5_STRICT_MATCH'||!(record.privacyMinRespondentsMet===true||Number(record.validResponseRows)>=10))return false;
  if(record.annualStatus!=='PUBLISHED'||record.privacyReviewed!==true)return false;
  if(year===2026&&record.manualReleaseApproved!==true)return false;
  if(byKey.get(key).schoolSpecificSensitive)return false;
  if(!truncate(record.modeOption,200))return false;
  return true;
}
function selectSignals(blueprint,world,records){
  const entries=new Map(blueprint.entries.map(e=>[e.key,e]));
  const accepted=[],seen=new Set(),rejected={};
  for(const r of (Array.isArray(records)?records:[])){
    const key=Number(r&&r.surveyYear)+':'+truncate(r&&r.questionId,8);
    if(!eligibleSignal(r,world,entries)){rejected[key]=(rejected[key]||0)+1;continue}
    const mode=truncate(r.modeOption,200),uniq=key;
    if(seen.has(uniq)){rejected[key]=(rejected[key]||0)+1;continue}
    seen.add(uniq);
    const item=entries.get(key);
    accepted.push({
      year:item.year,questionId:item.id,key:item.key,theme:item.theme,
      day:item.day,modeOption:mode,source:'approved_historical_aggregate',
      scene:item.scene,reviewPolicy:r.reviewPolicy,
      /* 과거 응답 결과이지 2027년 해당 학교 구성원의 실제 경험이 아님 */
      historicalOnly:true
    });
  }
  return {signals:accepted,rejectedCount:Object.values(rejected).reduce((a,b)=>a+b,0)};
}
/* Interpret only *approved* historical, non-sensitive 2026 questionnaire
 * modal options. This is a fictional story cue, NEVER a factual diagnosis of a
 * present-day school, a person, or an employment/assignment decision.
 * Unknown, neutral and low-confidence responses never trigger adverse cues.
 */
function fictionalContextFromSignals(signals){
 const byId=new Map(signals.filter(s=>s.year===2026).map(s=>[s.questionId,s.modeOption]));
 const positive=new Set(['그렇다','매우 그렇다']);
 const negative=new Set(['그렇지 않다','전혀 그렇지 않다']);
 const is=(id,kind)=>{const value=byId.get(id);return (kind==='high'?positive:negative).has(value)};
 const allocationConcern=is('Q06','low')||is('Q07','low')||is('Q08','high')||is('Q09','low');
 // Distinct corroborating question IDs; do not turn a single response into a hostile school.
 const concerning=['Q04','Q06','Q07','Q08','Q09'].filter(id=>
  (id==='Q04'||id==='Q08')?is(id,'high'):is(id,'low'));
 const supportive=['Q04','Q06','Q07','Q08','Q09'].filter(id=>
  (id==='Q04'||id==='Q08')?is(id,'low'):is(id,'high'));
 const cooperationCue=concerning.length>=2&&allocationConcern?'coordination_story':
  supportive.length>=2?'support_story':'neutral';
 return Object.freeze({
  source:signals.length?'approved_historical_aggregate':'fictional_general',
  boundary:'fictional_story_only',
  // No actual teacher's duty or a factual allegation may be inferred.
  assignmentCue:is('Q08','high')?'newcomer_assignment_story':'neutral',
  cooperationCue,
  socialCue:is('Q01','low')?'choice_pressure_story':'neutral',
  note:'공개·검증된 과거 설문 최다선택 결과로 창작 장면의 소재만 조정합니다. 현재 학교의 실제 업무분장·갈등·교직원을 단정하지 않습니다.'
 });
}

function scenePlan(blueprint,world,approvedSignals){
  const signals=selectSignals(blueprint,world,approvedSignals).signals;
  const scenes=[];
  const slots=[1,2,3,4,5,6,7];
  for(const day of slots){
    const candidates=signals.filter(s=>s.day===day);
    const preferred=candidates[0];
    const fallback=blueprint.entries.find(e=>e.day===day&&!e.schoolSpecificSensitive);
    const seed=preferred?preferred.scene:fallback?fallback.scene:THEMES.future;
    scenes.push({day,place:seed.place,brief:seed.brief,passage:seed.passage||seed.scene,dialogue:seed.dialogue,
      basis:preferred?'approved_historical_aggregate':'fictional_general',
      questionKey:preferred?preferred.key:null,
      historicalMode:preferred?preferred.modeOption:null,
      note:'2027년 3월 8~14일을 배경으로 한 허구. 과거 통계는 현재 사실이나 특정 인물의 발언이 아님.'});
  }
  return {schemaVersion:VERSION,schoolId:world.basic.id,scenes,
      approvedSignals:signals.length,fictionalContext:fictionalContextFromSignals(signals)};
}
const api=Object.freeze({VERSION,THEMES,TOPIC_IDS,createBlueprint,selectSignals,fictionalContextFromSignals,scenePlan});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryNarrative=api;
})(typeof window!=='undefined'?window:globalThis);
