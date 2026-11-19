/* 4단계 연출 감독: 다음 날에 전날의 선택이 남도록 하는 순수 서사 변환기.
 * 브라우저 저장·점수 전송·개별 교사 데이터 사용 금지.
 */
(function(root){
'use strict';
const VERSION='class-diary-director/v1';
const BRIDGES=Object.freeze({
  2:{
    ask:'전날 나는 서류를 혼자 떠안지 않기로 했다. 누가 어떤 일을 맡는지 확인했던 그 짧은 대화가 오늘 회의에서도 떠올랐다.',
    carry:'전날 가방에 넣어 둔 서류가 아직 끝나지 않았다. 부탁을 받으면 거절하지 못하는 버릇이 내 의견까지 흐리게 만들고 있었다.',
    share:'복합기 앞에서 시작한 이야기는 복도에서도 이어졌다. 몇 마디 나누고 나니, 말할 자리가 아주 없는 학교는 아니라는 생각이 들었다.'
  },
  3:{
    reopen:'전날 회의록에 ‘재논의’라는 말을 남겼다. 아이들 앞에서 그 말을 지킬 수 있을지, 오늘은 내가 시험받는 기분이었다.',
    private:'회의가 끝난 뒤 조용히 꺼낸 의견은 아직 답을 찾지 못했다. 그래도 처음부터 큰 소리로 말해야만 변화가 시작되는 건 아니었다.',
    follow:'어제는 이미 정해진 대로 따랐다. 그 결정이 편했던 만큼, 오늘 아이에게서 들은 질문이 오래 남을 것 같았다.'
  },
  4:{
    council:'어제 아이들이 자기 말로 만든 약속이 교탁에 놓여 있었다. 누구의 말을 먼저 듣는지가 오늘도 중요해질 것 같았다.',
    trial:'어제 정한 시범 운영표가 칠판 옆에 붙어 있었다. 하나의 답을 정하지 않았다는 사실이 이상하게 마음을 놓이게 했다.',
    explain:'아이들에게 규칙의 이유를 설명한 뒤에도 질문은 끝나지 않았다. 오늘만큼은 대답보다 듣는 시간을 길게 가져야겠다고 생각했다.'
  },
  5:{
    together:'어제는 혼자 상담실 문을 열지 않았다. 옆에서 메모해 주던 동료의 손이 마음에 남았다.',
    listen:'아이들 말을 끊지 않고 들었던 어제가 계속 떠올랐다. 사람 사이의 속도를 내 마음대로 정할 수 없다는 사실을 새삼 깨달았다.',
    alone:'상담을 혼자 맡았던 탓인지 피로가 쉽게 가시지 않았다. 뒤늦게 부탁한 도움은 결코 늦은 부탁이 아니었다.'
  },
  6:{
    invite:'어제 교문 밖으로 나와 함께 걸었다. 별말 없는 순간에도 발걸음이 어색하지 않았다는 것이 뜻밖이었다.',
    choice:'어제는 모임에 가지 않는 사람의 선택을 존중하자고 말했다. 누군가 내게 고맙다고 했고, 그 한마디가 오래 남았다.',
    rest:'어제는 다른 약속보다 내 시간을 먼저 지켰다. 집으로 돌아오는 길에 받은 짧은 인사가 생각보다 따뜻했다.'
  },
  7:{
    coffee:'어제 마신 차의 온도와 나눴던 책 이야기가 떠올랐다. 함께 보낸 시간에 거창한 이름을 붙일 필요는 없었다.',
    letter:'어제 보낸 감사 메시지의 문장을 다시 읽었다. 지나치게 많은 말을 하지 않아도 사람은 서로에게 도착할 수 있었다.',
    offline:'어제는 휴대전화를 멀리 두었다. 사람을 좋아하는 마음과 홀로 쉬고 싶은 마음이 꼭 모순되는 것은 아니었다.'
  }
});
const RELATIONSHIPS=Object.freeze({
  woman:{name:'지윤 선생님',initial:'윤',style:'차분하게 귀 기울이는 동학년 동료',caption:'주변을 먼저 살피지만 자기 생각도 분명히 말하는 사람'},
  man:{name:'현우 선생님',initial:'우',style:'사소한 농담으로 긴장을 덜어 주는 동학년 동료',caption:'농담 뒤에 중요한 이야기를 그냥 흘려보내지 않는 사람'},
  none:{name:'동학년 선생님',initial:'동',style:'서로의 일을 존중하는 동학년 동료',caption:'연애를 전제로 하지 않고 함께 성장하는 관계'}
});
const VISUAL=Object.freeze([
  {id:'morning',label:'아침의 교무실',theme:'dawn'},
  {id:'meeting',label:'늦은 오후의 협의실',theme:'paper'},
  {id:'classroom',label:'아이들이 돌아간 교실',theme:'class'},
  {id:'hallway',label:'조용해진 복도',theme:'haze'},
  {id:'evening',label:'금요일의 퇴근길',theme:'dusk'},
  {id:'weekend',label:'토요일의 거리',theme:'rest'},
  {id:'night',label:'일요일의 책상',theme:'night'}
]);
function prevChoice(state){
  if(!state||!Array.isArray(state.history)||state.day<2)return null;
  const record=state.history.find(x=>x&&x.day===state.day-1);
  return record&&typeof record.choiceId==='string'?record.choiceId:null;
}
function dynamicLine(state){
  if(!state||!state.stats||!state.profile)return '';
  if(state.day===1)return '낯선 사람과 가까워지는 데에는 저마다 다른 속도가 있다.';
  const partner=state.profile.partner;
  if(partner==='none'){
    if(state.stats.trust>=63)return '일을 함께 해결한 사람과는 말이 길어지지 않아도 어색하지 않았다. 그 신뢰를 연애라고 부를 이유는 없었다.';
    return '나란히 일하는 사람에게도 지켜 주고 싶은 거리가 있었다. 나는 그 거리부터 존중하기로 했다.';
  }
  if(state.stats.affection>=62&&state.stats.trust>=62)return '그 사람의 발걸음 소리가 익숙해졌다. 익숙함이 허락을 대신할 수는 없다는 사실도 함께 기억했다.';
  if(state.stats.affection>=52)return '괜히 더 물어보고 싶은 이야기가 생겼다. 그렇지만 지금은 질문 하나를 아껴 두기로 했다.';
  if(state.stats.trust<50)return '우리는 아직 서로의 말을 더 들어야 했다. 가까워지는 일에는 답을 재촉하지 않는 태도가 필요했다.';
  return '그 사람과 나 사이에는 말을 건넬 수 있을 만큼의 거리가 생겨 있었다.';
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
  if(callback)copy.paragraphs.splice(1,0,callback);
  const relationship=dynamicLine(state);
  if(relationship)copy.paragraphs.push(relationship);
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
    '몸이 무거웠다. 잘하려는 마음만으로는 쉬어야 할 시간을 대신할 수 없었다.':
    trust>=65?'다음 날의 고민을 혼자 하지 않아도 된다는 사실이 조금 든든했다.':
    '그날의 선택은 아직 끝난 일이 아니었다. 나는 다음에 할 말을 천천히 골랐다.';
  return {paragraphs:base.paragraphs.concat(text),line:base.line,
    cue:lowEnergy?'휴식이 필요한 때':trust>=65?'쌓여 가는 신뢰':'다음 날을 위한 여백'};
}
function decorateEnding(state){
  if(!state||state.phase!=='ending'||!state.ending)throw Error('ENDING_REQUIRED');
  const choices=state.history.map(x=>x.choiceId);
  const contributed=choices.includes('council')?
    '아이들이 자기 목소리로 고른 약속이 내 수첩에 남았다.':'아이들의 질문을 끝까지 듣지 못했던 순간도 있었다. 다음에는 그 질문 앞에 조금 오래 서 있기로 했다.';
  const energy=state.stats.fatigue>=60?
    '피로가 쌓인 일주일이었다. 마음을 다했다는 이유로 나를 끝까지 소모해서는 안 된다고 생각했다.':
    '쉬어야 할 때를 잊지 않은 덕분에, 내일 다시 시작할 힘이 남아 있었다.';
  return {...state.ending,paragraphs:state.ending.paragraphs.concat(contributed,energy),directorVersion:VERSION};
}
const api=Object.freeze({
 VERSION,BRIDGES,VISUAL,RELATIONSHIPS,
 decorateChapter,decorateOutcome,decorateEnding,worldDetail
});
if(typeof module==='object'&&module.exports)module.exports=api;
root.BeaguClassDiaryDirector=api;
})(typeof window!=='undefined'?window:globalThis);
