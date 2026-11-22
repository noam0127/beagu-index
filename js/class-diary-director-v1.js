/* 4단계 연출 감독: 다음 날에 전날의 선택이 남도록 하는 순수 서사 변환기.
 * 브라우저 저장·점수 전송·개별 교사 데이터 사용 금지.
 */
(function(root){
'use strict';
const VERSION='class-diary-director/v2';
const routes=(typeof module==='object'&&module.exports)
 ?require('./class-diary-character-routes-v1.js')
 :root.BeaguClassDiaryCharacterRoutes;
if(!routes||typeof routes.chapterMoment!=='function')throw Error('CHARACTER_ROUTES_REQUIRED');
const BRIDGES=Object.freeze({
  "2": {
    "ask": "어제 나눠 보던 업무분장표가 떠올랐다. 오늘 회의 자료를 펼치면서도 괜히 한 번 더 확인했다. 이제는 모르는 걸 물어보는 일이 조금 덜 어렵다.",
    "carry": "전날 혼자 챙긴 주안 출력물이 학년연구실 책상에 그대로 있었다. 아침에 커피까지 쏟을 뻔했다. 회의에서는 오늘만큼은 입을 다물지 말자고 마음먹었다.",
    "share": "어제 복합기 앞에서 {colleague}과 웃던 일이 생각났다. 회의가 길어지자 옆을 돌아봤다. 마침 그 사람도 나를 보고 있었다."
  },
  "3": {
    "reopen": "어제 회의 때 한 말이 머리에 남아 있었다. 아이들 의견을 듣자고 했으니 오늘은 정말 물어봐야 할 차례였다.",
    "private": "학년연구실에서 {colleague}에게만 털어놓았던 말을 떠올렸다. 아이들 앞에서는 나도 너무 늦게 말하는 어른이 되지 않고 싶었다.",
    "follow": "어제는 정해진 규칙대로 하겠다고 했다. 그런데 오늘 급식 줄을 묻는 아이 앞에서는 그 대답이 썩 간단하지 않았다."
  },
  "4": {
    "council": "어제 아이들이 정한 줄서기 방법은 아직 칠판 구석에 적혀 있었다. 나는 그 아래에 날짜를 하나 더 써 놓았다. 며칠 뒤 다시 물어보려고.",
    "trial": "아이들은 오늘도 급식 줄을 바꿔 서 보자고 졸랐다. 내일 해 보자고 달랬는데, 그 얼굴들이 자꾸 떠올랐다.",
    "explain": "아이들이 왜냐고 물었을 때 나는 안전 때문이라고 답했다. 하지만 왜 꼭 그 방법이어야 하느냐는 질문에는 아직 답하지 못했다."
  },
  "5": {
    "together": "어제 메모 두 장을 같이 들여다보던 {colleague}이 떠올랐다. 오늘 학년연구실로 들어오자 그 사람이 먼저 손을 들었다.",
    "listen": "어제 아이들에게서 들은 말들이 계속 마음에 남았다. 오늘 {colleague}이 말을 시작했을 때도 나는 서두르지 않고 끝까지 들었다.",
    "alone": "어제는 전화를 끊고 나서야 {colleague}에게 연락했다. 그 사람이 화를 내지 않고 “일단 앉아요”라고 했던 게 자꾸 생각났다."
  },
  "6": {
    "invite": "어제 교문을 지나 한참을 함께 걸었다. 오늘 아침에도 그 길을 떠올렸다. 별말 없이 걷던 때가 이상하게 선명했다.",
    "choice": "어제 저녁을 먹으러 가는 사람들을 배웅하고 곧장 집에 왔다. 오래 잔 것도 아닌데 토요일 아침은 한결 가뿐했다.",
    "rest": "어제 컴퓨터를 끄고 바로 퇴근했다. 아침에 눈을 뜨자마자 업무 메신저부터 열지 않은 건 정말 오랜만이었다."
  },
  "7": {
    "coffee": "어제 카페에서 {colleague}이 웃으면서 말한 책 제목을 자꾸 떠올렸다. 주안 얘기를 하지 않고도 시간이 그렇게 빨리 갈 줄 몰랐다.",
    "letter": "어제 보낸 짧은 메시지와 돌아온 답장. 별것 아닌 문장인데도 수첩을 펼치는 손끝에 그 말이 따라왔다.",
    "offline": "어제는 휴대전화를 한 번도 꺼내지 않고 책을 읽었다. 누군가의 답장을 기다리지 않는 시간도 내겐 소중했다."
  }
});
const RELATIONSHIPS=Object.freeze({
  woman:{name:'지윤 선생님',initial:'윤',style:'차분하게 귀 기울이는 동학년 동료',caption:'주변을 먼저 살피지만 자기 생각도 분명히 말하는 사람'},
  man:{name:'현우 선생님',initial:'우',style:'사소한 농담으로 긴장을 덜어 주는 동학년 동료',caption:'농담 뒤에 중요한 이야기를 그냥 흘려보내지 않는 사람'},
  none:{name:'민서 선생님',initial:'민',style:'중식 요리의 순서처럼 수업을 설계하는 동학년 동료',caption:'중식 요리를 좋아하고 교실의 질문을 정확하게 기록하는 교사'},
  man2:{name:'도겸 선생님',initial:'겸',style:'실뜨기와 섬세한 협업을 좋아하는 동학년 교사',caption:'차도겸 · 잘생긴 외모보다 손으로 만드는 배움을 소중히 여기는 교사'},
  man3:{name:'태오 선생님',initial:'태',style:'배구를 즐기며 팀의 움직임을 살피는 동학년 교사',caption:'백태오 · 승패에 몰입하다가도 소외된 아이가 참여할 길을 찾는 교사'}
});
const VISUAL=Object.freeze([
  {id:'morning',label:'아침의 교무실',theme:'dawn'},
  {id:'meeting',label:'방과 후 교직원전체회의',theme:'paper'},
  {id:'classroom',label:'모둠 활동이 한창인 교실',theme:'class'},
  {id:'hallway',label:'보호자 상담을 앞둔 복도',theme:'haze'},
  {id:'evening',label:'주안을 마무리하는 금요일 학년연구실',theme:'dusk'},
  {id:'weekend',label:'토요일의 거리',theme:'rest'},
  {id:'night',label:'일요일의 책상',theme:'night'}
]);
function address(state){
 const engine=root.BeaguClassDiaryPlay;
 if(engine&&typeof engine.playerAddress==='function')return engine.playerAddress(state);
 const fallback=state&&state.profile&&state.profile.name||'다온';
 return fallback+' 선생님';
}
const COLLEAGUE_GREETINGS=Object.freeze({
  "1": "주안 올리셨어요? 아직이면 제가 파일 확인해 드릴게요.",
  "2": "아까 학년회의 때 하시려던 말씀, 아직 안 하셨죠?",
  "3": "오늘 아이들이 뭐라고 했는지 나중에 들려주세요.",
  "4": "보호자 연락 많이 힘드셨죠? 잠깐 앉으세요.",
  "5": "주안 확인 끝나셨어요? 같이 퇴근할까요?"
});
function prevChoice(state){
  if(!state||!Array.isArray(state.history)||state.day<2)return null;
  const record=state.history.find(x=>x&&x.day===state.day-1);
  return record&&typeof record.choiceId==='string'?record.choiceId:null;
}
function dynamicLine(state){
 if(!state||!state.stats||!state.profile)return '';
 if(state.day===1)return '처음 나눈 말은 대부분 잊어버리게 마련인데, 그날의 목소리는 이상하게 귀에 남았다.';
 if(state.profile.partner==='none')return state.stats.trust>=63?
   '학년연구실에서 마주치면 먼저 농담을 건네는 사이가 됐다. 바쁜 날에는 말 없이 프린터 용지를 채워 주기도 했다.':
   '아직 서로 모르는 것이 많았다. 그래도 옆자리에서 함께 일하는 사람이라는 게 조금씩 익숙해졌다.';
 if(state.stats.affection>=62&&state.stats.trust>=62)
   return '복도에서 발소리가 들리면 저도 모르게 고개를 들었다. 예상한 얼굴이 나타나면 별일 아닌 척 화면으로 시선을 돌렸다.';
 if(state.stats.affection>=52)
   return '오늘은 그 사람에게 무슨 이야기를 할까. 사소한 질문을 하나 골라 두고도 정작 마주치면 잊어버렸다.';
 if(state.stats.trust<50)
   return '말이 끊기면 괜히 자료를 정리했다. 아직은 서로의 침묵이 조금 낯설었다.';
 return '멀리서 눈이 마주쳤다. 서로 아는 사람을 만났다는 듯 고개를 살짝 끄덕였다.';
}
function worldDetail(world,day){
  if(!world||!world.basic)return null;
  if(day===1){
    const n=world.numbers&&world.numbers.students;
    if(n&&n.status==='APPROVED'&&Number.isFinite(Number(n.value))&&n.referenceYear)
      return {label:'학교 규모',value:n.referenceYear+'년 기준 학생 '+Number(n.value).toLocaleString('ko-KR')+'명',source:'approved_official_fact'};
    return world.basic.scale?{label:'학교 규모',value:({small:'소규모',medium:'중규모',large:'대규모'})[world.basic.scale],source:'approved_school_world'}:null;
  }
  if(day===3){
    const c=world.numbers&&world.numbers.classes;
    if(c&&c.status==='APPROVED'&&Number.isFinite(Number(c.value))&&c.referenceYear)
      return {label:'학교 규모',value:c.referenceYear+'년 기준 '+Number(c.value)+'학급',source:'approved_official_fact'};
  }
  if(day===6){
    const tags=world.geography&&world.geography.tags;
    if(Array.isArray(tags)){
      const t=tags.find(x=>x.source==='official_address'&&['admin_eup','admin_myeon','admin_dong'].includes(x.id));
      if(t)return {label:'행정 구역',value:t.label+' · 주소에서 확인',source:'official_address'};
    }
  }
  return null;
}
function decorateChapter(state,world,base){
  if(!state||!base||!Array.isArray(base.paragraphs)||state.phase!=='chapter')throw Error('VALID_CHAPTER_REQUIRED');
  if(state.day!==base.day||state.schoolId!==world.basic.id)throw Error('WRONG_STORY_STATE');
  const copy={...base,paragraphs:base.paragraphs.slice(),choices:base.choices.map(c=>({...c}))};
  const previous=prevChoice(state);
  const callback=previous&&BRIDGES[state.day]&&BRIDGES[state.day][previous];
  const colleague=(RELATIONSHIPS[state.profile.partner]||RELATIONSHIPS.none).name;
  /* Workday greetings address the player by name; nickname is earned, never imposed. */
  if(state.day<=5){
    const greeting=routes.greeting(state);
    if(greeting)copy.paragraphs.splice(1,0,colleague+'이 내 쪽을 보고 말했다. “'+
      address(state)+', '+greeting+'”');
  }
  if(callback)copy.paragraphs.splice(1,0,callback.replace(/\{colleague\}/g,colleague));
  const relationship=routes.relationshipMoment(state);
  const moment=routes.chapterMoment(state);
  if(moment)copy.paragraphs.push(moment);
  if(relationship)copy.paragraphs.push(relationship);
  if(state.day>=6&&state.stats&&Number.isFinite(Number(state.stats.support))){
    const remembered=state.stats.support>=55?
      '학교를 떠나온 주말에도 힘이 남아 있었다. 함께 주안을 맞추고 아이들 일을 의논해 준 동료들이 있어서, 월요일이 아주 막막하지만은 않았다.':
      '학교 밖인데도 학년연구실에서 들은 말이 자꾸 떠올랐다. 어른들끼리 서로 적대하는 분위기에서 교실의 하루까지 지켜 내는 일은 쉽지 않았다. 그건 내 능력만의 문제가 아니었다.';
    copy.paragraphs.splice(Math.min(2,copy.paragraphs.length),0,remembered);
  }
  const profile=RELATIONSHIPS[state.profile.partner]||RELATIONSHIPS.none;
  return {
    ...copy,directionVersion:VERSION,character:{...profile},
    visual:{...VISUAL[state.day-1]},
    worldDetail:worldDetail(world,state.day),
    callbackFrom:callback?previous:null,
    relationshipCue:relationship
  };
}
function decorateOutcome(state){
  if(!state||state.phase!=='reflection'||!state.lastOutcome)throw Error('REFLECTION_REQUIRED');
  const base=state.lastOutcome;
  const lowEnergy=state.stats.fatigue>=65;
  const trust=state.stats.trust;
  const text=lowEnergy?
    '책상에 팔을 올리고 잠깐 눈을 감았다. 복도에서는 아이들이 웃으며 지나가고 있었다.':
    trust>=65?'복도에서 {colleague}의 목소리가 들렸다. 나도 모르게 얼굴을 들었다.':
    '한참 뒤에야 아까 하지 못한 말이 떠올랐다. 나는 메모지 한 귀퉁이에 짧게 적어 두었다.';
  const line=typeof base.line==='string'&&base.line.startsWith('“')?
    '“'+address(state)+', '+base.line.slice(1):base.line;
  const unique=routes.outcomeMoment(state);
  const extra=unique?[unique]:[];
  return {paragraphs:base.paragraphs.concat(text.replace(/\{colleague\}/g,(RELATIONSHIPS[state.profile.partner]||RELATIONSHIPS.none).name),...extra),line,
    cue:lowEnergy?'휴식이 필요한 때':trust>=65?'쌓여 가는 신뢰':'다음 날을 위한 여백'};
}
function decorateEnding(state){
  if(!state||state.phase!=='ending'||!state.ending)throw Error('ENDING_REQUIRED');
  const choices=state.history.map(x=>x.choiceId);
  const contributed=choices.includes('council')?
    '수첩을 덮기 전에 아이들이 고른 줄서기 방법을 다시 읽었다. 내일은 아이들한테도 잘 지냈는지 물어봐야겠다.':
    '아이들 말을 제대로 듣지 못한 순간도 떠올랐다. 내일은 누가 손을 들면 조금 더 기다려 보기로 했다.';
  const energy=state.stats.fatigue>=60?
    '어깨가 뻐근했다. 책상 앞에 더 앉아 있어도 아무것도 달라질 것 같지 않았다. 나는 불을 끄고 침대로 향했다.':
    '내일 입을 옷을 꺼내 의자에 걸었다. 조금 이르지만 잠자리에 들고 싶었다.';
  const workplace=state.profile.workCulture;
  const support=Number(state.stats.support);
  const relationship=workplace==='hostile'?
    (support>=35?
      '학년연구실에서 마음 상하는 말을 들은 날에도 {colleague}은 내 옆에 의자를 가져왔다. 그날만큼은 누군가의 얼굴이 오래 남았다.':
      '학년연구실로 들어서는 일이 두려웠던 날도 있었다. 다음 주에는 혼자 말고 다른 선생님과 업무를 의논할 시간을 만들어 봐야겠다.') :
    workplace==='collaborative'?
      '아침에 학년연구실에 들어서면 누군가 먼저 “커피 드실래요?” 하고 물었다. 그 말이 있는 날은 컴퓨터를 켜는 손도 조금 가벼웠다.':
      '서로 바쁜 얼굴로 앉아 있던 날들이 지나갔다. 언젠가 우리도 조금은 웃으면서 업무를 나눌 수 있을까.';
  const unique=routes.endingMoment(state);
  return {...state.ending,paragraphs:state.ending.paragraphs.concat(contributed,energy,relationship.replace(/\{colleague\}/g,(RELATIONSHIPS[state.profile.partner]||RELATIONSHIPS.none).name),...(unique?[unique]:[])),directorVersion:VERSION};
}
const api=Object.freeze({
 VERSION,BRIDGES,VISUAL,RELATIONSHIPS,
 decorateChapter,decorateOutcome,decorateEnding,worldDetail
});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryDirector=api;
})(typeof window!=='undefined'?window:globalThis);
