/* 『나의 OO한 학급일지』 2단계: 설문 문항 -> 문학적 사건 설계.
 * 출처: public-statistics-question-catalog-v1.json 및 2026 원문 메타데이터.
 * 학교별 실응답을 이 모듈에 넣지 않는다. 별도 승인 API만 사용한다.
 */
(function(root){
'use strict';
const VERSION='class-diary-narrative/v1';
const YEARS=[2023,2024,2025,2026];
const THEMES=Object.freeze({
  community:{day:5,place:'교무실 옆 작은 탁자',brief:'관계의 거리',scene:'종이컵을 건네려던 손이 잠깐 멈췄다. 누군가는 함께하자고 말했고, 누군가는 오늘만은 집에 가고 싶었다.',dialogue:'“같이하는 것도 좋지만, 빠질 수 있는 것도 중요하잖아요.”'},
  autonomy:{day:2,place:'학년 협의실',brief:'말할 수 있는 자리',scene:'회의록에는 모두 동의한 것으로 적혀 있었다. 아직 아무 말도 하지 않은 사람이 셋이나 남아 있었다.',dialogue:'“다른 생각이 있다면, 지금 이야기해도 될까요?”'},
  workload:{day:1,place:'교무실 복합기 앞',brief:'누구의 일인가',scene:'복합기가 다 뱉지 못한 서류를 물고 멈췄다. 그 종이 위에는 아직 담당자의 이름이 적혀 있지 않았다.',dialogue:'“이 일은 누가 맡는 게 맞는지부터 정해야겠어요.”'},
  governance:{day:3,place:'교직원 회의실',brief:'결정의 무게',scene:'칠판에는 결정 사항만 남았다. 결정에 이르기까지의 망설임은 어느 칸에도 적히지 않았다.',dialogue:'“결정을 다시 살펴볼 수 있는 방법도 남겨 두죠.”'},
  student:{day:4,place:'교실 뒤편',brief:'한 아이를 위한 시간',scene:'종례가 끝나고도 한 아이가 자리에서 일어나지 않았다. 선생님은 열려 있던 출석부를 조용히 덮었다.',dialogue:'“우리가 함께 방법을 찾아보면 좋겠어.”'},
  guardians:{day:4,place:'상담실 앞 복도',brief:'다른 말의 온도',scene:'휴대전화의 진동이 멎은 뒤에도 화면은 한참 밝았다. 한 사람이 모두의 말을 대신 듣게 해서는 안 된다는 생각이 들었다.',dialogue:'“이 이야기는 저 혼자 답하기 어려울 것 같습니다.”'},
  safety:{day:4,place:'교실 밖 복도',brief:'안전한 거리',scene:'복도 끝에서 발걸음이 멎었다. 누구를 탓하기 전에, 다음 수업을 어떻게 지킬지 정해야 했다.',dialogue:'“먼저 아이들과 선생님이 안전하게 지낼 방법을 찾죠.”'},
  event:{day:5,place:'운동장과 교실 사이',brief:'학교의 하루',scene:'운동장에 선이 그어지는 동안 교실에는 책상 하나가 남아 있었다. 즐거운 날에도 누군가의 준비는 끝나지 않았다.',dialogue:'“행사 뒤에 남는 일도 함께 나누죠.”'},
  wellbeing:{day:6,place:'교사 연구실 창가',brief:'쉴 수 있는 자리',scene:'차가 식는 데는 오래 걸리지 않았다. 마실 틈을 내는 데는 생각보다 긴 시간이 필요했다.',dialogue:'“잠깐 쉬는 시간을 부탁해도 될까요?”'},
  facilities:{day:2,place:'자료실 문 앞',brief:'공간이 하는 말',scene:'문을 열자 오래된 상자와 새로 온 물품이 한 칸에 섞여 있었다. 필요한 것은 늘 가장 나중에 발견되었다.',dialogue:'“있는 물건부터 제대로 쓸 수 있게 정리해 볼까요?”'},
  future:{day:7,place:'학교 정문',brief:'내년을 생각하다',scene:'교문을 나서는 길에 겨울 끝의 바람이 불었다. 남을지 떠날지는 아직 정해지지 않았지만, 오늘의 마음은 분명했다.',dialogue:'“내년에는 어떤 학교에서 일하고 싶으세요?”'},
  classroom:{day:3,place:'교실 앞 교탁',brief:'수업의 리듬',scene:'시간표의 마지막 칸이 비어 있었다. 교실의 하루는 칸 수보다 훨씬 길었다.',dialogue:'“아이들과 지낼 시간은 우리가 지켜야죠.”'}
});
/* 번호는 반드시 연도와 함께 해석한다. 연도별 문항의 의미는 서로 다르다. */
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
  '2023:Q10','2024:Q10','2025:Q06','2025:Q09','2025:Q29','2025:Q30',
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
  if(record.reviewPolicy!=='N10_CELL3_PATTERNS5_STRICT_MATCH'||Number(record.validResponseRows)<10)return false;
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
  return {schemaVersion:VERSION,schoolId:world.basic.id,scenes,approvedSignals:signals.length};
}
const api=Object.freeze({VERSION,THEMES,TOPIC_IDS,createBlueprint,selectSignals,scenePlan});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryNarrative=api;
})(typeof window!=='undefined'?window:globalThis);
